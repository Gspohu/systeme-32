// Front view hit testing : which item, which deepest cell, and the local coordinates under a world point

import type { Carcass, Item, Project, Wall } from "../core/model";
import type { Analysis } from "../core/analysis";
import type { NodeBox } from "../core/layout";
import { itemExtent } from "../core/extent";


export interface Hit
{
    x: number;
    y: number;
    item: Item | null;
    carcass: Carcass | null;
    // deepest cell under the point and the chain of its ancestors, innermost first
    cell: NodeBox | null;
    chain: NodeBox[];
    local: [number, number];
}


function inside(n: NodeBox, x: number, y: number): boolean
{
    return x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h;
}


export function itemContains(it: Item, x: number, y: number): boolean
{
    if (it.kind === "corner")
    {
        const dx = (x - it.cx) * (it.quadrant.endsWith("Right") ? 1 : -1);
        const dy = (y - it.cy) * (it.quadrant.startsWith("top") ? 1 : -1);
        const r = Math.hypot(dx, dy);
        return dx >= 0 && dy >= 0 && r <= it.outerRadius && r >= it.innerRadius;
    }
    const e = itemExtent(it);
    return x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1;
}


export function hitTest(p: Project, a: Analysis, x: number, y: number, wall: Wall): Hit
{
    const out: Hit = { x, y, item: null, carcass: null, cell: null, chain: [], local: [x, y] };
    // later items are drawn on top and win the hit, only those of the wall on screen
    let k = p.items.length - 1;
    while (k >= 0)
    {
        const it = p.items[k]!;
        k--;
        if (it.wall !== wall || !itemContains(it, x, y))
        {
            continue;
        }
        out.item = it;
        if (it.kind !== "carcass")
        {
            return out;
        }
        out.carcass = it;
        const lx = x - it.x;
        const ly = y - it.y;
        out.local = [lx, ly];
        const lay = a.build.layouts.get(it.id);
        if (lay === undefined)
        {
            return out;
        }
        const hits: NodeBox[] = [];
        for (const n of lay.nodes.values())
        {
            if (inside(n, lx, ly))
            {
                hits.push(n);
            }
        }
        // parnts always contain their children : sort by area, smallest first
        hits.sort((m, n) =>
        {
            return m.w * m.h - n.w * n.h;
        });
        out.chain = hits;
        for (const n of hits)
        {
            if (out.cell === null && n.kind === "cell")
            {
                out.cell = n;
            }  
        }
        return out;
    }
    return out;
}
