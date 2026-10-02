// Finds the panel faces that bound a layuot node, where runners, plates and pins get fixed

import type { Carcass } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import type { Build, Part } from "./parts";
import { byId } from "./edit";
import { panelAtY } from "./dividers";


export interface FaceRef
{
    part: Part;
    face: "A" | "B";
    // local carcass y of the part u origin, to convert heights into part u
    uOrigin: number;
} 


export function sideFace(c: Carcass, lay: ResolvedLayout, b: Build, nb: NodeBox, side: "left" | "right"): FaceRef | null
{
    const t = c.thickness;
    const outer = side === "left" ? Math.abs(nb.x - t) < 0.01 : Math.abs(nb.x + nb.w - (c.width - t)) < 0.01;
    if (outer)
    {
        const p = byId(b.parts, `${c.id}/side/${side === "left" ? "L" : "R"}`);
        return p === undefined ? null : { part: p, face: "A", uOrigin: 0 };
    }
    // an upright bounding the node on that side and spanning its whole height
    const edge = side === "left" ? nb.x : nb.x + nb.w;
    for (const q of lay.dividers)
    {
        const face = side === "left" ? q.x + t : q.x;
        if (q.axis !== "v" || Math.abs(face - edge) >= 0.01 || nb.y < q.y - 0.01 || nb.y + nb.h > q.y + q.h + 0.01)
        {
            continue;
        }
        const p = byId(b.parts, `${c.id}/div/${q.id}`);
        return p === undefined ? null : { part: p, face: side === "left" ? "B" : "A", uOrigin: q.y };
    }
    return null;
}


// The fixed panel a cell hangs things from, and the face of it that looks down
export function panelAbove(c: Carcass, lay: ResolvedLayout, nb: NodeBox, b: Build): { part: Part; face: "A" |
    "B" } | null
{
    if (nb.y + nb.h >= c.height - c.thickness - 0.01)
    {
        const top = byId(b.parts, `${c.id}/top`);
        return top === undefined ? null : { part: top, face: "A" };
    }
    const shelf = panelAtY(c, lay, nb.y + nb.h, nb.x + nb.w / 2, b, "above");
    return shelf === undefined ? null : { part: shelf, face: "B" };
}


// The fixed panel a cell need below it : the bottom of the carcass or a fixed shelf
export function panelBelow(c: Carcass, lay: ResolvedLayout, nb: NodeBox, b: Build): Part | undefined
{
    if (nb.y <= c.thickness + 0.01)
    {
        return byId(b.parts, `${c.id}/bottom`);
    }
    return panelAtY(c, lay, nb.y, nb.x + nb.w / 2, b, "below");
}
