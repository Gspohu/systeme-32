// Resolves a cracass layout tree into rectangles in the carcass front view (local mm, origin bottom left of the box)

import type { BackMount, Carcass, DividerKind, Finish, LayoutNode, SplitNode } from "./model";

export interface Rect
{
    x: number;
    y: number;
    w: number;  
    h: number;
}


// What stands on each side of a node : the carcass shell or a divider shared with a negihbour
export type Boundary = "outer" | "divider";

// thickness of the panel bounding a node on each side, shell or divider
export interface Walls
{
    left: number;
    right: number;
    bottom: number;
    top: number;
}

export interface NodeBox extends Rect
{
    id: string;
    kind: "split" | "cell";
    parent: string | null;
    left: Boundary;
    right: Boundary;
    bottom: Boundary;
    top: Boundary;
    walls: Walls;
}

export interface DividerBox extends Rect
{
    id: string;
    split: string;
    index: number;
    axis: "h" | "v";
    kind: DividerKind;
    finish: Finish | null;
}


export interface ResolvedLayout
{
    inner: Rect;
    // depth span of the inner space, z measured from the back of the box
    zBack: number;
    zFront: number;
    nodes: Map<string, NodeBox>;
    dividers: DividerBox[];
    errors: string[];
}


export const MIN_CELL = 32;


export function innerDepthStart(back: BackMount): number
{
    if (back.type === "applied")
    {
        return back.thickness;
    }
    if (back.type === "groove")
    {
        return back.offset + back.thickness;
    }
    return 0;
}


// A shelf has its own thickness, else the one of the carcass shelves, else the one of the sides
// an upright always stay as thick as the sides
// TODO an upright of its own thickness is not offered yet
export function dividerThickness(c: Carcass, axis: "h" | "v", own: number | null): number
{
    if (axis === "v")
    {
        return c.thickness;
    }
    return own ?? c.shelfThickness ?? c.thickness;
}


export function resolveLayout(c: Carcass): ResolvedLayout
{
    const t = c.thickness;
    const inner: Rect = { x: t, y: t, w: c.width - 2 * t, h: c.height - 2 * t };
    const out: ResolvedLayout = {
        inner,
        zBack: innerDepthStart(c.back),
        zFront: c.depth,
        nodes: new Map(),
        dividers: [],
        errors: [],
    };
    if (inner.w < MIN_CELL || inner.h < MIN_CELL)
    {
        out.errors.push(`Caisson "${c.name}" trop petit pour son épaisseur de panneau.`);
        return out;
    }
    walk(c.root, inner, null, { left: "outer", right: "outer", bottom: "outer", top: "outer",
                                walls: { left: t, right: t, bottom: t, top: t } }, c, out);
    return out;
}


interface Sides
{
    left: Boundary;
    right: Boundary;
    bottom: Boundary;
    top: Boundary;
    walls: Walls;
}

function walk(node: LayoutNode, r: Rect, parent: string | null, sides: Sides, c: Carcass, out: ResolvedLayout): void
{
    out.nodes.set(node.id, { id: node.id, kind: node.kind, parent, ...r, ...sides });
    if (node.kind === "cell")
    {
        return;
    }
    const thick = node.cuts.map((_, k) =>
    {
        return dividerThickness(c, node.axis, node.thicknesses[k] ?? null);
    });
    const spans = childSpans(node, r, thick, out);
    let i = 0;
    while (i < node.children.length)
    {
        const child = node.children[i]!;
        const span = spans[i]!;
        const first = i === 0;
        const last = i === node.children.length - 1;
        let cr: Rect;
        let cs: Sides;
        if (node.axis === "h")
        {
            cr = { x: r.x, y: span.start, w: r.w, h: span.end - span.start };
            cs = {
                left: sides.left,
                right: sides.right,
                bottom: first ? sides.bottom : "divider",
                top: last ? sides.top : "divider",
                walls: { ...sides.walls, bottom: first ? sides.walls.bottom : thick[i - 1]!,
                         top: last ? sides.walls.top : thick[i]! },
            };
        }
        else
        {
            cr = { x: span.start, y: r.y, w: span.end - span.start, h: r.h };
            cs = {
                left: first ? sides.left : "divider",
                right: last ? sides.right : "divider",
                bottom: sides.bottom,
                top: sides.top,
                walls: { ...sides.walls, left: first ? sides.walls.left : thick[i - 1]!,
                         right: last ? sides.walls.right : thick[i]! },
            };
        }
        walk(child, cr, node.id, cs, c, out);
        i++;
    }
}


function childSpans(node: SplitNode, r: Rect, thick: number[], out: ResolvedLayout): { start: number; end: number }[]
{
    const origin = node.axis === "h" ? r.y : r.x;
    const length = node.axis === "h" ? r.h : r.w;
    const spans: { start: number; end: number }[] = [];
    if (node.children.length !== node.cuts.length + 1)
    {
        out.errors.push(`Découpe ${node.id} incohérente : ${node.cuts.length} séparations pour `
            + `${node.children.length} cases.`);
    }
    let cursor = origin;
    let k = 0;
    while (k < node.cuts.length)
    {
        const cut = node.cuts[k]!;
        const start = origin + cut;
        if (cut - (cursor - origin) < MIN_CELL)
        {
            out.errors.push(`Séparation trop proche de la précédente dans ${node.id} (${Math.round(cut)} mm).`);
        }
        spans.push({ start: cursor, end: start });
        const finish = node.finishes[k] ?? null;
        const t = thick[k]!;
        const d: DividerBox = node.axis === "h"
            ? { id: `${node.id}:${k}`, split: node.id, index: k, axis: "h", kind: node.dividers[k] ?? "fixed", 
               finish, x: r.x, y: start, w: r.w, h: t }
            : { id: `${node.id}:${k}`, split: node.id, index: k, axis: "v", kind: "fixed", finish, x: start, y: r.y,
               w: t, h: r.h };
        out.dividers.push(d);
        cursor = start + t;   
        k++;
    }
    if (origin + length - cursor < MIN_CELL)
    {
        out.errors.push(`Dernière case de ${node.id} trop petite.`);
    }
    spans.push({ start: cursor, end: origin + length });
    return spans;
}


// Snap a position measured from the carcass inner origin onto the boring grid
export function snap(value: number, grid: number): number
{
    if (grid <= 0)
    {
        return Math.round(value);
    }
    return Math.round(value / grid) * grid;
}


export function findNode(root: LayoutNode, id: string): LayoutNode | null
{
    if (root.id === id)
    {
        return root;
    }
    if (root.kind === "split")
    {
        for (const ch of root.children)
        {
            const f = findNode(ch, id);
            if (f !== null)
            {
                return f;
            }
        }
    }
    return null;
}


export function findParent(root: LayoutNode, id: string): SplitNode | null
{
    if (root.kind === "cell")
    {
        return null;
    }
    for (const ch of root.children)
    {
        if (ch.id === id)
        {
            return root;
        }
        const f = findParent(ch, id);
        if (f !== null)
        {
            return f;
        }
    }
    return null;
}


export function cells(root: LayoutNode): string[]
{
    if (root.kind === "cell")
    {
        return [root.id];
    }
    return root.children.flatMap(cells);
}


// Descendants including the node itself
export function subtreeIds(root: LayoutNode): string[]
{
    if (root.kind === "cell")
    {
        return [root.id];
    }
    return [root.id, ...root.children.flatMap(subtreeIds)];
}
