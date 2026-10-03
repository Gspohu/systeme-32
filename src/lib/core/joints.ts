// The connectors of each butt joint : Minifix, dowels or Clamex, set on the system 32 rows and off any hole drilled

import type { Settings } from "./model";
import type { Build, Joint, Part } from "./parts";
import { byId } from "./edit";
import { spread } from "./fittings";
import { MINIFIX, LAMELLO_P14 } from "../data/rules";
import { DIAM } from "./text";

// Nearest a connector comes to either end of its joint once moved off a clash
const JOINT_END_CLEAR = 10;


// A face drilling at (u, v) meets a hole already there : on the same face when the circles come within 2 mm, from
// the other face when both run into each other. A screw point counts as Ø4 x 15
export function meets(p: Part, face: "A" | "B", u: number, v: number, diameter: number, depth: number): boolean
{
    for (const h of p.holes)
    {
        if (h.face !== "A" && h.face !== "B")
        {
            continue;
        }
        const d = h.diameter === 0 ? 4 : h.diameter;
        const deep = h.depth === 0 ? 15 : h.depth;
        if (Math.hypot(h.u - u, h.v - v) < (d + diameter) / 2 + 2 && (h.face === face || deep + depth >= p.thickness))
        {
            return true;
        }
    }
    return false;
}


