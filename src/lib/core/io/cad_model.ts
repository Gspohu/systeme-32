// What a CAD tool needs to rebuild the parts of a project and place them : plain data, the build itself lives apart

import type { Project, WallType } from "../model";
import type { Outputs } from "../outputs";
import type { Build, Part } from "../part_types";
import { at, neg, type Vec3 } from "../geometry";
import { innerOutline, plainRectangle } from "../edge_bands";
import { decorById, materialOfDecor } from "../../data/materials";
import { SCREW_ADVICE, SCREW_HOLDS, SCREW_SEAT, screwArticle, screwOf, WASHER_DESIGNATION, WASHER_REF,
         type ScrewDesignation, type ScrewSpec } from "../../data/screws";
import { DEFAULT_PRICES } from "../../data/prices";
import { supplierOf } from "../costing";

export const NO_SUPPLIER = "non relevé";
import { HEAD_SINK } from "../screw_heads";
import { CAD_MODELS, type CadModel } from "../../data/cad_models";
import { cadHardware, DOWEL_LENGTH, handleSection, sameBolt, type CadInstance } from "./cad_hardware";
import { gamme } from "./gamme";
import { benchOfPart } from "../bench";
import { drilledHoles, exportedParts } from "./export_selection";

export const CAD_SCHEMA = 1;
// The plug drawn behind each screw into the wall, the one the hardware list buys (wall_load.ts)
const WALL_PLUG_MODEL: Partial<Record<WallType, string>> = { solid: "PLUG_NYLON_8x40", hollow: "PLUG_DUOPOWER_8x40" };

export interface ScrewPlace extends ScrewSpec
{
    item: string;
    point: Vec3;
    out: Vec3;
    free: number;
    part: string;
    label: string;
    // The article its head holds, and whether it ties its first board to the next
    holds?: string;
    joins?: boolean;
    // What its hole is for, read by the screw caps : glued for good, or on tape over a screw to come out
    purpose?: string;
}


// Each screw at its place in the frame of the wall, its head on the face it goes in from, `out` pointing away from
// the board, `free` the length of the clearance hole it first runs in. A bolt through 2 boards is drilled in both
// and counts once
export function screwPlaces(parts: Part[]): ScrewPlace[]
{
    const bolts: Vec3[] = [];
    const out: ScrewPlace[] = [];
    for (const board of parts)
    {
        if (board.frame === null || board.curve !== null)
        {
            continue;
        }
        for (const hole of board.holes)
        {
            // Drilled in its back edge, a long screw runing in the width of a cleat into what it carries
            if (hole.purpose === "cleat-screw" && (hole.face === "v1" || hole.face === "v0"))
            {
                const edge = screwOf(hole.purpose, hole.label);
                if (edge !== null)
                {
                    const sink = hole.countersink !== undefined ? HEAD_SINK : 0;
                    const back = hole.face === "v0";
                    out.push({ ...edge, item: board.item,
                               point: at(board.frame, hole.u, back ? sink : board.width - sink,
                                         hole.w ?? board.thickness / 2),
                               out: back ? neg(board.frame.v) : board.frame.v, free: hole.depth - sink,
                               part: board.label, label: hole.label,
                               purpose: hole.purpose,
                               joins: sink > 0 });
                }
                continue;
            }
            const spec = hole.face === "A" || hole.face === "B" ? screwOf(hole.purpose, hole.label) : null;
            if (spec === null)
            {
                continue;
            }
            const way = hole.face === "A" ? neg(board.frame.n) : board.frame.n;
            // On the seat of what it holds, or a little under the face of the wood
            const seat = hole.countersink !== undefined ? -HEAD_SINK : SCREW_SEAT[hole.purpose] ?? 0;
            const face = at(board.frame, hole.u, hole.v, hole.face === "A" ? 0 : board.thickness);
            const point: Vec3 = [face[0] + way[0] * seat, face[1] + way[1] * seat, face[2] + way[2] * seat];
            if (spec.kind === "bolt")
            {
                if (bolts.some((other) => { return sameBolt(other, point, way, spec.length); }))
                {
                    continue;
                }
                bolts.push(point);
            }
            // A pilot narrower than the screw is bitten from its mouth : no length of it runs free (pilots.ts)
            const clearance = hole.diameter >= spec.diameter ? hole.depth : 0;
            out.push({ ...spec, item: board.item, point, out: way, free: clearance + Math.max(seat, 0),
                       part: board.label, label: hole.label,
                       purpose: hole.purpose,
                       holds: SCREW_HOLDS[hole.purpose], joins: hole.countersink !== undefined });
        }
    }
    return out;
}


