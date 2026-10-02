// Front panels (doors, drawer fronts, sliding leaves) derived from the fronts attached to layout nodes

import type { Carcass, Front, Settings } from "./model";
import type { NodeBox, Rect, ResolvedLayout } from "./layout";
import { OVERLAY_X_FULL, OVERLAY_X_TWIN, INSET_PLATE_SHIFT } from "../data/rules";

export type HingeKind = "full" | "twin" | "inset";


export interface FrontPanel
{
    id: string;
    front: string;
    node: string;
    role: "door" | "drawer" | "leaf" | "flap" | "panel";
    index: number;
    rect: Rect;
    // z of the back face of the panel, from the back of the carcass box
    z: number;
    thickness: number;
    decor: string;
    hinge: "left" | "right" | null;
    hingeKind: HingeKind | null;
    // overlay on the hinge side, used to derive the cup distance TB
    hingeOverlay: number;
}


function frontThickness(c: Carcass): number
{
    return c.thickness;
}


// Overlay of a front edge : most of the shell panel when outer, half the divider when shared
function edgeOffset(boundary: "outer" | "divider", t: number, s: Settings, mount: Front["mount"]): number
{
    if (mount === "inset")
    {
        return -s.frontGap / 2;
    }
    if (boundary === "outer")
    {
        return t - s.edgeReveal;
    }
    return t / 2 - s.frontGap / 2;
}


export function frontOuterRect(nb: NodeBox, s: Settings, mount: Front["mount"]): Rect
{
    // a thicker shelf need half of its own thickness covered, not half of the sides
    const l = edgeOffset(nb.left, nb.walls.left, s, mount);
    const r = edgeOffset(nb.right, nb.walls.right, s, mount);
    const b = edgeOffset(nb.bottom, nb.walls.bottom, s, mount);
    const tp = edgeOffset(nb.top, nb.walls.top, s, mount);
    return { x: nb.x - l, y: nb.y - b, w: nb.w + l + r, h: nb.h + b + tp };
}


function hingeKindFor(nb: NodeBox, side: "left" | "right", mount: Front["mount"]): HingeKind
{
    if (mount === "inset")
    {
        return "inset";
    }
    const boundary = side === "left" ? nb.left : nb.right;
    return boundary === "outer" ? "full" : "twin";
}


export function frontPanels(c: Carcass, lay: ResolvedLayout, s: Settings): FrontPanel[]
{
    const out: FrontPanel[] = [];
    const ft = frontThickness(c);
    for (const front of c.fronts)
    {
        const nb = lay.nodes.get(front.node);
        if (nb === undefined)
        {
            continue;
        }
        const outer = frontOuterRect(nb, s, front.mount);
        const z = front.mount === "inset" ? c.depth - ft : c.depth;
        const base = { front: front.id, node: front.node, z, thickness: ft, decor: front.decor ?? c.decor };
        const spec = front.spec;
        const hingeOverlayOf = (side: "left" | "right"): number =>
        {
            return side === "left" ? nb.x - outer.x : outer.x + outer.w - (nb.x + nb.w);
        };
        if (spec.type === "door")
        {
            out.push({
                ...base,
                id: `${front.id}#0`,
                role: "door",
                index: 0,
                rect: outer,
                hinge: spec.hinge,
                hingeKind: hingeKindFor(nb, spec.hinge, front.mount),
                hingeOverlay: hingeOverlayOf(spec.hinge),
            });
        }
        else if (spec.type === "doubleDoor")
        {
            const leafW = (outer.w - s.frontGap) / 2;
            out.push({
                ...base,
                id: `${front.id}#0`,
                role: "door",
                index: 0,
                rect: { x: outer.x, y: outer.y, w: leafW, h: outer.h },
                hinge: "left",
                hingeKind: hingeKindFor(nb, "left", front.mount),
                hingeOverlay: hingeOverlayOf("left"),
            });
            out.push({
                ...base,
                id: `${front.id}#1`,
                role: "door",
                index: 1,
                rect: { x: outer.x + leafW + s.frontGap, y: outer.y, w: leafW, h: outer.h },
                hinge: "right",
                hingeKind: hingeKindFor(nb, "right", front.mount),
                hingeOverlay: hingeOverlayOf("right"),
            });
        }
        else if (spec.type === "lift" || spec.type === "panel")
        {
            out.push({ ...base, id: `${front.id}#0`, role: spec.type === "lift" ? "flap" : "panel",
                      index: 0, rect: outer,
                       hinge: null, hingeKind: null, hingeOverlay: 0 });
        }
        else if (spec.type === "drawers")
        {
            const n = Math.max(1, Math.round(spec.count));
            const ratios = spec.ratios !== undefined && spec.ratios.length === n
                ? spec.ratios
                : new Array<number>(n).fill(1);
            let total = 0;
            for (const r of ratios)
            {
                total += r;
            }
            const usable = outer.h - (n - 1) * s.frontGap;
            let y = outer.y;
            let i = 0;
            while (i < n)
            {
                const h = usable * ratios[i]! / total;
                out.push({ ...base, id: `${front.id}#${i}`, role: "drawer", index: i,
                           rect: { x: outer.x, y, w: outer.w, h }, hinge: null, hingeKind: null, hingeOverlay: 0 });
                y += h + s.frontGap;
                i++;
            }
        }
        else
        {
            // one track overlay : leaves side by side from the left, each leafWdith wide
            const n = Math.max(1, Math.round(spec.leaves));
            let i = 0;
            while (i < n)
            {
                const x = outer.x + i * (spec.leafWidth + s.frontGap);
                out.push({ ...base, id: `${front.id}#${i}`, role: "leaf", index: i,
                           rect: { x, y: outer.y, w: spec.leafWidth, h: outer.h }, hinge: null, hingeKind: null,
                           hingeOverlay: 0 });
                i++;
            }
        }
    }
    return out;
}


// Blum KA-150 p. 75 : TB = FA - X + MD with a 0 mm plate (MD = 0)
export function cupDistance(panel: FrontPanel): number | null
{
    if (panel.hingeKind === "full")
    {
        return panel.hingeOverlay - OVERLAY_X_FULL;
    }
    if (panel.hingeKind === "twin")
    {
        return panel.hingeOverlay - OVERLAY_X_TWIN;  
    }
    return null;
}


// Plate line on the carcass side, hsifted inward for inset doors (FD + 1.5)
export function plateLine(panel: FrontPanel, base: number): number
{
    if (panel.hingeKind === "inset")
    {
        return base + panel.thickness + INSET_PLATE_SHIFT;
    }
    return base;
}