export function fitJoints(joints: Joint[], s: Settings, b: Build, itemId: string, itemName: string,
    onGrid = true): void
{
    let minifix = 0;
    let dowels = 0;
    let clamex = 0;
    for (const joint of joints)
    {
        const ep = byId(b.parts, joint.edgePart);
        const fpart = byId(b.parts, joint.facePart);
        if (ep === undefined || fpart === undefined)
        {
            continue;
        }
        const len = joint.to - joint.from;
        const edgeThickness = ep.thickness;
        const edgeU = joint.edge === "u0" ? 0 : ep.length;
        const inward = joint.edge === "u0" ? 1 : -1;
        const alongU = joint.lineAxis === "u";
        const onFace = (pos: number): { u: number; v: number } =>
        {
            return alongU ? { u: joint.line, v: joint.from + pos } : { u: joint.from + pos, v: joint.line };
        };
        if (s.joinery === "clamex")
        {
            for (const pos of spread(len, Math.max(60, s.connectorInset), 400))
            {
                const f = onFace(pos);
                const mid = alongU ? f.v : f.u;
                fpart.grooves.push({ face: joint.face, along: alongU ? "v" : "u", at: alongU ? f.u : f.v,
                                     from: mid - 35, to: mid + 35, width: LAMELLO_P14.grooveWidth,
                                     depth: LAMELLO_P14.grooveDepth, label: "Rainure P-System P-14 (Zeta P2 ou CN)" });
                ep.grooves.push({ face: "A", along: "v", at: edgeU, from: joint.edgeFrom + pos - 35,
                                  to: joint.edgeFrom + pos + 35, width: LAMELLO_P14.grooveWidth,
                                  depth: LAMELLO_P14.grooveDepth, label: "Rainure P-System P-14 dans le chant" });
                ep.holes.push({ u: edgeU + inward * 13.5, v: joint.edgeFrom + pos,
                                diameter: LAMELLO_P14.accessDiameter, depth: 0, face: "A",
                                label: `Accès levier Clamex ${DIAM}6, position selon notice Lamello` });
                clamex++;
            }
            continue;
        }
        // one connector on each 37 row, those between on the system 32 grid counted from the front one
        const even = spread(len, s.connectorInset, 256);
        const positions = !onGrid || s.grid <= 0 || even.length <= 2 ? even : [...new Set([even[0]!,
            ...even.slice(1, -1).map((x) =>
        {
            return s.connectorInset + Math.round((x - s.connectorInset) / s.grid) * s.grid;
        }), even[even.length - 1]!])];
        let k = 0;
        while (k < positions.length)
        {
            const endConnector = s.joinery === "minifix" && (k === 0 || k === positions.length - 1);
            // the first of pos, then a 32 grid step either side, where the connector meets no hole already drilled
            const free = (q: number): boolean =>
            {
                const g = onFace(q);
                if (endConnector)
                {
                    return !meets(fpart, joint.face, g.u, g.v, MINIFIX.boltPilot, MINIFIX.boltDepth)
                        && !meets(ep, "A", edgeU + inward * MINIFIX.distanceB, joint.edgeFrom + q,
                                  MINIFIX.housingDiameter, MINIFIX.housingDepth);
                }
                return !meets(fpart, joint.face, g.u, g.v, 8, s.dowelFaceDepth);
            };
            // a Minifix housing need 5 mm of board beside it, a short joint falls back on half steps
            const clear = endConnector ? MINIFIX.housingDiameter / 2 + 5 : JOINT_END_CLEAR;
            const within = (d: number): number | null =>
            {
                const q = positions[k]! + d;
                return q >= clear && q <= len - clear ? q : null;
            };
            const placed = (q: number | null): q is number =>
            {
                return q !== null;
            };
            const grid = [0, 32, -32, 64, -64, 96, -96].map(within).filter(placed);
            // half steps only when no place on the grid is free, a narrow piece like the upright of a seat
            const half = [16, -16].map(within).filter(placed);
            const pos = grid.find(free) ?? half.find(free) ?? positions[k]!;
            if (!free(pos))
            {
                b.errors.push(`${itemName}, ${ep.label.toLowerCase()} contre ${fpart.label.toLowerCase()} : le `
                    + `connecteur à ${Math.round(positions[k]!)} mm tombe sur un perçage voisin, sans place libre à `
                    + "96 mm près. Déplacer l'un des deux panneaux.");
            }
            const f = onFace(pos);
            if (endConnector)
            {
                fpart.holes.push({ ...f, diameter: MINIFIX.boltPilot, depth: MINIFIX.boltDepth, face: joint.face,
                                   label: `Goujon Minifix 262.28.020, avant-trou ${DIAM}5` });
                ep.holes.push({ u: edgeU + inward * MINIFIX.distanceB, v: joint.edgeFrom + pos,
                                diameter: MINIFIX.housingDiameter, depth: MINIFIX.housingDepth, face: "A",
                                label: `Boîtier Minifix 262.25.035 ${DIAM}15` });
                ep.holes.push({ u: edgeU, v: joint.edgeFrom + pos, diameter: 8, depth: MINIFIX.distanceB,
                                face: joint.edge, w: edgeThickness / 2, label: `Passage du goujon ${DIAM}8` });
                minifix++;
            }
            else
            {
                fpart.holes.push({ ...f, diameter: 8, depth: s.dowelFaceDepth, face: joint.face,
                                   label: `Tourillon ${DIAM}8 x 35` });
                ep.holes.push({ u: edgeU, v: joint.edgeFrom + pos, diameter: 8, depth: s.dowelEdgeDepth,
                                face: joint.edge, w: edgeThickness / 2, label: `Tourillon ${DIAM}8 x 35` });
                dowels++;
            }
            k++;
        }
    }
    if (minifix > 0)
    {
        b.hardware.push({ ref: "262.25.035", qty: minifix, item: itemId, itemName, target: null, note: null });
        b.hardware.push({ ref: "262.28.020", qty: minifix, item: itemId, itemName, target: null, note: null });
    }
    if (dowels > 0)
    {
        b.hardware.push({ ref: "DOWEL_8x35", qty: dowels, item: itemId, itemName, target: null, note: "collés" });
    }
    if (clamex > 0)
    {
        b.hardware.push({ ref: "145334", qty: Math.ceil(clamex / 80), item: itemId, itemName, target: null,
                         note: `${clamex} paires utilisées` });
    }
}