// Everything the CAD file places : the articles, every screw and the plug behind each screw into the wall. The
// checks read this, not the articles alone : the plugs of the solid wall were placed and never counted
export function placedHardware(p: Project, b: Build): { instances: CadInstance[]; every: ScrewPlace[]; drawn: Record<string, CadModel> }
{
    const { instances, screws, drawn } = cadHardware(p, b);
    // The bolts stand among the models, screw and sleeve together
    const drilled = screwPlaces(b.parts).filter((s) =>
    {
        return s.kind !== "bolt";
    });
    // The screws and plugs the hardware list buys, whatever the cabinet maker ends up choosing for hollow brick : he is
    // given the load on each plug on the drawings (hung_items.ts)
    const every = [...drilled, ...screws];
    const plug = WALL_PLUG_MODEL[p.settings.wallType];
    for (const s of every)
    {
        if (plug !== undefined && /au mur/.test(s.label))
        {
            const into: Vec3 = [-s.out[0], -s.out[1], -s.out[2]];
            const up: Vec3 = Math.abs(into[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            const x: Vec3 = [up[1] * into[2] - up[2] * into[1], up[2] * into[0] - up[0] * into[2], up[0] *
                             into[1] - up[1] * into[0]];
            const y: Vec3 = [into[1] * x[2] - into[2] * x[1], into[2] * x[0] - into[0] * x[2], into[0] * x[1] -
                             into[1] * x[0]];
            // Its mouth on the face of the wall, its body going into it
            instances.push({ model: plug, item: s.item, part: s.part,
                             o: [s.point[0], s.point[1], 0], x, y, z: into });
        }
    }
    return { instances, every, drawn };
}


// Placed off a drilling of the carcass yet built on the bench : the arm of a hinge (its plate holes are in the side)
// the coupling of a runner, and through their holds the screws of a hinge cup
const FRONT_SIDE_MODEL = /^(70T|71B|T51\.7601)/;


function distanceToBox(pt: Vec3, lo: Vec3, hi: Vec3): number
{
    let sum = 0;
    for (let k = 0; k < 3; k++)
    {
        const d = Math.max(lo[k]! - pt[k]!, 0, pt[k]! - hi[k]!);
        sum += d * d;
    }
    return Math.sqrt(sum);
}


// The assembly of an article or a screw : that of its board, or for a bench sub-assembly drilled from the carcass
// that of its nearest board of the same item, named after it. Named after the side, the couplings of 2 drawers on
// one upright read alike and each step took both
function benchRouting(b: Build, codeOf: Map<string, string>, groupOf: Map<string, string>):
    (item: string, label: string, model: string, pt: Vec3) => { assembly: string; host?: string }
{
    const byLabel = new Map(b.parts.map((q) => { return [`${q.item}|${q.label}`,
                                                         (codeOf.get(q.id) ?? "").slice(0, 4)]; }));
    const boxes = b.parts.filter((q) => { return benchOfPart(q) !== null && q.frame !== null &&
                                         q.curve === null; }).map((q) =>
    {
        const corners: Vec3[] = [];
        for (const u of [0, q.length])
        {
            for (const v of [0, q.width])
            {
                for (const w of [0, q.thickness])
                {
                    corners.push(at(q.frame!, u, v, w));
                }
            }
        }
        const lo = [0, 1, 2].map((k) => { return Math.min(...corners.map((c) => { return c[k]!; })); }) as Vec3;
        const hi = [0, 1, 2].map((k) => { return Math.max(...corners.map((c) => { return c[k]!; })); }) as Vec3;
        const code = codeOf.get(q.id) ?? "";
        return { item: q.item, lo, hi, assembly: code.slice(0, 4), host: `${code} ${q.label}` };
    });
    return (item, label, model, pt) =>
    {
        if (FRONT_SIDE_MODEL.test(model))
        {
            let best: { d: number; assembly: string; host: string } | null = null;
            for (const box of boxes)
            {
                const d = box.item === item ? distanceToBox(pt, box.lo, box.hi) : Infinity;
                if (d < (best?.d ?? Infinity))
                {
                    best = { d, assembly: box.assembly, host: box.host };
                }
            }
            if (best !== null)
            {
                return { assembly: best.assembly, host: best.host };
            }
        }
        return { assembly: byLabel.get(`${item}|${label}`) ?? groupOf.get(item) ?? "" };
    };
}


// An article drawn in several solids is bought and fitted as one : the flap hinge goes whole with the flap its half
// is screwed into at the bench, though its other half sits on the floor of the cell
function assignUnits<T extends { item: string; unit?: string; assembly: string }>(instances: T[],
                                                                                 groupOf: Map<string, string>): T[]
{
    const sub = new Map<string, string>();
    for (const i of instances)
    {
        if (i.unit !== undefined && i.assembly !== groupOf.get(i.item) && !sub.has(`${i.item}|${i.unit}`))
        {
            sub.set(`${i.item}|${i.unit}`, i.assembly);
        }
    }
    return instances.map((i) =>
    {
        const whole = i.unit === undefined ? undefined : sub.get(`${i.item}|${i.unit}`);
        return whole === undefined ? i : { ...i, assembly: whole };
    });
}


export function cadModel(p: Project, o: Pick<Outputs, "analysis" | "bom">, withGamme = false): object
{
    const build = o.analysis.build;
    const materials = new Map<string, object>();
    const glued = new Set(build.hardware.filter((h) => { return h.ref === "GLUE_PU" &&
                                                        h.target !== null; }).map((h) => { return h.target!; }));
    const parts = exportedParts(build).map((q) =>
    {
        const decor = decorById(q.decor);
        const stock = materialOfDecor(decor);
        materials.set(stock.id, { id: stock.id, label: stock.label, density: stock.density, modulus: stock.modulus,
                                  strength: stock.strength, source: stock.source });
        const code = o.bom.codeOfPart.get(q.id) ?? "";
        return {
            id: q.id,
            code,
            // The item or the sub-assembly it's built into, #100 or #110
            assembly: code.slice(0, 4),
            // The id of its item tells it apart from another of the same name, the two wall shelves of the TV wall
            item: q.item,
            itemName: q.itemName,
            label: q.label,
            role: q.role,
            length: q.length,
            width: q.width,
            thickness: q.thickness,
            frame: q.frame,
            outline: q.outline,
            cutouts: q.cutouts,
            holes: drilledHoles(q).map((h) =>
            {
                return { u: h.u, v: h.v, w: h.w, diameter: h.diameter, depth: h.depth, face: h.face, label: h.label,
                         purpose: h.purpose, countersink: h.countersink };
            }),
            grooves: q.grooves,
            pockets: q.pockets ?? [],
            toFloor: q.toFloor === true,
            // Each banded edge, a solid of its own in the finished size, on a plain rectangle only : any other outline
            // the quarter rounds included, is banded by hand
            bands: decor.edgeThickness === undefined || !plainRectangle(q.outline, q.length, q.width) ? []
                : q.edges.map((e) => { return { edge: e, thickness: decor.edgeThickness! }; }),
            // Any other outline : the board cut to the outline its banding leaves, its banding one bent body around
            // its banded segments, arcs included
            bandInner: decor.edgeThickness === undefined || q.edges.length === 0 || plainRectangle(q.outline,
                q.length, q.width)
                ? null : innerOutline(q.outline, q.length, q.width, q.edges, decor.edgeThickness),
            material: stock.id,
            // Held by glue alone, its fixing no solid : the filler up to the ceiling on its cleat
            glued: glued.has(q.id),
            decor: `${decor.ref} ${decor.label}`.trim(),
            rgb: decor.rgb,
            notes: q.notes,
        };
    });
    const left = build.parts.filter((q) =>
    {
        return q.frame === null || q.curve !== null;
    }).map((q) =>
    {
        return q.label;
    });
    const fitted = build.fitted.filter((f) =>
    {
        return f.host === null && f.purpose !== "runner";
    }).map((f) =>
    {
        return { key: f.key, item: f.item, label: f.label, ref: f.ref, purpose: f.purpose, shape: f.shape,
                 centre: f.centre, axes: f.axes, half: f.half };
    });
    // What the hardware list counts, to set agianst what is placed
    const listed: Record<string, number> = {};
    for (const h of build.hardware)
    {
        if (h.ref === "609.1500" || h.ref === "606N" || h.ref.includes("SCREW") || h.ref.startsWith("267.07"))
        {
            listed[h.ref] = (listed[h.ref] ?? 0) + h.qty;
        }
    }
    const placedAll = placedHardware(p, build);
    const { drawn } = placedAll;
    // What an article or a screw sits on, named by its PBS code : "Joue gauche" stands in three items of the TV wall
    // and a step of the assembly sequence has to name the one it means
    const tagOf = new Map(parts.map((q) => { return [`${q.item}|${q.label}`, `${q.code} ${q.label}`]; }));
    // The item's own code, read off the PBS : a part's prefix may be one of its sub-assemblies, #110
    const groupOf = new Map(p.items.map((it, k) => { return [it.id, o.bom.pbs.children[k]!.code.slice(0, 4)]; }));
    const tag = (item: string, part: string): string =>
    {
        return tagOf.get(`${item}|${part}`) ?? `${groupOf.get(item) ?? ""} ${part}`.trim();
    };
    const assemblyOf = benchRouting(build, o.bom.codeOfPart, groupOf);
    const instances = assignUnits(placedAll.instances.map((i) =>
    {
        const r = assemblyOf(i.item, i.part, i.model, i.o);
        return { ...i, part: r.host ?? tag(i.item, i.part), assembly: r.assembly };
    }), groupOf);
    const every = placedAll.every.map((s) =>
    {
        // By its tip, the board it goes into : by its head a coupling screw named the box front, its tip in the front
        const tip: Vec3 = [s.point[0] - s.out[0] * s.length, s.point[1] - s.out[1] * s.length,
                           s.point[2] - s.out[2] * s.length];
        const r = assemblyOf(s.item, s.part, s.holds ?? "", tip);
        return { ...s, tag: r.host ?? tag(s.item, s.part), assembly: r.assembly };
    });
    const used = new Set(instances.map((i) =>
    {
        return i.model;
    }));
    // One assembly of the PBS for each item by its id (2 items may share a name), then each of its sub-assemblies
    const assemblies = new Map<string, { code: string; name: string; parent: string | null }>();
    for (const [k, it] of p.items.entries())
    {
        // An item with no board (a device) has nothing to assemble, an empty assembly in the CAD file
        if (parts.some((q) => { return q.item === it.id; }))
        {
            assemblies.set(it.id, { code: `${o.bom.pbs.children[k]!.code}`, name: it.name, parent: null });
        }
    }
    for (const sub of o.bom.subs)
    {
        assemblies.set(sub.key, { code: `${sub.code}-000`, name: sub.name, parent: `${sub.parent}-000` });
    }
    // Carcasses meant to stand loose : nothing ties them to the floor or the wall
    const standing = p.items.filter((it) =>
    {
        return it.kind === "carcass" && it.freeStanding === true;
    }).map((it) =>
    {
        return it.id;
    });
    const models = Object.fromEntries([...Object.entries(CAD_MODELS),
                                       ...Object.entries(drawn)].filter(([k]) => { return used.has(k); }));
    // A sub-assembly lists its item and its parent : the gamme and the CAD tool nest it under that item
    const pbs = [...assemblies].map(([key, a]) =>
    {
        const sub = o.bom.subs.find((s) => { return s.key === key; });
        return { item: sub?.item ?? key, code: a.code, name: a.name, parent: a.parent };
    });
    // A door a wall stops short of its hinges : the angle and the wall, said where it's hung (swing.ts)
    const stops = new Map(build.motions.filter((motion) => { return motion.stoppedBy !== undefined; }).flatMap((motion) =>
    {
        return motion.parts.map((id) => { return [id, { amount: motion.amount, by: motion.stoppedBy! }] as const; });
    }));
    // The article bought for each shape of screw, its designation and its supplier as the costing prices it
    // The merchant the costing knows by its price, the sentence of that price apart
    const priceSource = (ref: string): string | null =>
    {
        const key = `hw:${ref}`;
        return (p.prices[key] ?? DEFAULT_PRICES[key])?.source ?? null;
    };
    const advised = (ref: string, d: ScrewDesignation): object =>
    {
        return { ref, card: d.card, coating: d.coating, propertyClass: d.propertyClass ?? null, why: d.why,
                 supplier: supplierOf(priceSource(ref))?.name ?? NO_SUPPLIER, priceSource: priceSource(ref),
                 advice: SCREW_ADVICE };
    };
    const fasteners = new Map<string, object>();
    for (const s of every.filter((e) => { return e.kind !== "bolt"; }))
    {
        const article = screwArticle(s);
        if (article === undefined)
        {
            throw new Error(`Vis ${s.kind} ${s.diameter} x ${s.length}${s.standard ? " " + s.standard : ""} sans article `
                + "dans SCREW_ARTICLES (data/screws.ts) : l'y ajouter avec sa référence achetée.");
        }
        const key = `${s.kind}:${s.diameter}:${s.length}:${s.standard ?? ""}`;
        fasteners.set(key, { kind: s.kind, diameter: s.diameter, length: s.length, standard: s.standard ?? null,
                             ...advised(article.ref, article.designation) });
    }
    return { schema: CAD_SCHEMA, name: p.name, parts, left, fitted, screws: every, listed, instances, standing, models,
             assemblies: pbs, gamme: withGamme ? gamme(p, parts, instances, every, models, pbs, stops) : null,
             fasteners: [...fasteners.values()], washer: advised(WASHER_REF, WASHER_DESIGNATION),
             sections: handleSection(build.fitted), dowelLength: DOWEL_LENGTH, materials: [...materials.values()],
             // Each calculation of the checks, its inputs and its formulas : the FreeCAD sheet works them out again
             calcNotes: o.analysis.calcNotes };
}
