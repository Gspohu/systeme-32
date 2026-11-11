// The connectors of each butt joint : Minifix, dowels or Clamex, set on the system 32 rows and off any hole drilled

import type { Settings } from "./model";
import type { Build, Joint, Part } from "./parts";
import { byId } from "./edit";
import { spread } from "./fittings";
import { meets } from "./drilling";
import { MINIFIX, LAMELLO_P14 } from "../data/rules";
import { DIAM } from "./text";
import { at, type Vec3 } from "./geometry";

// Nearest a connector comes to either end of its joint once moved off a clash
const JOINT_END_CLEAR = 10;


// A light screwed on the face a housing opens on would cover it : no way to turn the cam once it's up. The profile
// of the dresser niche lay over the two front housings of its top
const HOUSING_CLEAR = 2;

function underLight(b: Build, ep: Part, face: "A" | "B", u: number, v: number): boolean
{
    const f = ep.frame;
    if (f === null)
    {
        return false;
    }
    const q = at(f, u, v, face === "A" ? 0 : ep.thickness);
    const reach = MINIFIX.housingDiameter / 2 + HOUSING_CLEAR;
    return b.fitted.some((x) =>
    {
        if (x.purpose !== "light" || x.shape !== "box")
        {
            return false;
        }
        // In the frame of the light : within its length and width grown by the housing, against its back
        const d: Vec3 = [q[0] - x.centre[0], q[1] - x.centre[1], q[2] - x.centre[2]];
        const along = (k: 0 | 1 | 2): number => { return Math.abs(d[0] * x.axes[k][0] + d[1] *
                                                                  x.axes[k][1] + d[2] * x.axes[k][2]); };
        return along(0) <= x.half[0] + reach && along(1) <= x.half[1] + reach && along(2) <= x.half[2] + HOUSING_CLEAR;
    });
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
                                label: `Accès levier Clamex ${DIAM}6, position selon notice Lamello`,
                                purpose: "clamex-access" });
                clamex++;
            }
            continue;
        }
        // One connector on each 37 row, those between on the system 32 grid counted from the front one. The line
        // is the face part's : a piece standing back starts its joint further in, its first connector goes to
        // the next hole of that line
        const even = spread(len, s.connectorInset, 256);
        const toLine = (x: number, up: boolean): number =>
        {
            const k = (joint.from + x - s.connectorInset) / s.grid;
            return s.connectorInset + (up ? Math.ceil(k - 1e-9) : Math.round(k)) * s.grid - joint.from;
        };
        let positions = even;
        if (onGrid && s.grid > 0 && even.length > 0)
        {
            const inner = even.length <= 2 ? [] : even.slice(1, -1).map((x) =>
            {
                return toLine(x, false);
            });
            const moved = toLine(even[0]!, true);
            const first = joint.from > 0 && moved <= len - s.connectorInset ? moved : even[0]!;
            positions = [...new Set([first, ...inner, ...even.slice(1).slice(-1)])];
        }
        let k = 0;
        while (k < positions.length)
        {
            const endConnector = s.joinery === "minifix" && joint.dowelsOnly !== true
                && (k === 0 || k === positions.length - 1);
            // The first of pos, then a 32 grid step either side, where the connector meets no hole already drilled
            const free = (q: number): boolean =>
            {
                const g = onFace(q);
                if (endConnector)
                {
                    // The passage of the bolt runs in the middle of the board from its edge to the housing : a hole
                    // through the board on its way, the lead of a light by the end of a side, cuts it
                    const passage = [4, 14, 24, MINIFIX.distanceB].every((d) =>
                    {
                        return !meets(ep, "A", edgeU + inward * d, joint.edgeFrom + q, 8, edgeThickness / 2 + 4);
                    });
                    return passage && !meets(fpart, joint.face, g.u, g.v, MINIFIX.boltPilot, MINIFIX.boltDepth)
                        && !meets(ep, joint.housingFace ?? "A", edgeU + inward * MINIFIX.distanceB, joint.edgeFrom + q,
                                  MINIFIX.housingDiameter, MINIFIX.housingDepth)
                        && !underLight(b, ep, joint.housingFace ?? "A", edgeU + inward * MINIFIX.distanceB,
                                       joint.edgeFrom + q);
                }
                return !meets(fpart, joint.face, g.u, g.v, 8, s.dowelFaceDepth);
            };
            // A Minifix housing need 5 mm of board beside it, a short joint falls back on half steps
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
            // Half steps only when no place on the grid is free, a narrow piece like the upright of a seat
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
                                   label: `Goujon Minifix 262.28.020, avant-trou ${DIAM}5`, purpose: "minifix-bolt" });
                ep.holes.push({ u: edgeU + inward * MINIFIX.distanceB, v: joint.edgeFrom + pos,
                                diameter: MINIFIX.housingDiameter, depth: MINIFIX.housingDepth,
                                face: joint.housingFace ?? "A",
                                label: `Boîtier Minifix 262.26.535 ${DIAM}15`, purpose: "minifix-housing" });
                ep.holes.push({ u: edgeU, v: joint.edgeFrom + pos, diameter: 8, depth: MINIFIX.distanceB,
                                face: joint.edge, w: edgeThickness / 2, label: `Passage du goujon ${DIAM}8`,
                                purpose: "minifix-passage" });
                minifix++;
            }
            else
            {
                fpart.holes.push({ ...f, diameter: 8, depth: s.dowelFaceDepth, face: joint.face,
                                   label: `Tourillon ${DIAM}8 x 35`, purpose: "dowel" });
                ep.holes.push({ u: edgeU, v: joint.edgeFrom + pos, diameter: 8, depth: s.dowelEdgeDepth,
                                face: joint.edge, w: edgeThickness / 2, label: `Tourillon ${DIAM}8 x 35`, purpose: "dowel" });
                dowels++;
            }
            k++;
        }
    }
    if (minifix > 0)
    {
        b.hardware.push({ ref: "262.26.535", qty: minifix, item: itemId, itemName, target: null, note: null,
                          purpose: "minifix-housing" });
        b.hardware.push({ ref: "262.28.020", qty: minifix, item: itemId, itemName, target: null, note: null,
                          purpose: "minifix-bolt" });
    }
    if (dowels > 0)
    {
        b.hardware.push({ ref: "DOWEL_8x35", qty: dowels, item: itemId, itemName, target: null, note: "collés",
                          purpose: "dowel" });
    }
    if (clamex > 0)
    {
        b.hardware.push({ ref: "145334", qty: Math.ceil(clamex / 80), item: itemId, itemName, target: null,
                         note: `${clamex} paires utilisées`, purpose: "clamex" });
    }
}
