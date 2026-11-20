import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { computeOutputs } from "./outputs";
import { cadModel, screwPlaces } from "./io/cad_model";
import { fabrication } from "./io/fabrication";
import { at } from "./geometry";
import type { Vec3 } from "./geometry";
import { dresser, tvWall } from "./templates";
import { fixedInTurn, type GammeRow, type GammeTable } from "./io/gamme";
import { CAD_MODELS } from "../data/cad_models";
import type { Part, Hole } from "./part_types";
import type { Carcass, Project } from "./model";
import { AXILO_FEET } from "../data/hardware";
import { sawSize } from "./bom";

// The 2 pieces checked as built and as assembled, each test written to fail on the fault it names

const PIECES = [["tvWall", tvWall], ["dresser", dresser]] as const;


function gammeOf(make: () => Project): GammeTable[]
{
    const project = make();
    return (cadModel(project, computeOutputs(project), true) as { gamme: GammeTable[] }).gamme;
}


function indexOf(rows: GammeRow[], test: (row: GammeRow) => boolean): number[]
{
    return rows.map((row, k) => { return test(row) ? k : -1; }).filter((k) => { return k >= 0; });
}


// The room points of a board's corners, the smallest and largest on each axis
function boxOf(part: Part): { lo: Vec3; hi: Vec3 }
{
    const corners = [at(part.frame!, 0, 0, 0), at(part.frame!, part.length, part.width, part.thickness)];
    const lo = [0, 1, 2].map((axis) => { return Math.min(corners[0]![axis]!, corners[1]![axis]!); }) as Vec3;
    const hi = [0, 1, 2].map((axis) => { return Math.max(corners[0]![axis]!, corners[1]![axis]!); }) as Vec3;
    return { lo, hi };
}


// The axis of a drilling in the room : where it enters and the way it runs, into the board
function drillAxis(part: Part, hole: Hole): { from: Vec3; way: Vec3 }
{
    const frame = part.frame!;
    const neg = (v: Vec3): Vec3 => { return [-v[0], -v[1], -v[2]]; };
    const middle = hole.w ?? part.thickness / 2;
    switch (hole.face)
    {
        case "A": return { from: at(frame, hole.u, hole.v, 0), way: frame.n };
        case "B": return { from: at(frame, hole.u, hole.v, part.thickness), way: neg(frame.n) };
        case "u0": return { from: at(frame, 0, hole.v, middle), way: frame.u };
        case "u1": return { from: at(frame, part.length, hole.v, middle), way: neg(frame.u) };
        case "v0": return { from: at(frame, hole.u, 0, middle), way: frame.v };
        default: return { from: at(frame, hole.u, part.width, middle), way: neg(frame.v) };
    }
}


function distanceToSegment(point: Vec3, from: Vec3, way: Vec3, length: number): number
{
    const rel = [point[0] - from[0], point[1] - from[1], point[2] - from[2]];
    const along = Math.max(0, Math.min(length, rel[0]! * way[0] + rel[1]! * way[1] + rel[2]! * way[2]));
    const foot = [from[0] + way[0] * along, from[1] + way[1] * along, from[2] + way[2] * along];
    return Math.hypot(point[0] - foot[0]!, point[1] - foot[1]!, point[2] - foot[2]!);
}


// A point turned about an axis through a pivot, Rodrigues' formula
function turned(point: Vec3, pivot: Vec3, axis: Vec3, degrees: number): Vec3
{
    const angle = degrees * Math.PI / 180;
    const rel = [point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]] as Vec3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = rel[0] * axis[0] + rel[1] * axis[1] + rel[2] * axis[2];
    const cross = [axis[1] * rel[2] - axis[2] * rel[1], axis[2] * rel[0] - axis[0] * rel[2], axis[0] *
                   rel[1] - axis[1] * rel[0]];
    return [0, 1, 2].map((k) =>
    {
        return pivot[k]! + rel[k]! * cos + cross[k]! * sin + axis[k]! * dot * (1 - cos);
    }) as Vec3;
}


