import { describe, expect, it } from "vitest";
import { computeOutputs } from "../outputs";
import { dresser, tvWall } from "../templates";
import { cadModel } from "./cad_model";
import { ACTIONS, POSITION, type GammeTable } from "./gamme";
import { CAD_MODELS } from "../../data/cad_models";
import { drawingSet } from "./workshop";
import { gammeSequences } from "../drawing/assembly_sheets";

// The shell glob the control of the sequence reads a step with : * any run, ? one character, [x] that one
function glob(pattern: string): RegExp
{
    let re = "";
    for (let i = 0; i < pattern.length; i++)
    {
        const c = pattern[i]!;
        if (c === "*")
        {
            re += ".*";
        }
        else if (c === "?")
        {
            re += ".";
        }
        else if (c === "[")
        {
            const end = pattern.indexOf("]", i + 2);
            re += `[${pattern.slice(i + 1, end).replace(/[\\^]/g, "\\$&")}]`;
            i = end;
        }
        else
        {
            re += c.replace(/[.+^${}()|\\]/g, "\\$&");
        }
    }
    return new RegExp(`^${re}$`);
}


// The dresser's sequence isn't sent yet : worked out all the same, to hold to the same rules
for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
describe(`the assembly sequence of the ${name}`, () =>
{
    const p = make();
    const m = cadModel(p, computeOutputs(p), true) as
    {
        gamme: GammeTable[];
        parts: { code: string; label: string; bands?: { edge: string }[]; bandInner?: unknown; item: string; assembly: string;
                 frame: { o: number[]; u: number[]; v: number[]; n: number[] } | null; length: number; width: number;
                 thickness: number; holes: { purpose: string; diameter: number; depth: number }[] }[];
        instances: { model: string; part: string }[];
        screws: { kind: string; diameter: number; length: number; washer?: boolean; tag: string; label: string;
                  item: string; point: number[]; out: number[] }[];
        models: Record<string, { ref: string; label: string }>;
    };
    // Every solid by the label the FreeCAD file gives it (freecad_build.py, freecad_view.py)
    const edgeName: Record<string, string> = { v0: "L1", v1: "L2", u0: "l1", u1: "l2" };
    const solids: string[] = [
        ...m.parts.map((q) => { return `${q.code} ${q.label}`; }),
        // Each edge band a body of its own since 2026-11-08 (freecad_build.py)
        ...m.parts.flatMap((q) => { return (q.bands ?? []).map((b) => { return `${q.code} ${q.label}, chant ${edgeName[b.edge]}`; }); }),
        // A board of another outline, its banding bent around it in one body
        ...m.parts.filter((q) => { return q.bandInner !== null &&
                                  q.bandInner !== undefined; }).map((q) => { return `${q.code} ${q.label}, chant cintré`; }),
        ...m.instances.map((i, k) => { return `${m.models[i.model]!.ref} ${m.models[i.model]!.label} ${k + 1}, ${i.part}`; }),
    ];
    m.screws.forEach((s, k) =>
    {
        if (s.washer === true)
        {
            solids.push(`Rondelle ${k + 1}, ${s.tag}`);
        }
        // The link of a screw is matched by its note, what it holds and where
        solids.push(`${s.label}, ${s.tag}`);
    });

    it("puts each solid of the file in one step and one only", () =>
    {
        const steps = m.gamme.flatMap((t) =>
        {
            return t.rows.filter((r) => { return !ACTIONS.has(r.type); }).flatMap((r) =>
            {
                return r.pbs.map((x) => { return { x, re: glob(x), t: t.code }; });
            }); 
        })
            .filter((s) => { return !/-000$/.test(s.x); });
        const left = solids.filter((l) => { return !steps.some((s) => { return s.re.test(l); }); });
        const twice = solids.filter((l) => { return steps.filter((s) => { return s.re.test(l); }).length > 1; });
        expect(left).toEqual([]);
        expect([...new Set(twice)]).toEqual([]);
    });

    it("screws each Oslo pull right after laying it, with a Phillips bit", () =>
    {
        // Its supplied screws have a plain cross, they went to the last step of all as "other" (2026-11-09)
        const pulls = m.gamme.flatMap((t) =>
        {
            return t.rows.map((r, k) => { return { t: t.code, k, r }; });
        });
        const laid = pulls.filter((x) => { return x.r.pbs.some((s) => { return s.startsWith("84335807"); }); });
        const screwed = pulls.filter((x) => { return x.r.pbs.some((s) => { return s.includes("poignée Oslo"); }); });
        expect(laid.length).toBeGreaterThan(0);
        expect(screwed.map((x) => { return [x.t, x.r.tool, x.r.type]; })).toEqual(laid.map((x) => { return [x.t,
            "Tournevis forme PH 2, ISO 8764-1 (cruciforme Phillips PH2)", "Vissage"]; }));
        for (const [k, x] of screwed.entries())
        {
            expect(x.k).toBeGreaterThan(laid[k]!.k);
        }
    });


    it("counts on each row the solids it names", () =>
    {
        for (const t of m.gamme)
        {
            for (const r of t.rows.filter((x) => { return !/-000$/.test(x.pbs[0]!) && !ACTIONS.has(x.type); }))
            {
                const res = r.pbs.map(glob);
                const n = solids.filter((l) => { return res.some((re) => { return re.test(l); }); }).length;
                expect(`${t.code} ${r.operation} : ${n}`).toBe(`${t.code} ${r.operation} : ${r.count}`);
            }
        }
    });

    // A drawer was built inside its carcass board by board : it's built on the bench and fitted whole
    it("builds each drawer and door on the bench before the carcass it goes into", () =>
    {
        const codes = m.gamme.map((t) => { return t.code; });
        const subs = codes.filter((c) => { return /^#[0-9A-Z][1-9A-Z]0$/.test(c); });
        expect(subs.length).toBeGreaterThan(0);
        for (const c of subs)
        {
            expect(codes.indexOf(c)).toBeLessThan(codes.indexOf(`${c.slice(0, 2)}00`));
        }
    });


    // Coded #130 a drawer part still landed in the table of #100 : its code alone said nothing of the table
    it("lays each board in the table of its own code, a drawer part in its drawer and not in the carcass", () =>
    {
        for (const t of m.gamme.filter((x) => { return x.code !== "#000"; }))
        {
            for (const r of t.rows.filter((x) => { return !/-000$/.test(x.pbs[0]!); }))
            {
                for (const x of r.pbs.filter((s) => { return /^#[0-9A-Z]{3}-\d{3} /.test(s); }))  
                {
                    expect(x.startsWith(`${t.code}-`), `${t.code} : ${x}`).toBe(true);
                }
            }
        }
        // And each table of the bench holds something to build
        for (const t of m.gamme.filter((x) => { return /^#[0-9A-Z][1-9A-Z]0$/.test(x.code); }))
        {
            expect(t.rows.length).toBeGreaterThan(0);
        }
    });


    // The front screwed and the couplings clipped on the sides came before the boards of the box itself
    it("stands the box of a drawer on the bench before its front and its couplings", () =>
    {
        let boxes = 0;
        for (const t of m.gamme.filter((x) => { return /^#[0-9A-Z][1-9A-Z]0$/.test(x.code); }))
        {
            const glued = t.rows.map((r) => { return r.type === "Tourillons collés"; });
            if (!glued.includes(true))
            {
                continue;
            }
            boxes++;  
            // Nothing else before the last board of the box
            expect(`${t.code} : ${glued.slice(0, glued.lastIndexOf(true) + 1).every(Boolean)}`).toBe(`${t.code} : true`);
        }
        expect(boxes).toBeGreaterThan(0);
    });


    // Clipped before the screws of its adapter, it went through the housing and the screwdriver through it
    it("screws each TIP-ON adapter before clipping the TIP-ON into it from the front", () =>
    {
        let clipped = 0;
        for (const t of m.gamme)
        {
            t.rows.forEach((r, k) =>
            {
                if (!/TIP-ON version (courte|longue)/.test(r.operation))
                {
                    return;
                }
                clipped++;
                const board = / sur (#[0-9A-Z]{3}-\d{3} .+)$/.exec(r.operation)![1]!;
                const adapter = t.rows.some((x) => { return /Embase droite TIP-ON/.test(x.operation) &&
                                                    x.operation.endsWith(board); });
                // Without an adapter on its board it's pushed into a hole drilled for it
                if (!adapter)
                {
                    expect([r.type, r.direction]).toEqual(["Insertion", "+y"]);
                    return;
                }
                expect([r.type, r.direction]).toEqual(["Clipsage", "+y"]);
                const screwed = t.rows.findIndex((x) => { return /Embase TIP-ON 956\.1201 : vis/.test(x.operation) &&
                                                         x.operation.endsWith(board); });
                expect(screwed).toBeGreaterThan(-1);
                expect(screwed).toBeLessThan(k);
            });
        }
        expect(clipped).toBeGreaterThan(0);
    });


    // The back of a rounded end was screwed before its shaped boards, which then went in through the screws : no test
    // saw it, a screw standing where a board comes reads as a screw in its board
    it("drives each screw once every board it goes into is in", () =>
    {
        // Each pattern compiled once, each name looked up once : a pair of screw and board at a time took minutes
        const order = m.gamme.flatMap((t, ti) =>
        {
            return t.rows.filter((r) => { return !ACTIONS.has(r.type); }).map((r, k) =>
            {
                return { res: r.pbs.map(glob), at: ti * 10000 + k };
            });
        });
        const seen = new Map<string, number>();
        const placedAt = (name: string): number =>
        {
            if (!seen.has(name))
            {
                seen.set(name, order.find((x) => { return x.res.some((re) => { return re.test(name); }); })?.at ?? -1);
            }
            return seen.get(name)!; 
        };
        const early: string[] = [];
        for (const s of m.screws)
        {
            const driven = placedAt(`${s.label}, ${s.tag}`);
            if (driven < 0)
            {
                continue;
            }
            for (const q of m.parts.filter((x) => { return x.item === s.item && x.frame !== null; }))
            {
                const f = q.frame!;
                // By its tip, where it bites : the shank of a plate screw runs through the groove of the shelf over it
                const inside = [s.length - 1].some((d) =>
                {
                    const rel = [0, 1, 2].map((k) => { return s.point[k]! - s.out[k]! * d - f.o[k]!; });
                    const [u, v, n] = [f.u, f.v, f.n].map((a) => { return rel[0]! * a[0]! + rel[1]! * a[1]! + rel[2]! *
                                                                  a[2]!; });
                    return u! > 0 && u! < q.length && v! > 0 && v! < q.width && n! > 0 && n! < q.thickness;
                });
                const board = placedAt(`${q.code} ${q.label}`);
                if (inside && board > driven)
                {
                    early.push(`${s.label.slice(0, 40)}, ${s.tag} avant ${q.code} ${q.label}`);
                }
            }
        }
        expect([...new Set(early)]).toEqual([]);
    });


    // The bases of the feet were screwed up from under a carcass standing on the floor : the worker
    // went through it. Each
    // step of an item lies the piece so that its screws go down, never up from the face on the floor
    it("never drives a screw up from the face lying on the floor", () =>
    {
        const down: Record<string, number[]> = { [POSITION.standing]: [0, 0, -1], [POSITION.back]: [0, 1, 0],
                                                  [POSITION.face]: [0, -1, 0], [POSITION.upside]: [0, 0, 1] };
        const up: string[] = [];
        // The export counts height along y, the gamme in the axes of FreeCAD, z up and y to the wall (freecad_view.py)
        const room = (q: number[]): number[] => { return [q[0]!, -q[2]!, q[1]!]; };
        const dotOf = (a: number[], b: number[]): number =>
        {
            const r = room(a);
            return r[0]! * b[0]! + r[1]! * b[1]! + r[2]! * b[2]!;
        };
        // The benches too : the lining of a niche, a box on its back, had the screws of its back driven up from the
        // floor
        for (const t of m.gamme.filter((x) => { return x.code !== "#000"; })) 
        {
            for (const r of t.rows.filter((x) => { return x.type === "Vissage" || x.type === "Vissage au mur"; }))
            {
                const floor = down[r.position ?? ""];
                if (floor === undefined)
                {
                    continue;
                }
                const res = r.pbs.map(glob);
                for (const s of m.screws.filter((x) => { return res.some((re) => { return re.test(`${x.label}, ${x.tag}`); }); }))
                {
                    const driven = s.out.map((c) => { return -c; });
                    if (dotOf(driven, floor) >= 0)
                    {
                        continue;
                    }
                    // Driven up : a board of the item between its head and the floor and the hand comes in through the
                    // opening, as under a shelf. Nothing there and the tool would come up through the floor
                    // Only the boards of the table : a lining on the bench has no column round it yet
                    const boards = m.parts.filter((q) => { return q.assembly === t.code && q.frame !== null; });
                    const shielded = Array.from({ length: 300 }, (_, k) => { return 3 + 5 * k; }).some((step) =>
                    {
                        const at = [0, 1, 2].map((k) => { return s.point[k]! + s.out[k]! * step; });
                        return boards.some((q) =>
                        {
                            const f = q.frame!;
                            const rel = [0, 1, 2].map((k) => { return at[k]! - f.o[k]!; });
                            const local = [f.u, f.v, f.n].map((a) => { return rel[0]! * a[0]! + rel[1]! * a[1]! +
                                                                      rel[2]! * a[2]!; });
                            return local[0]! > 0 && local[0]! < q.length && local[1]! > 0 && local[1]! < q.width
                                && local[2]! > 0 && local[2]! < q.thickness;
                        });
                    });
                    if (!shielded)
                    {
                        up.push(`${t.code} ${r.position} ${r.operation}`);
                    }
                }
            }
        }
        expect(up).toEqual([]);
        expect(m.gamme.some((t) => { return t.rows.some((r) => { return r.type === "Retourner"; }); })).toBe(true);
    });


    // The screws of a runner or a TIP-ON plate find their pilot holes, bored in the workshop : nothing to measure on
    // site. A glued catch plate, nothing drilled for it, is set by its distances to 2 edges
    // The 606N is sold in the US : the worker reads which screw does instead, and the head it must not pass
    it("says on each coupling screw which other screw does, its head no wider than 6.5", () =>
    {
        const rows = m.gamme.flatMap((t) => { return t.rows; })
            .filter((r) => { return r.pbs.some((pattern) => { return pattern.startsWith("Accouplement MOVENTO"); }); });
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => { return /606N.*Ø6,5 au plus/.test(r.comment); })).toBe(true);
    });


    it("bores the pilot holes of the hardware screws and measures only what is glued", () =>
    {
        const piloted = m.parts.flatMap((q) => { return q.holes; }).filter((h) =>
        {
            return h.purpose === "runner-screw" || h.purpose === "adapter-screw";
        });
        expect(piloted.length).toBeGreaterThan(0);
        expect(piloted.every((h) => { return h.diameter === 2.5 && h.depth > 0; })).toBe(true);
        let glued = 0;
        for (const t of m.gamme)
        {
            for (const r of t.rows)
            {
                if (r.pbs.some((pattern) => { return /^(Coulisse 760H|Embase TIP-ON 956\.1201 : vis)/.test(pattern); }))
                {
                    expect(r.comment, `${t.code} ${r.operation}`).not.toMatch(/Pas d'avant-trou/);
                }
                if (r.pbs.some((pattern) => { return /^956A?\.?1004 Contreplaque/.test(pattern); }))
                {
                    glued++;
                    expect(r.comment, `${t.code} ${r.operation}`).toMatch(/^Pas d'avant-trou, repère : .*\d+ mm/);
                }
            }
        }
        expect(glued).toBeGreaterThan(0);
    });


    // The printed plans had a notice of their own, which the film never followed : they print the gamme itself
    it("prints on the plans the very tables of the gamme the film is made of", () =>
    {
        const printed = drawingSet(p,
                                   computeOutputs(p)).filter((page) => { return /Gamme de montage/.test(page.title); })
            .flatMap((page) => { return page.prims.filter((x) => { return x.k === "text"; }).map((x) => { return (x as { t: string }).t; }); }); 
        expect(printed.length).toBeGreaterThan(0);
        for (const t of m.gamme)
        {
            expect(printed, `${t.code} ${t.name}`).toContain(`${t.code} ${t.name}`);
        }
        expect(printed.some((x) => { return /Retourner le meuble/.test(x); })).toBe(true);
    });


    // Its top laid before the sides that carry it, its 5 boards set loose and screwed at the end : a box is built from
    // its bottom up, each board resting on those in, screwed as soon as it can be
    it("builds the lining box from its bottom up, its back last", () =>
    {
        let boxes = 0;
        for (const t of m.gamme.filter((x) => { return x.name === "Habillage"; }))
        {
            boxes++;
            const at = (re: RegExp): number => { return t.rows.findIndex((r) => { return re.test(r.operation); }); };
            const order = [at(/: #\S+ Habillage, dessous$/), at(/: #\S+ Habillage, gauche$/),
                           at(/: #\S+ Habillage, droite$/),
                           at(/: #\S+ Habillage, dessus$/), at(/habillage sur #\S+ Habillage, dessus/),
                           at(/habillage sur #\S+ Habillage, dessous/), at(/: #\S+ Habillage, fond$/),
                           at(/habillage sur #\S+ Habillage, fond/)];
            expect(order.every((k) => { return k >= 0; }), `${t.code} ${order}`).toBe(true);
            expect([...order].sort((a, b) => { return a - b; })).toEqual(order);
        }
        if (m.parts.some((q) => { return /^Habillage/.test(q.label); }))
        {
            expect(boxes).toBeGreaterThan(0);
        }
    });


    // Set after its doors, a shelf came in through a door shut (film of essai45, #100 steps 79 and 80)
    it("sets the pins and the adjustable shelves of a carcass before its doors", () =>
    {
        let checked = 0;
        for (const t of m.gamme)
        {
            const rows = (re: RegExp): number[] =>
            {
                return t.rows.map((r, k) => { return re.test(`${r.type} | ${r.operation}`) ? k : -1; })
                    .filter((k) => { return k >= 0; });
            };
            const shelves = rows(/^Pose sur taquets/);
            const pins = rows(/Taquet/);
            const doors = rows(/#[0-9A-Z]{3}-000 (Porte|Abattant)/);
            if (shelves.length === 0)
            {
                continue;
            }
            checked++;
            // The pins go in first, the shelf is laid on them
            expect(Math.max(...pins), `${t.code}`).toBeLessThan(Math.min(...shelves));
            if (doors.length > 0)
            {
                expect(Math.max(...shelves), `${t.code}`).toBeLessThan(Math.min(...doors));
            }
        }
        expect(checked).toBeGreaterThan(0);
    });


    // Film of essai45 : the strut of a stay set first hung in the air, the drawer behind the flap set before
    // it in its way
    it("clips the strut of a stay between its screwed brackets, then slides in the drawer behind the flap", () =>
    {
        let stays = 0;
        for (const t of m.gamme) 
        {
            const at = (re: RegExp): number[] =>
            {
                return t.rows.map((r, k) => { return re.test(r.operation) ? k : -1; }).filter((k) => { return k >= 0; });
            };
            const struts = at(/Compas 365\.01\.901, vérin/);
            if (struts.length === 0)
            {
                continue;
            }
            stays++;
            expect(Math.min(...struts)).toBeGreaterThan(Math.max(...at(/Compas 365\.01\.901, équerre/)));
            expect(struts.every((k) => { return t.rows[k]!.type === "Clipsage"; })).toBe(true);
            // The drawer behind the flap slides in from the whole, after every carcass table : never in this one, where
            // it could come before the strut it has to pass. Searched here, an empty list made a min of Infinity
            expect(at(/Tiroir intérieur \d+, monté/)).toEqual([]);
            const whole = m.gamme.at(-1)!;
            expect(whole.rows.some((r) => { return /Tiroir intérieur \d+, monté/.test(r.operation); })).toBe(true);
        }
        expect(stays).toBe(name === "dresser" ? 1 : 0);
    });


    // Film of essai45 : the screws of an anti-tip bracket set in the carcass before it, the dowels of a filler plinth
    // after the plinth they slide it on with
    it("screws a bracket or a back into the wall once it stands, and dowels a filler plinth before setting it", () =>
    {
        const whole = m.gamme.find((t) => { return t.code === "#000"; })!;
        const at = (test: RegExp | ((op: string) => boolean)): number[] =>
        {
            return whole.rows.map((r, k) =>
            {
                return (typeof test === "function" ? test(r.operation) : test.test(r.operation)) ? k : -1;
            }).filter((k) => { return k >= 0; });
        };
        const brackets = at(/Équerre 40 x 40 x 40 sur/);
        for (const k of brackets)
        {
            const item = whole.rows[k]!.operation.split(" sur ")[1]!.split(" : ")[0]!;
            const screws = at(/Équerre anti-basculement : vis 4 x 16/).filter((j) =>
            {
                return whole.rows[j]!.pbs.some((pattern) => { return pattern.includes(item.slice(0, 4)); });
            });
            expect(screws.length, item).toBeGreaterThan(0);
            expect(Math.min(...screws), item).toBeGreaterThan(k);
        }
        // Through the back into the wall : screwed once its item stands in place
        const walls = at(/Fixer au mur : Fixation au mur : vis 5 x \d+ sur #\w{3}-\d{3}/);
        for (const k of walls)
        {
            const item = /sur (#\w{3})-/.exec(whole.rows[k]!.operation)![1]!;
            const set = at((op) => { return op.startsWith(`Mettre en place ${item}-000 `); });
            expect(set.length, item).toBe(1);
            expect(set[0]!, item).toBeLessThan(k);
        }
        const dowels = at(/Tourillon 8 x 35 sur #\w{3}-\d{3} Plinthe du fileur/);
        for (const k of dowels)
        {
            const plinth = whole.rows[k]!.operation.split(" sur ")[1]!;
            expect(at((op) => { return op.endsWith(`: ${plinth}`); }).every((j) => { return j > k; }),
                   plinth).toBe(true);
        }
        if (name === "dresser")
        {
            expect([walls.length, dowels.length].every((n) => { return n > 0; })).toBe(true);
        }
    });


    // The return screwed into the bottom shaped board after the feet could not be done : return, the bases, the clips of
    // the return (a base went up through one), the feet clipping in, the front plinth garnished at the bench last
    it("sets a return plinth and the clips before the feet, the front plinth last", () =>
    {
        let plinths = 0;
        for (const t of m.gamme)
        {
            const at = (re: RegExp): number => { return t.rows.findIndex((r) => { return re.test(r.operation); }); };
            const back = at(/: #[0-9A-Z]{3}-\d{3} Plinthe, retour/);
            if (back < 0)
            {
                continue;
            }
            plinths++;
            const order = [back, at(/Embase AXILO à visser/), at(/Clip de plinthe AXILO sur .*retour/), at(/Pied AXILO/),
                           at(/Plinthe avant, monté à l'établi/)];
            expect(order.every((k) => { return k >= 0; }), `${t.code} ${order}`).toBe(true);
            expect([...order].sort((a, b) => { return a - b; })).toEqual(order);
            // The front plinth gets its clips in hand on the bench, laid first, before the carcass table
            const bench = m.gamme.findIndex((x) => { return x.name === "Plinthe avant"; });
            const own = m.gamme[bench]!.rows;
            expect(bench).toBeLessThan(m.gamme.indexOf(t));
            expect(own[0]!.type).toBe("Pose sur l'établi");
            expect(own.slice(1).every((r) => { return /Clip de plinthe/.test(r.operation); })).toBe(true);
        }
        if (m.parts.some((q) => { return /Plinthe, retour/.test(q.label); }))
        {
            expect(plinths).toBeGreaterThan(0);
        }
    });


    // Printed on the first step of a table only, the way the piece lay was left to the steps that turn it over
    it("prints the way the piece lies on every step", () =>
    {
        const steps = gammeSequences(m.gamme).flatMap((s) => { return s.steps; });
        expect(steps.length).toBeGreaterThan(0);
        expect(steps.filter((s) => { return !s.lines.some((l) => { return l.startsWith("Position : "); }); })
            .map((s) => { return s.title; })).toEqual([]);
    });


    // The front plinths of both dresser columns clipped in their carcass table, on feet set only once they stood
    it("clips a front plinth after every foot of its item, in the same table", () =>
    {
        let plinths = 0;
        for (const t of m.gamme)
        {
            t.rows.forEach((r, k) =>
            {
                if (r.type !== "Clipsage" || !/Plinthe avant, monté à l'établi/.test(r.operation))
                {
                    return;
                }
                plinths++;
                const item = `${r.pbs[0]!.slice(0, 2)}00`;
                const feet = m.gamme.flatMap((x) =>
                {
                    return x.rows.flatMap((f, j) =>
                    {
                        return f.pbs.some((s) => { return s.startsWith("637.76.353") && s.includes(`, ${item}`); })
                            ? [{ table: x.code, j }] : [];
                    });
                });
                expect(feet.length, `${t.code} ${r.operation}`).toBeGreaterThan(0);
                for (const f of feet)
                {
                    expect(f.table, `${r.operation} : pieds de ${item} dans une autre table`).toBe(t.code);
                    expect(f.j, `${r.operation} : clipsée avant les pieds de ${item}`).toBeLessThan(k);
                }
            })
                {
                }
        }
        expect(plinths).toBeGreaterThan(0);
    });


    // Its housing laid first, the screws of its plate went through it in the film of a TV
    it("screws the plate of a TIP-ON adapter, then clips its housing on", () =>
    {
        let adapters = 0;
        for (const t of m.gamme)
        {
            for (const [k, r] of t.rows.entries())
            {
                const board = / sur (#[0-9A-Z]{3}-\d{3} .+)$/.exec(r.operation)?.[1];
                if (!/Embase droite TIP-ON, boîtier/.test(r.operation) || board === undefined)
                {
                    continue;
                }
                adapters++;
                const at = (re: RegExp): number =>
                {
                    return t.rows.findIndex((x) => { return re.test(x.operation) && x.operation.endsWith(board); });
                };
                expect(r.type).toBe("Clipsage");
                expect(at(/Embase droite TIP-ON, plaque/)).toBeLessThan(at(/Embase TIP-ON 956\.1201 : vis/));
                expect(at(/Embase TIP-ON 956\.1201 : vis/)).toBeLessThan(k);
            }
        }
        expect(adapters).toBeGreaterThan(0);
    });


    // Its screws go into the back edge of each shaped board : screwed first, the boards then went through them
    it("backs a rounded end once its boards are in", () =>
    {
        if (!m.parts.some((q) => { return /Bout arrondi \w+, fond/.test(q.label); }))
        {
            return;
        }
        let ends = 0;
        for (const t of m.gamme)
        {
            const back = t.rows.findIndex((r) => { return /Bout arrondi \w+, fond/.test(r.operation); });
            if (back < 0)
            {
                continue;
            }
            ends++;
            const boards = t.rows.map((r, k) => { return { r, k }; }).filter((x) =>
            {
                return /Bout arrondi \w+, (flasque|tablette)/.test(x.r.operation) && !/vis/.test(x.r.operation);
            });
            const screwed = t.rows.findIndex((r) => { return /du fond.*Bout arrondi/.test(r.operation); });
            expect(boards.length).toBeGreaterThan(0);
            expect(back).toBeGreaterThan(Math.max(...boards.map((x) => { return x.k; })));
            expect(screwed).toBeGreaterThan(back);
        }
        expect(ends).toBeGreaterThan(0);
    });


    // A board goes onto its dowels with a mallet, and each dowel is tapped into its bore : no tool was said
    it("taps a board onto its dowels and each dowel in with a mallet", () =>
    {
        let tapped = 0;
        for (const t of m.gamme)
        {
            for (const r of t.rows.filter((x) => { return /ourillons/.test(x.type) ||
                                                  /Tourillon 8 x 35/.test(x.operation); }))
            {
                expect(r.tool).toMatch(/^Maillet/);
                tapped++;
            }
        }
        expect(tapped).toBeGreaterThan(0);
    });


    // The couplings of a MOVENTO runner were clipped and never screwed, the EXPANDO plates and the Minifix cams never
    // tightened : whatever its catalogue entry says holds an article is in the model, and done right after it
    it("holds each article the moment it is set, as its catalogue entry says", () =>
    {
        let held = 0;
        for (const i of m.instances)
        {
            const screws = CAD_MODELS[i.model]?.fixing?.screws;
            if (screws?.at !== undefined)
            {
                expect(m.screws.filter((s) => { return s.label === screws.label; }).length).toBeGreaterThan(0);
            }
        }
        for (const t of m.gamme)
        {
            for (const [k, r] of t.rows.entries())
            {
                const model = Object.values(CAD_MODELS).find((x) =>
                {
                    return r.type !== "Serrage" && r.pbs.some((pattern) => { return pattern.startsWith(`${x.ref} ${x.label}`); });
                });
                const fixing = model?.fixing;
                if (fixing === undefined)
                {
                    continue;
                }
                held++;
                const next = t.rows[k + 1];
                if (fixing.screws !== undefined)
                {
                    expect(next?.pbs.some((pattern) => { return pattern.startsWith(fixing.screws!.label); }),
                           `${t.code} ${r.operation} : pas suivie de ses vis`).toBe(true);
                }
                else if (fixing.tighten?.once === "set")
                {
                    expect(next?.type, `${t.code} ${r.operation} : pas serrée aussitôt`).toBe("Serrage");
                }
                else if (fixing.tighten?.once === "mate")
                {
                    // TODO no template puts a Minifix bolt in another table than its housing : fixedInTurn then skips
                    // the turn without a word, and nothing here would see it. Throw there, or a check of its own ?
                    const board = / sur (#[0-9A-Z]{3}-\d{3} .+)$/.exec(r.operation)![1]!;
                    const turns = t.rows.map((x, j) =>
                    {
                        return x.type === "Serrage" && x.operation.includes(`Minifix de ${board}`) ? j : -1;
                    }).filter((j) => { return j > k; });
                    expect(turns.length, `${t.code} ${r.operation} : jamais serré`).toBeGreaterThan(0);
                    // Each cam turned once the board of the bolt it pulls is in, not only once its own housing is
                    for (const j of turns)
                    {
                        const pulled = /ils tirent (.+)$/.exec(t.rows[j]!.operation)![1]!;
                        const bolted = t.rows.findIndex((x) => { return x.type !== "Serrage" &&
                                                                x.pbs.includes(pulled); });
                        expect(bolted, `${t.rows[j]!.operation} : panneau du goujon absent`).toBeGreaterThanOrEqual(0);
                        expect(j, `${t.rows[j]!.operation} : serré avant le panneau du goujon`).toBeGreaterThan(bolted);
                    }
                }
            }
        }
        expect(held).toBeGreaterThan(0);
    });


    // Glued before them in the film of a TV, while the hinges only sat in their bores
    it("glues the catch plate of a door once its hinges are screwed", () =>
    {
        let doors = 0;
        for (const t of m.gamme)
        {
            const glued = t.rows.findIndex((r) => { return /Contreplaque TIP-ON à coller/.test(r.operation); });
            const screwed = t.rows.findIndex((r) => { return /Cuvette de charnière : vis/.test(r.operation); });
            if (glued < 0 || screwed < 0) 
            {
                continue;
            }
            doors++;
            expect(glued).toBeGreaterThan(screwed);
        }
        expect(doors).toBeGreaterThan(0);
    });


    // They rode inside the step of their board, garnished : no step said a dowel was glued in
    it("glues the dowels in a step of their own, right after the board they go into", () =>
    {
        let dowels = 0;
        for (const t of m.gamme)
        {
            expect(t.rows.filter((r) => { return /garni : .*Tourillon/.test(r.operation); })).toEqual([]);
            t.rows.forEach((r, k) =>
            {
                if (!/^[^:]+ : \d+ x Tourillon/.test(r.operation))
                {
                    return;
                }
                dowels += r.count;
                // The board it names stands in the nearest step above that is no other article set on a board. A board
                // set in the room slides onto a piece standing built : its dowels are glued in it in the step before
                const board = / (?:dans|sur) (#[0-9A-Z]{3}-\d{3} .+)$/.exec(r.operation)![1]!;
                const above = t.rows.slice(0, k).reverse().find((x) => { return !/^[^:]+ : \d+ x /.test(x.operation); });
                const below = t.rows.find((x, j) => { return j > k && !/^[^:]+ : \d+ x /.test(x.operation); });
                const room = typeof r.phase === "string";
                expect(`${t.code} : ${(room ? below : above)?.operation}`).toContain(board);
            });
        }
        expect(dowels).toBeGreaterThan(0);
    });


    // The drawers go in last, every carcass standing tied and fixed : a screw to the niche went through the bottom of
    // the top drawer set in its carcass (film of essai45). Their runners are on in the carcass long before
    it("fits each drawer whole once every carcass stands fixed and tied, its runners on", () =>
    {
        const whole = m.gamme.find((t) => { return t.code === "#000"; })!.rows;
        const poses = whole.map((r, k) => { return { r, k }; })
            .filter((x) => { return /^Mettre les tiroirs : #[0-9A-Z][1-9A-Z]0-000 /.test(x.r.operation); });
        expect(poses.length).toBeGreaterThan(0);
        const fixed = whole.map((r, k) => { return /^(Fixer au mur|Lier les meubles) :/.test(r.operation) ? k : -1; });
        expect(Math.min(...poses.map((x) => { return x.k; }))).toBeGreaterThan(Math.max(...fixed));
        for (const t of m.gamme.filter((x) => { return /^#[0-9A-Z]00$/.test(x.code) && x.code !== "#000"; }))
        {
            expect(t.rows.filter((r) => { return /^#[0-9A-Z][1-9A-Z]0-000$/.test(r.pbs[0]!) &&
                                         /Tiroir/.test(r.operation); }),
                   t.code).toEqual([]);
        }
        // Each drawer goes on runners screwed in its carcass
        for (const { r } of poses)
        {
            const carcass = `${r.pbs[0]!.slice(0, 2)}00`;
            const own = m.gamme.find((t) => { return t.code === carcass; });
            expect(own?.rows.some((x) => { return x.pbs.some((s) => { return s.startsWith("760H"); }); }),
                   carcass).toBe(true);
        }
    });


    it("leaves no cell empty and ends on the whole", () =>
    {
        expect(m.gamme.at(-1)!.code).toBe("#000");
        const empty = m.gamme.flatMap((t) => { return t.rows; }).filter((r) =>
        {
            return [r.type, r.operation, r.tool, r.direction,
                    r.comment].some((c) => { return c.trim() === ""; }) || r.pbs.length === 0;
        });
        expect(empty).toEqual([]);
        // One setting in place per item, a check on a whole item being no step of its own, a wall shelf set
        // on its plates
        expect(m.gamme.find((t) => { return t.code === "#000"; })!.rows.filter((r) =>
        {
            return (/-000$/.test(r.pbs[0]!) && r.type === "Mise en place") || r.type === "Emboîtement sur platines";
        }).length)
            .toBe(new Set(p.items.filter((it) => { return it.kind !== "device"; }).map((it) => { return it.id; })).size);
    });
});
}


describe("the light in the way of the small columns of the dresser", () =>
{
    it("goes in once both columns stand, said to be unscrewed to take them out", () =>
    {
        // Screwed and not clipped, the columns slide in under its top before it
        const p = dresser();
        const m = cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] };
        const rows = m.gamme.at(-1)!.rows;
        const at = (re: RegExp): number => { return rows.findIndex((r) => { return re.test(r.operation); }); };
        const profile = at(/Profilé LED/);
        expect(profile).toBeGreaterThan(at(/Mettre en place .* Petite colonne gauche/));
        expect(profile).toBeGreaterThan(at(/Mettre en place .* Petite colonne droite/));
        expect(rows[profile]!.comment).toBe("À dévisser avant de sortir Petite colonne gauche, Petite colonne droite");
        expect(rows[at(/Mettre en place .* Petite colonne gauche/)]!.direction).toBe("+y");
        // And nowhere in the table of the niche, built before the columns go in
        expect(m.gamme.find((t) => { return t.code === "#300"; })!.rows.some((r) => { return /LED/.test(r.operation); })).toBe(false);
    });
});


describe("the drop-down flap of the dresser built on the bench", () =>
{
    const p = dresser();
    const m = cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] };
    const rowsOf = (pattern: RegExp) =>
    {
        return m.gamme.flatMap((t) => { return t.rows.filter((r) => { return r.pbs.some((s) => { return pattern.test(s); }); })
            .map((r) => { return { t: t.code, r }; }); });
    };

    // Neither had a rule : both came last of all, "Poser le reste"
    it("screws its hinges with the flap and fits its stays once it hangs", () =>
    {
        const hinges = rowsOf(/^342\.78\.700/);
        expect(hinges.map((x) => { return x.r.operation.split(" : ")[0]; })).toEqual(hinges.map(() => { return "Monter la façade"; }));
        // The half on the floor of the cell is only carried on the bench : screwed when the flap is set
        const floor = hinges.filter((x) => { return /côté meuble/.test(x.r.pbs[0]!); });
        expect(floor.length).toBeGreaterThan(0);
        expect(floor.every((x) => { return x.r.type === "Pose" && /à la pose$/.test(x.r.operation); })).toBe(true);
        const stays = rowsOf(/^365\.01\.901/);
        expect(stays.length).toBeGreaterThan(0);
        for (const x of stays)
        {
            const rows = m.gamme.find((t) => { return t.code === x.t; })!.rows;
            const hung = rows.findIndex((r) => { return /Abattant tombant/.test(r.operation) &&
                                                /-000$/.test(r.pbs[0]!); });
            expect(x.r.operation).toMatch(/^Équiper l'intérieur/);
            expect(rows.indexOf(x.r)).toBeGreaterThan(hung);
        }
    });

    it("glues the catch plates of the TIP-ON", () =>
    {
        const catches = rowsOf(/Contreplaque TIP-ON/);
        expect(catches.length).toBeGreaterThan(0);
        expect(catches.every((x) => { return x.r.type === "Collage"; })).toBe(true);
    });

    it("screws both halves of its hinges in the table of the flap, the flap then screwed in whole", () =>
    {
        const halves = rowsOf(/^342\.78\.700/);
        expect(halves.length).toBeGreaterThan(0);
        const table = halves[0]!.t;
        expect(halves.every((x) => { return x.t === table; })).toBe(true);
        expect(table).toMatch(/^#[0-9A-Z][1-9A-Z]0$/);
        const pose = rowsOf(new RegExp(`^${table}-000$`));
        expect(pose.map((x) => { return [x.r.type, x.r.direction]; })).toEqual([["Vissage", "Spécial"]]);
    });

    it("keeps the spacers of the inner drawer in the carcass, the drawer itself on the bench", () =>
    {
        const spacers = rowsOf(/Cale de coulisse/);
        expect(spacers.length).toBeGreaterThan(0);
        expect(spacers.every((x) => { return /^#[0-9A-Z]00$/.test(x.t); })).toBe(true);
        const inner = rowsOf(/Tiroir intérieur 1, fond/);
        expect(inner.every((x) => { return /^#[0-9A-Z][1-9A-Z]0$/.test(x.t); })).toBe(true);
        // Screwed on before the runners that go onto them and before the drawer clipped on those : they came last
        const rows = m.gamme.find((t) => { return t.code === spacers[0]!.t; })!.rows;
        const at = (re: RegExp): number[] =>
        {
            return rows.flatMap((r, k) => { return r.pbs.some((s) => { return re.test(s); }) ? [k] : []; });
        };
        const set = [...at(/^#[0-9A-Z]{3}-\d{3} Cale de coulisse/), ...at(/^Cale de coulisse dans/)];
        const onThem = at(/^(Coulisse )?760H.*, #[0-9A-Z]{3}-\d{3} Cale de coulisse/);
        expect(set.length).toBeGreaterThan(2);
        expect(onThem.length).toBeGreaterThan(0);
        expect(Math.max(...set)).toBeLessThan(Math.min(...onThem));
        // The drawer itself goes in with the others, once the carcass stands in the room
        const whole = m.gamme.find((t) => { return t.code === "#000"; })!.rows;
        expect(whole.some((r) => { return /^Mettre les tiroirs : .*Tiroir intérieur/.test(r.operation); })).toBe(true);
    });
});


describe("the bench of a door with a pull", () =>
{
    // No template has one : its pull came under "Monter le tiroir", the phase of the drawers
    it("titles it as a front and not as a drawer", () =>
    {
        const p = tvWall();
        const pull = p.items.flatMap((it) => { return it.kind === "carcass" ? it.fronts : []; })
            .find((f) => { return f.opening === "handle"; })!;
        for (const it of p.items)
        {
            for (const f of it.kind === "carcass" ? it.fronts : [])
            {
                if (f.spec.type === "door")
                {
                    f.opening = "handle";
                    f.handle = pull.handle;
                }
            }
        }
        // Its damped 71B3550 hinges have their model since Häfele 342.42.600 : the export went down on them before
        const m = cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[]; instances: { model: string }[];
                                                             screws: { holds?: string }[] };
        const hinges = m.instances.filter((i) => { return i.model === "71B3550"; });
        expect(hinges.length).toBeGreaterThan(0);
        // Screwed on like the 70T, 2 screws a cup
        expect(m.screws.filter((s) => { return s.holds === "71B3550"; }).length).toBe(2 * hinges.length);
        const doors = m.gamme.filter((t) =>
        {
            return /^#[0-9A-Z][1-9A-Z]0$/.test(t.code) && !t.rows.some((r) => { return r.type === "Tourillons collés"; });
        });
        const pulls = doors.flatMap((t) => { return t.rows.filter((r) => { return r.pbs.some((s) => { return s.startsWith("84335807"); }); }); });
        expect(pulls.length).toBeGreaterThan(0);
        expect(doors.flatMap((t) => { return t.rows; }).filter((r) => { return /^Monter le tiroir/.test(r.operation); })).toEqual([]);
    });
});


describe("the heights the TV wall is set to on site", () =>
{
    const p = tvWall();
    const rows = (cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] }).gamme.at(-1)!.rows;

    it("says the room left over the column with the cleat of its filler already on its top", () =>
    {
        const column = rows.find((r) => { return /Mettre en place .* Colonne gauche$/.test(r.operation); })!;
        expect(column.direction).toBe("-z puis +y");
        expect(column.comment).toContain(": 6 mm sous le plafond, tasseau du fileur compris");
    });

    it("measures the top of the book column before drilling for the shelf screwed onto it", () =>
    {
        const measures = rows.filter((r) => { return r.type === "Contrôle"; });
        expect(measures).toHaveLength(1);
        const books = rows.find((r) => { return /Mettre en place .* Colonne à livres$/.test(r.operation); })!;
        expect(measures[0]!.pbs).toEqual(books.pbs);
        expect(measures[0]!.operation).toBe(`Mesurer la hauteur réelle du dessus de ${books.pbs[0]} Colonne à livres, `
            + "posé et réglé");
        const k = rows.indexOf(measures[0]!);
        expect(k).toBeGreaterThan(rows.indexOf(books));
        // The shelf laid onto that top is the first one hung after the check
        const shelf = rows.slice(k).find((r) => { return /Poser l'étagère : .* Étagère murale$/.test(r.operation); })!;
        const drilled = rows.findIndex((r) =>
        {
            return r.type === "Cheville" && r.operation.includes(`${shelf.pbs[0]!.slice(0, 4)}-`);
        });
        expect(drilled).toBe(k + 1);
    });
});


describe("the niche of the left column of the TV wall", () =>
{
    // Its lining was put in board by board inside the column : screwed together outside, it slides in whole
    it("is built on the bench and slid into its cell whole", () =>
    {
        const p = tvWall();
        const m = cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] };
        const bench = m.gamme.filter((t) =>
        {
            return /^#[0-9A-Z][1-9A-Z]0$/.test(t.code) && t.rows.some((r) => { return /^Monter l'habillage/.test(r.operation); });
        });
        expect(bench).toHaveLength(1);
        const table = bench[0]!;
        const boards = table.rows.flatMap((r) => { return r.pbs; }).filter((s) =>
        {
            return /^#[0-9A-Z]{3}-\d{3} Habillage, [a-zé]+$/.test(s);
        });
        expect(boards.length).toBe(5);
        expect(table.rows.some((r) => { return /habillage/i.test(r.operation) && r.type === "Vissage" &&
                                       r.tool !== "Aucun"; }))
            .toBe(true);
        const carcass = m.gamme.find((t) => { return t.code === `${table.code.slice(0, 2)}00`; })!;
        const slid = carcass.rows.filter((r) => { return r.pbs[0] === `${table.code}-000`; });
        expect(slid.map((r) => { return [r.type, r.direction]; })).toEqual([["Glissé dans la case", "+y"]]);
        // Nothing of the lining left among the boards of the column
        expect(carcass.rows.some((r) => { return r.pbs.some((s) => { return / Habillage, /.test(s); }); })).toBe(false);
        const codes = m.gamme.map((t) => { return t.code; });
        expect(codes.indexOf(table.code)).toBeLessThan(codes.indexOf(carcass.code));
    });
});


describe("the fillers, measured on site", () =>
{
    // Set with the carcass they could not have been measured : the carcass is presented, the gap measured, the filler
    // cut, the carcass fixed, then only the filler glued. Its cleat may go on early
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`presents the carcass, measures and cuts the filler, fixes the carcass, then glues it in the ${name}`, () =>
        {
            const p = make();
            const m = cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] };
            const rows = m.gamme.at(-1)!.rows;
            const measured = rows.flatMap((r, k) => { return r.type === "Mesure sur place" ? [k] : []; });
            expect(measured.length).toBeGreaterThan(0);
            for (const k of measured)
            {
                const code = rows[k]!.pbs[0]!;
                // Right after it is set, or after what still goes under it before it's fixed : its feet clipped in
                // once it stands, levelled, its plinth on them. Never once a screw holds it to the wall
                let j = k - 1;
                while (j > 0 && /^(Poser les pieds une fois|Régler à niveau|Clipser la plinthe)/.test(rows[j]!.operation)
                    && rows[j]!.pbs.some((s) => { return s.includes(code.slice(0, 2)); }))
                {
                    j--;
                }
                const before = rows[j]!;
                expect(before.type).toBe("Mise en place");
                expect(before.pbs[0]).toBe(code);
                expect(rows[k + 1]!.type).toBe("Découpe");
                const set = rows.findIndex((r, j) => { return j > k &&
                                                      /^(Poser le fileur|Fermer jusqu'au plafond)/.test(r.operation); });
                const fixed = rows.findIndex((r, j) => { return j > k && /^Fixer au mur/.test(r.operation) &&
                                                        r.operation.includes(code.slice(0, 4)); });
                expect(set).toBeGreaterThan(k + 1);
                // Glued once the carcass is fixed : screwing it to the wall would move a filler whose glue is wet
                if (fixed !== -1)
                {
                    expect(set).toBeGreaterThan(fixed);
                }
            }
            // No filler left among the boards of its carcass, its cleat there still
            const carcasses = m.gamme.filter((t) => { return t.code !== "#000"; });
            const boards = carcasses.flatMap((t) => { return t.rows.flatMap((r) => { return r.pbs; }); });
            expect(boards.filter((s) => { return /^#[0-9A-Z]{3}-\d{3} Fileur/.test(s); })).toEqual([]);
            expect(boards.some((s) => { return /^#[0-9A-Z]{3}-\d{3} Tasseau du fileur/.test(s); })).toBe(true);
        });
    }
});
