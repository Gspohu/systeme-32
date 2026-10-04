// A cut-out sawn through a hole already drilled : run once every part of the build is drilled, connectors last

import type { Build, Hole, Part } from "./part_types";
import type { Check } from "./check";
import { insidePolygon, tessellate } from "./geometry";

// the clearance metHole hold between two drillings
const CLEAR = 2;


function edgeDistance(poly: [number, number][], x: number, y: number): number
{
    let best = Infinity;
    let j = poly.length - 1;
    for (let i = 0; i < poly.length; i++)
    {
        const [xi, yi] = poly[i]!;
        const [xj, yj] = poly[j]!;
        const ex = xj - xi;
        const ey = yj - yi;
        const len2 = ex * ex + ey * ey;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * ex + (y - yi) * ey) / len2)) : 0;
        best = Math.min(best, Math.hypot(x - xi - t * ex, y - yi - t * ey));
        j = i;
    }
    return best;
}


// the face holes a cut-out of the part runs into, a screw point counting as Ø4 like in metHole
export function cutThrough(p: Part): Hole[]
{
    const out: Hole[] = [];
    for (const o of p.cutouts)
    {
        const poly = tessellate(o);
        for (const h of p.holes)
        {
            if (h.face !== "A" && h.face !== "B")
            {
                continue;
            }
            const r = (h.diameter === 0 ? 4 : h.diameter) / 2;
            if (insidePolygon(poly, h.u, h.v, 0) || edgeDistance(poly, h.u, h.v) < r + CLEAR)
            {
                out.push(h);
            }
        }
    }
    return out;
}


export function cutoutChecks(b: Build): Check[]
{
    const checks: Check[] = [];
    for (const p of b.parts)
    {
        const labels = [...new Set(cutThrough(p).map((h) =>
        {
            return h.label;
        }))];
        if (labels.length > 0)
        {
            checks.push({ level: "warning", item: p.item, target: null, message: `${p.itemName}, ${p.label} : une `
                + `découpe tombe sur ${labels.join(", ")}. Déplacer la découpe ou le perçage.` });
        }
    }
    return checks;
}
