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
        return {
            id: q.id,
            code: o.bom.codeOfPart.get(q.id) ?? "",
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
    const groupOf = new Map(parts.map((q) => { return [q.item, q.code.slice(0, 4)]; }));
    const tag = (item: string, part: string): string =>
    {
        return tagOf.get(`${item}|${part}`) ?? `${groupOf.get(item) ?? ""} ${part}`.trim();
    };
    const instances = placedAll.instances.map((i) => { return { ...i, part: tag(i.item, i.part) }; });
    const every = placedAll.every.map((s) => { return { ...s, tag: tag(s.item, s.part) }; });
    const used = new Set(instances.map((i) =>
    {
        return i.model;
    }));
    // One assembly of the PBS for each item, as its parts are coded, by its id : 2 items may share a name
    const assemblies = new Map<string, { code: string; name: string }>();
    for (const q of parts)
    {
        assemblies.set(q.item, { code: `${q.code.slice(0, 4)}-000`, name: q.itemName });
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
    const pbs = [...assemblies].map(([item, a]) => { return { item, code: a.code, name: a.name }; });
    return { schema: CAD_SCHEMA, name: p.name, parts, left, fitted, screws: every, listed, instances, standing, models,
             assemblies: pbs, gamme: withGamme ? gamme(p, parts, instances, every, models, pbs) : null,
             sections: handleSection(b.fitted), dowelLength: DOWEL_LENGTH, materials: [...materials.values()] };
}
