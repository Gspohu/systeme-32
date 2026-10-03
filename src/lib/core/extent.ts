// Front view extent of each item, rounded ends and plinth includd, shared by checks, drawings and the editor

import type { Carcass, Item, Screen } from "./model";
import { baseHeight } from "./parts";
import { slatsDepth } from "./slats";


export interface Extent
{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}


// Depth from the front face to the applied back, the room a rounded end can curve in
export function usableDepth(c: Carcass): number
{
    return c.depth - (c.back.type === "applied" ? c.back.thickness : 0);
}


// Outer radius of a rounded end, which is also how far it reaches past the side of its carcass
export function endReach(c: Carcass, side: "left" | "right"): number
{
    const end = c.ends[side];
    if (end.type !== "rounded")
    {
        return 0;
    }
    const usable = usableDepth(c);
    if (end.sweep === 180)
    {
        return usable / 2;
    }
    return Math.min(end.radius, usable);
}


// Width of the filler strip on one side of a carcass, 0 without one
export function sideFiller(c: Carcass, side: "left" | "right"): number
{
    return Math.max(0, c.sideFillers?.[side] ?? 0);
}


export function itemExtent(it: Item): Extent
{
    if (it.kind === "carcass")
    {
        return {
            x0: it.x - Math.max(endReach(it, "left"), sideFiller(it, "left")),
            y0: it.y - baseHeight(it),
            x1: it.x + it.width + Math.max(endReach(it, "right"), sideFiller(it, "right")),
            // a cushin on a seat need room above the top
            y1: it.y + it.height + (it.seat === null ? 0 : it.seat.cushion),
        };
    }
    if (it.kind === "corner")
    {
        const xFar = it.cx + (it.quadrant.endsWith("Right") ? 1 : -1) * it.outerRadius;
        const yFar = it.cy + (it.quadrant.startsWith("top") ? 1 : -1) * it.outerRadius;
        return { x0: Math.min(it.cx, xFar), y0: Math.min(it.cy, yFar), x1: Math.max(it.cx, xFar),
                y1: Math.max(it.cy, yFar) };
    }
    if (it.kind === "wallShelf")
    {
        return { x0: it.x, y0: it.y, x1: it.x + it.width, y1: it.y + it.thickness };
    }
    if (it.kind === "ladder")
    {
        // the rail only : the ladder hangs in front of the shelves and its foot depends on its slope
        return { x0: it.x, y0: it.y - it.railDiameter / 2, x1: it.x + it.width, y1: it.y + it.railDiameter / 2 };
    }
    return { x0: it.x, y0: it.y, x1: it.x + it.width, y1: it.y + it.height };
}


// Width and height in mm of a screen given by its diagonal in inches and its aspect ratio
export function screenSize(sc: Screen): { w: number; h: number } 
{
    const diag = sc.diagonalInch * 25.4;
    const k = Math.hypot(sc.aspectW, sc.aspectH);
    return { w: diag * sc.aspectW / k, h: diag * sc.aspectH / k };
}


// Distance from the back of the item to its front, for the overlap and screen checks
export function itemDepth(it: Item): number
{
    if (it.kind === "ladder")
    {
        return it.railDiameter;
    }
    return it.kind === "slats" ? slatsDepth(it) : it.depth;
}


export function projectExtent(items: Item[]): Extent
{
    if (items.length === 0)
    {
        return { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    }
    const all: Extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const it of items)
    {
        const box = itemExtent(it);
        all.x0 = Math.min(all.x0, box.x0);
        all.y0 = Math.min(all.y0, box.y0);
        all.x1 = Math.max(all.x1, box.x1);
        all.y1 = Math.max(all.y1, box.y1);
    }
    return all;
}
