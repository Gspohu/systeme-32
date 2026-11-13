// What a CAD tool needs to rebuild the parts of a project and place them : plain data, the build itself lives apart

import type { Project, WallType } from "../model";
import type { Outputs } from "../outputs";
import type { Build, Part } from "../part_types";
import { at, neg, type Vec3 } from "../geometry";
import { innerOutline, plainRectangle } from "../edge_bands";
import { decorById, materialOfDecor } from "../../data/materials";
import { SCREW_HOLDS, SCREW_SEAT, screwOf, type ScrewSpec } from "../../data/screws";
import { HEAD_SINK } from "../screw_heads";
import { CAD_MODELS, type CadModel } from "../../data/cad_models";
import { cadHardware, DOWEL_LENGTH, handleSection, sameBolt, type CadInstance } from "./cad_hardware";
import { gamme } from "./gamme";
import { benchOfPart } from "../bench";

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
    for (const q of parts)
    {
        if (q.frame === null || q.curve !== null)
        {
            continue;
        }
        for (const h of q.holes)
        {
            // Drilled in its back edge, a long screw runing in the width of a cleat into what it carries
            if (h.purpose === "cleat-screw" && (h.face === "v1" || h.face === "v0"))
            {
                const edge = screwOf(h.purpose, h.label);
                if (edge !== null)
                {
                    const sink = h.countersink !== undefined ? HEAD_SINK : 0;
                    const back = h.face === "v0";
                    out.push({ ...edge, item: q.item, point: at(q.frame, h.u, back ? sink : q.width - sink,
                                                                h.w ?? q.thickness / 2),
                               out: back ? neg(q.frame.v) : q.frame.v, free: h.depth - sink, part: q.label, label: h.label,
                               purpose: h.purpose,
                               joins: sink > 0 });
                }
                continue;
            }
            const spec = h.face === "A" || h.face === "B" ? screwOf(h.purpose, h.label) : null;
            if (spec === null)
            {
                continue;
            }
            const way = h.face === "A" ? neg(q.frame.n) : q.frame.n;
            // On the seat of what it holds, or a little under the face of the wood
            const seat = h.countersink !== undefined ? -HEAD_SINK : SCREW_SEAT[h.purpose] ?? 0;
            const face = at(q.frame, h.u, h.v, h.face === "A" ? 0 : q.thickness);
            const point: Vec3 = [face[0] + way[0] * seat, face[1] + way[1] * seat, face[2] + way[2] * seat];
            if (spec.kind === "bolt")
            {
                if (bolts.some((b) => { return sameBolt(b, point, way, spec.length); }))
                {
                    continue;
                }
                bolts.push(point);
            }
            out.push({ ...spec, item: q.item, point, out: way, free: h.depth + Math.max(seat, 0), part: q.label,
                      label: h.label,
                       purpose: h.purpose,
                       holds: SCREW_HOLDS[h.purpose], joins: h.countersink !== undefined });
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


// The assembly an article or a screw belongs to : that of the board it sits on, or for what is built on the bench from
// a drilling of the carcass, that of the nearest board of a sub-assembly of the same item, then named after that
// board. Named after the side, the couplings of 2 drawers on one upright read alike and each step took both
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


export function cadModel(p: Project, o: Outputs, withGamme = false): object
{
    const b = o.analysis.build;
    const materials = new Map<string, object>();
    const glued = new Set(b.hardware.filter((h) => { return h.ref === "GLUE_PU" &&
                                                    h.target !== null; }).map((h) => { return h.target!; }));
    const parts = b.parts.filter((q) =>
    {
        return q.frame !== null && q.curve === null;
    }).map((q) =>
    {
        const decor = decorById(q.decor);
        const m = materialOfDecor(decor);
        materials.set(m.id, { id: m.id, label: m.label, density: m.density, modulus: m.modulus, strength: m.strength,
                              source: m.source });
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
            // Screw marks hold no diameter : no machining, they stay on the tables of the drawings
            holes: q.holes.filter((h) =>
            {
                return h.diameter > 0 && h.depth > 0;
            }).map((h) =>
            {
                return { u: h.u, v: h.v, w: h.w, diameter: h.diameter, depth: h.depth, face: h.face, label: h.label,
                         purpose: h.purpose, countersink: h.countersink };
            }),
            grooves: q.grooves,
            pockets: q.pockets ?? [],
            // Each banded edge, a solid of its own in the finished size, on a plain rectangle only : any other outline
            // the quarter rounds included, is banded by hand
            bands: decor.edgeThickness === undefined || !plainRectangle(q.outline, q.length, q.width) ? []
                : q.edges.map((e) => { return { edge: e, thickness: decor.edgeThickness! }; }),
            // Any other outline : the board cut to the outline its banding leaves, its banding one bent body around
            // its banded segments, arcs included
            bandInner: decor.edgeThickness === undefined || q.edges.length === 0 || plainRectangle(q.outline,
                q.length, q.width)
                ? null : innerOutline(q.outline, q.length, q.width, q.edges, decor.edgeThickness),
            material: m.id,
            // Held by glue alone, its fixing no solid : the filler up to the ceiling on its cleat
            glued: glued.has(q.id),
            decor: `${decor.ref} ${decor.label}`.trim(),
            rgb: decor.rgb,
            notes: q.notes,
        };
    });
    const left = b.parts.filter((q) =>
    {
        return q.frame === null || q.curve !== null;
    }).map((q) =>
    {
        return q.label;
    });
    const fitted = b.fitted.filter((f) =>
    {
        return f.host === null && f.purpose !== "runner";
    }).map((f) =>
    {
        return { key: f.key, item: f.item, label: f.label, ref: f.ref, purpose: f.purpose, shape: f.shape,
                 centre: f.centre, axes: f.axes, half: f.half };
    });
    // What the hardware list counts, to set agianst what is placed
    const listed: Record<string, number> = {};
    for (const h of b.hardware)
    {
        if (h.ref === "609.1500" || h.ref.includes("SCREW") || h.ref.startsWith("267.07"))
        {
            listed[h.ref] = (listed[h.ref] ?? 0) + h.qty;
        }
    }
    const placedAll = placedHardware(p, b);
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
    const assemblyOf = benchRouting(b, o.bom.codeOfPart, groupOf);
    const instances = assignUnits(placedAll.instances.map((i) =>
    {
        const r = assemblyOf(i.item, i.part, i.model, i.o);
        return { ...i, part: r.host ?? tag(i.item, i.part), assembly: r.assembly };
    }), groupOf);
    const every = placedAll.every.map((s) =>
    {
        const r = assemblyOf(s.item, s.part, s.holds ?? "", s.point);
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
    return { schema: CAD_SCHEMA, name: p.name, parts, left, fitted, screws: every, listed, instances, standing, models,
             assemblies: pbs, gamme: withGamme ? gamme(p, parts, instances, every, models, pbs) : null,
             sections: handleSection(b.fitted), dowelLength: DOWEL_LENGTH, materials: [...materials.values()] };
}