describe("les deux meubles, fabriqués et montés", () =>
{
    it("perce chaque trou de face dans la pièce qui le porte", () =>
    {
        for (const [name, make] of PIECES)
        {
            const outside = analyse(make()).build.parts.flatMap((part) =>
            {
                return part.holes.filter((hole) =>
                {
                    return (hole.face === "A" || hole.face === "B") && (hole.u < -0.01 || hole.u > part.length + 0.01
                        || hole.v < -0.01 || hole.v > part.width + 0.01);
                }).map((hole) => { return `${name} : ${part.label}, ${hole.label} à u ${hole.u}`; });
            });
            expect(outside).toEqual([]);
        }
    });

    it("ne visse aucune liaison dans un perçage de l'étagère qu'elle tient", () =>
    {
        const build = analyse(tvWall()).build;
        const shelves = build.parts.filter((part) => { return part.role === "wallShelf" && part.frame !== null; });
        const met: string[] = [];
        for (const screw of screwPlaces(build.parts).filter((s) => { return /étagère murale/.test(s.label); }))
        {
            for (const shelf of shelves)
            {
                for (const hole of shelf.holes.filter((h) => { return h.diameter > 0 && h.purpose !== screw.purpose; }))
                {
                    const { from, way } = drillAxis(shelf, hole);
                    for (let step = 0; step <= screw.length; step++)
                    {
                        const point = [0, 1, 2].map((k) => { return screw.point[k]! - screw.out[k]! * step; }) as Vec3;
                        if (distanceToSegment(point, from, way, hole.depth) < hole.diameter / 2 + screw.diameter / 2)
                        {
                            met.push(`${screw.part} : ${screw.label} dans ${shelf.label}, ${hole.label}`);
                            break;
                        }
                    }
                }
            }
        }
        expect([...new Set(met)]).toEqual([]);
    });

    it("laisse sortir le tiroir derrière un abattant ouvert sans toucher les vérins de ses compas", () =>
    {
        const build = analyse(dresser()).build;
        const met: string[] = [];
        for (const pull of build.motions.filter((m) => { return m.after !== undefined && m.kind === "slide"; }))
        {
            const flap = build.motions.find((m) => { return m.front === pull.after && m.kind === "turn"; })!;
            const struts = build.fitted.filter((f) => { return f.item === pull.item && /\/verin$/.test(f.key); });
            expect(struts.length).toBeGreaterThan(0);
            // The way the flap turns is the one that brings a point over its pivot forward, out of the carcass
            const above: Vec3 = [flap.pivot[0], flap.pivot[1] + 100, flap.pivot[2]];
            const sign = turned(above, flap.pivot, flap.axis, flap.amount)[2] > flap.pivot[2] ? 1 : -1;
            const sides = build.parts.filter((part) => { return pull.parts.includes(part.id) &&
                                                        part.role === "boxSide"; });
            for (const strut of struts)
            {
                const ends = [-1, 1].map((end) =>
                {
                    return [0, 1, 2].map((k) => { return strut.centre[k]! + end * strut.axes[2][k]! *
                                                 strut.half[2]; }) as Vec3;
                });
                // Its lower end rides on the flap, the upper one stays on the side of the cell
                const [low, high] = ends[0]![1] < ends[1]![1] ? [ends[0]!, ends[1]!] : [ends[1]!, ends[0]!];
                const open = turned(low, flap.pivot, flap.axis, sign * flap.amount);
                const length = Math.hypot(open[0] - high[0], open[1] - high[1], open[2] - high[2]);
                const way = [0, 1, 2].map((k) => { return (open[k]! - high[k]!) / length; }) as Vec3;
                for (const side of sides)
                {
                    const { lo, hi } = boxOf(side);
                    for (let travel = 0; travel <= pull.amount; travel += 5)
                    {
                        const hit = Array.from({ length: Math.ceil(length) + 1 }, (_,
                            step) => { return step; }).some((step) =>
                        {
                            const point = [0, 1, 2].map((k) =>
                            {
                                return high[k]! + way[k]! * step - pull.axis[k]! * travel;
                            });
                            return point.every((v, k) => { return v > lo[k]! - strut.half[0] && v < hi[k]! +
                                                          strut.half[0]; });
                        });
                        if (hit)
                        {
                            met.push(`${side.label} touche ${strut.label} à ${travel} mm de course`);
                            break;
                        }
                    }
                }
            }
        }
        expect(met).toEqual([]);
    });

    it("calcule la flèche du dessus qui porte un autre caisson", () =>
    {
        // Both pieces listed before failing : one assertion per piece stopped at the first and never saw the other
        const missing: string[] = [];
        for (const [name, make] of PIECES)
        {
            const project = make();
            const result = analyse(project);
            const carcasses = project.items.filter((it) => { return it.kind === "carcass"; }) as Carcass[];
            for (const under of carcasses)
            {
                const over = carcasses.filter((it) =>
                {
                    return it !== under && Math.abs(it.y - (under.y + under.height)) < 1
                        && it.x < under.x + under.width && it.x + it.width > under.x;
                });
                const top = result.build.parts.find((part) => { return part.item === under.id && part.role === "top"; });
                if (over.length > 0 && top !== undefined &&
                    !result.deflections.some((d) => { return d.part === top.id; }))
                {
                    missing.push(`${name} : ${under.name} sous ${over.map((it) => { return it.name; }).join(", ")}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it("ne tient pas pour conforme un dessus simulé avec des fixations rigides, seulement pour indicatif", () =>
    {
        // Rigid welds give the least it can bend : under the limit points that way and proves nothing
        const result = analyse(dresser());
        const carried = result.checks.filter((c) => { return c.message.includes("vissé dessous"); });
        expect(carried.length).toBe(2);
        for (const check of carried)
        {
            expect(check.level, check.message).toBe("warning");
            const note = result.calcNotes.find((n) => { return n.subject.kind === "part" &&
                                                       n.subject.id === check.target; })!;
            expect(note.indicative).toBe(true);
            expect(note.verdict.startsWith("Indicatif")).toBe(true);
        }
    });

    it("ne cite plus la simulation d'un dessus dont le meuble a changé depuis", () =>
    {
        // Another carcass on the niche : the run worked out the high cupboards on it, not this
        const project = dresser();
        const high = project.items.find((it) => { return it.name === "Placards hauts"; })!;
        high.name = "Placards hauts modifiés";
        const result = analyse(project);
        const niche = project.items.find((it) => { return it.name === "Niche"; })!;
        const top = result.build.parts.find((part) => { return part.item === niche.id && part.role === "top"; })!;
        expect(result.deflections.some((d) => { return d.part === top.id; })).toBe(false);
        expect(result.checks.some((c) => { return c.level === "warning" && c.target === top.id
            && c.message.includes("flèche non calculée"); })).toBe(true);
    });

    it("clipse les pieds d'une colonne relevée avant de la glisser en place", () =>
    {
        const rows = gammeOf(dresser).at(-1)!.rows;
        const late = indexOf(rows, (row) => { return /^Poser les pieds une fois le meuble relevé/.test(row.operation); });
        expect(late.length).toBeGreaterThan(0);
        for (const k of late)
        {
            const code = /sur (#\w{3}) /.exec(rows[k]!.operation)![1]!;
            const set = indexOf(rows, (row) => { return row.operation.startsWith(`Mettre en place ${code}-000 `); });
            expect(set[0]!, code).toBeGreaterThan(k);
        }
    });

    it("cheville le mur une fois le meuble présenté, jamais à l'aveugle à travers son fond", () =>
    {
        for (const [name, make] of PIECES)
        {
            const rows = gammeOf(make).at(-1)!.rows;
            for (const k of indexOf(rows, (row) => { return /^Percer et cheviller le mur : .* sur #\w{3}-\d{3} Fond/.test(row.operation); }))
            {
                const code = /sur (#\w{3})-/.exec(rows[k]!.operation)![1]!;
                const set = indexOf(rows, (row) => { return row.operation.startsWith(`Mettre en place ${code}-000 `); });
                expect(set[0]!, `${name} ${code}`).toBeLessThan(k);
            }
        }
    });

    it("boulonne deux meubles l'un à l'autre avant de les visser au mur", () =>
    {
        for (const [name, make] of PIECES)
        {
            const rows = gammeOf(make).at(-1)!.rows;
            for (const k of indexOf(rows, (row) => { return /Vis de liaison, vis sur #\w{3}-/.test(row.operation); }))
            {
                // The later of the 2 is the last set in place before the bolt : it moves no more once on the wall
                const set = indexOf(rows, (row) => { return row.type === "Mise en place"; }).filter((j) => { return j < k; });
                const code = /^Mettre en place (#\w{3})-/.exec(rows[set.at(-1)!]!.operation)![1]!;
                const wall = indexOf(rows, (row) => { return row.type === "Vissage" &&
                                                     row.operation.startsWith("Fixer au mur")
                    && row.operation.includes(`sur ${code}-`); });
                expect(wall.every((j) => { return j > k; }), `${name} ${code}`).toBe(true);
            }
        }
    });

    it("clipse la plinthe d'un meuble sur pieds après le réglage de ses pieds", () =>
    {
        for (const [name, make] of PIECES)
        {
            const tables = gammeOf(make);
            const whole = tables.at(-1)!.rows;
            const levelled = new Set(whole.filter((row) => { return /^Régler à niveau les pieds/.test(row.operation); })
                .map((row) => { return row.pbs[0]!.slice(0, 4); }));
            const early = tables.slice(0, -1).flatMap((table) =>
            {
                return table.rows.filter((row) => { return /Plinthe avant, monté à l'établi/.test(row.operation)
                    && levelled.has(table.code.slice(0, 2) +
                                    "00"); }).map((row) => { return `${name} ${table.code} : ${row.operation}`; });
            });
            expect(early).toEqual([]);
        }
    });

    it("ne dit pas les portes déposées pour le réglage sans une étape qui les dépose", () =>
    {
        for (const [name, make] of PIECES)
        {
            const rows = gammeOf(make).at(-1)!.rows;
            const promised = rows.some((row) => { return /portes déposés/.test(row.comment); });
            const done = rows.some((row) => { return /^Déposer/.test(row.operation); });
            expect(!promised || done, name).toBe(true);
        }
    });

    it("pose les compas d'un abattant juste après lui, avant toute autre façade", () =>
    {
        for (const table of gammeOf(dresser))
        {
            const flaps = indexOf(table.rows, (row) => { return /Abattant tombant \d+, monté à l'établi/.test(row.operation); });
            for (const k of flaps)
            {
                const stays = indexOf(table.rows, (row) => { return /Compas 365\.01\.901/.test(row.operation); });
                const doors = indexOf(table.rows, (row) => { return /Porte \d+, monté à l'établi/.test(row.operation); });
                expect(doors.filter((j) => { return j > k && j < Math.min(...stays); }), table.code).toEqual([]);
            }
        }
    });

    it("dit dans les deux gammes qu'un panneau descendu au sol sous un meuble sur pieds peut s'ajuster sur place",
       () =>
    {
        const project = tvWall();
        const outputs = computeOutputs(project);
        const onFeet = new Set(project.items.filter((it) =>
        {
            return it.kind === "carcass" && (it.base.type === "plinth" || it.base.type === "feet");
        }).map((it) => { return it.id; }));
        const grounded = outputs.analysis.build.parts.filter((part) =>
        {
            return onFeet.has(part.item) && part.frame !== null && part.role !== "plinth" && boxOf(part).lo[1] < 1;
        });
        expect(grounded.length).toBeGreaterThan(0);
        const routes = fabrication(outputs.bom, outputs.nesting).routes;
        const rows = gammeOf(tvWall).flatMap((table) => { return table.rows; });
        for (const part of grounded)
        {
            const code = outputs.bom.codeOfPart.get(part.id)!;
            const route = routes.find((r) => { return r.code === code; })!;
            expect(route.steps.some((step) => { return /ajustement sur place/.test(step.spec); }),
                   part.label).toBe(true);
            expect(rows.some((row) => { return row.pbs[0]!.startsWith(code) &&
                                       /ajustement sur place/.test(row.comment); }),
                   part.label).toBe(true);
        }
    });

    it("laisse sous le plafond de quoi glisser une colonne sur un meuble bas monté au haut de ses pieds", () =>
    {
        const project = tvWall();
        const rows = gammeOf(tvWall).at(-1)!.rows;
        const base = project.items.find((it) => { return it.kind === "carcass" &&
                                                 it.name === "Meuble bas"; }) as Carcass;
        const height = base.base.type === "plinth" || base.base.type === "feet" ? base.base.height : 0;
        const foot = AXILO_FEET.find((f) => { return f.height === height; })!;
        for (const row of rows.filter((r) => { return /glissée vers le mur : \d+ mm sous le plafond/.test(r.comment); }))
        {
            const room = Number(/: (\d+) mm sous le plafond/.exec(row.comment)![1]);
            expect(room, row.operation).toBeGreaterThanOrEqual(foot.max - foot.height);
        }
    });

    it("achète le vernis qu'elle prescrit", () =>
    {
        const outputs = computeOutputs(tvWall());
        const fab = fabrication(outputs.bom, outputs.nesting);
        const varnished = fab.routes.some((route) => { return route.steps.some((step) => { return /Vernis/.test(step.spec); }); });
        expect(varnished).toBe(true);
        expect(fab.supplies.some((supply) => { return /[Vv]ernis/.test(supply.label); })).toBe(true);
    });

    it("visse au mur à travers le fond une vis assez longue pour sa cheville, règle fischer", () =>
    {
        for (const [name, make] of PIECES)
        {
            const outputs = computeOutputs(make());
            const plug = outputs.bom.hardware.find((h) => { return /^PLUG_/.test(h.id); })!;
            const plugLength = Number(/x (\d+)/.exec(plug.label)![1]);
            const washer = outputs.bom.hardware.find((h) => { return /^WASHER_/.test(h.id); })!;
            const washerThickness = Number(/x (\d+(?:,\d+)?)\)/.exec(washer.label)![1]!.replace(",", "."));
            const backs = outputs.analysis.build.parts;
            for (const screw of screwPlaces(backs).filter((s) => { return s.purpose === "wall-screw"; }))
            {
                const board = backs.find((part) => { return part.label === screw.part; })!;
                // The fischer rule for a plug in hollow brick, the washer counted in what it fixes
                expect(screw.length, `${name} : ${screw.part}`).toBeGreaterThanOrEqual(plugLength + board.thickness
                    + washerThickness + screw.diameter);
            }
        }
    });

    it("nomme l'outil de chaque perçage du mur, découpe et collage sur place", () =>
    {
        for (const [name, make] of PIECES)
        {
            // On site only : a catch plate or a screw cap sticks on by hand at the bench
            const bare = gammeOf(make).at(-1)!.rows.filter((row) =>
            {
                return (["Cheville", "Découpe"].includes(row.type) || (row.type === "Collage" &&
                                                                       /[Ff]ileur/.test(row.operation)))
                    && row.tool === "Aucun";
            }).map((row) => { return `${name} : ${row.operation}`; });
            expect(bare).toEqual([]);
        }
    });

    it("achète le tamis que la note de l'étagère conseille", () =>
    {
        const outputs = computeOutputs(tvWall());
        const told = outputs.analysis.build.parts.some((part) => { return part.notes.some((n) => { return /tamis/.test(n); }); });
        const bought = outputs.bom.hardware.some((h) => { return /tamis/i.test(h.label); });
        expect(!told || bought).toBe(true);
    });

    it("achète une seule fois par projet chaque colle", () =>
    {
        for (const [name, make] of PIECES)
        {
            const glues = computeOutputs(make()).bom.hardware.filter((h) => { return /^GLUE_/.test(h.id) &&
                h.qty !== 1; });
            expect(glues.map((h) => { return `${name} : ${h.id} x ${h.qty}`; })).toEqual([]);
        }
    });

    it("garde une cote de sciage à un panneau rectangulaire percé d'un passage de câble", () =>
    {
        const bom = computeOutputs(tvWall()).bom;
        const rows = [...bom.cut, ...bom.offSheet].filter((row) =>
        {
            const part = row.parts[0]!;
            return part.cutouts.length > 0 && part.outline.segments.every((s) => { return s.kind !== "arc"; })
                && part.outline.segments.length === 4;
        });
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.filter((row) => { return sawSize(row) === "dxf"; }).map((row) => { return row.label; })).toEqual([]);
    });

    it("ne dit 'Tourillons collés' qu'à une pièce qui a des tourillons", () =>
    {
        const outputs = computeOutputs(tvWall());
        const byCode = new Map([...outputs.bom.codeOfPart].map(([id, code]) => { return [code, id]; }));
        const parts = new Map(outputs.analysis.build.parts.map((part) => { return [part.id, part]; }));
        const wrong = gammeOf(tvWall).flatMap((table) => { return table.rows; }).filter((row) =>
        {
            const part = parts.get(byCode.get(row.pbs[0]!.split(" ")[0]!) ?? "");
            return row.type === "Tourillons collés" && part !== undefined
                && !part.holes.some((hole) => { return hole.purpose === "dowel"; });
        }).map((row) => { return row.operation; });
        expect(wrong).toEqual([]);
    });

    it("compte une pastille pour chaque boîtier qu'il dit caché sous pastille", () =>
    {
        const hardware = computeOutputs(tvWall()).bom.hardware;
        const promised = hardware.filter((h) => { return /sous pastille/.test(h.label); });
        const caps = hardware.filter((h) => { return h.notes.some((n) => { return /boîtier|Minifix/i.test(n); })
            && /pastille|cache/i.test(h.label); });
        expect(promised.length === 0 || caps.length > 0).toBe(true);
    });

    it("serre un Minifix dont le goujon est monté dans une autre table, et le dit", () =>
    {
        const minifix = Object.values(CAD_MODELS).find((m) => { return m.fixing?.tighten?.once === "mate"; })!;
        const housing: GammeRow = { pbs: [`${minifix.ref} ${minifix.label} *, #100-001 Joue gauche`], count: 2,
                                    type: "Insertion", operation: "Monter la coque : boîtier sur #100-001 Joue gauche",
                                    tool: "Aucun", direction: "N/A", comment: "N/A" };
        const ties = new Map([["#100-001 Joue gauche", new Map([["#300-004 Dessus", 2]])]]);
        const out = fixedInTurn([housing], ties, "PZ2");
        const turn = out.find((row) => { return row.type === "Serrage"; });
        expect(turn?.operation).toContain("ils tirent #300-004 Dessus");
        expect(turn?.comment).toContain("monté dans une autre table");
    });

    it("range la plinthe d'un fileur latéral à part de la plinthe avant, tourillonnée sur place", () =>
    {
        const rows = gammeOf(dresser).flatMap((table) => { return table.rows; });
        const plinths = rows.filter((row) => { return /Plinthe du fileur/.test(row.operation) &&
                                              !/Tourillon/.test(row.operation); });
        expect(plinths.length).toBeGreaterThan(0);
        for (const row of plinths)
        {
            expect(row.type, row.operation).toBe("Tourillons collés");
            expect(row.operation, row.operation).not.toMatch(/#[0-9A-Z]{2}[1-9A-Z]-\d{3} Plinthe du fileur/);
        }
    });

    it("ne laisse aucun 'à juger' ni l'étape du téton dans la gamme (décisions déjà prises)", () =>
    {
        for (const [name, make] of PIECES)
        {
            const left = gammeOf(make).flatMap((table) => { return table.rows; }).filter((row) =>
            {
                return /à juger/.test(row.comment) || /téton/.test(row.operation);
            }).map((row) => { return `${name} : ${row.operation.slice(0, 80)} | ${row.comment.slice(0, 60)}`; });
            expect(left).toEqual([]);
        }
    });
});
