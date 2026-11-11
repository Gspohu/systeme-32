// Sections through a whole wall, cut from the built parts themselves : what they show is what gets made

import type { Carcass, Project, Wall } from "../model";
import type { Analysis } from "../analysis";
import type { Part } from "../part_types";
import { at as onFrame } from "../geometry";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, TITLE_BLOCK_W } from "./display";
import { heading, type Draft } from "./draft";
import { chain } from "./plan";
import { round1 } from "../text";

// Shapes a plain box would misdraw : their curves have their own sheets
const CURVED = new Set(["endPanel", "former", "skin", "batten", "flange"]);
const FRONT_ROLES = new Set(["door", "drawerFront", "leaf", "flap", "panel"]);
const CUT_FILL = "#dddddd";
const FRONT_FILL = "#bcbcbc";
const SCALE = 10;
// Room around a drawing for its title and its 2 chains of dimensions
const ROOM_LEFT = 24;
const ROOM_RIGHT = 12;
const ROOM_TOP = 11;
const ROOM_BOTTOM = 14;
const MAX_LEVELS = 6;

export interface SectionPlane
{
    letter: string;
    // A vertical plane cut at x along the wall, a horizontal one at y over the floor
    axis: "x" | "y";
    at: number;
    title: string;
    cut: Cut[];
}

interface Cut
{
    label: string;
    a0: number;
    a1: number;
    b0: number;
    b1: number;
    front: boolean;
}


// Box of a part in the frame of its wall, or null for one the section leaves to its own sheet
function boxOf(p: Part): { min: number[]; max: number[] } | null
{
    if (p.frame === null || p.curve !== null || CURVED.has(p.role))
    {
        return null;
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const u of [0, p.length])
    {
        for (const v of [0, p.width])
        {
            for (const w of [0, p.thickness])
            {
                const q = onFrame(p.frame, u, v, w);
                q.forEach((value, k) =>
                {
                    min[k] = Math.min(min[k]!, value);
                    max[k] = Math.max(max[k]!, value);
                });
            }
        }
    }
    return { min, max };
}


// What a plane meets : a vertical one reads depth and height, a horizontal one lenght along the wall and depth
function cutAt(parts: Part[], axis: "x" | "y", at: number): Cut[]
{
    const out: Cut[] = [];
    const k = axis === "x" ? 0 : 1;
    for (const p of parts)
    {
        const box = boxOf(p);
        if (box === null || at <= box.min[k]! || at >= box.max[k]!)
        {
            continue;
        }
        const [ia, ib] = axis === "x" ? [2, 1] : [0, 2];
        out.push({ label: p.label, a0: box.min[ia]!, a1: box.max[ia]!, b0: box.min[ib]!, b1: box.max[ib]!,
                   front: FRONT_ROLES.has(p.role) });
    }
    return out;
}


// 2 planes showing the same boards in the same place are one section, only the one along the plane moving
function signature(cut: Cut[]): string
{
    return cut.map((c) =>
    {
        return [c.a0, c.a1, c.b0, c.b1].map((v) =>
        {
            return Math.round(v);
        }).join(",");
    }).sort().join("|");
}


// Middles of the columns of each carcass and of each cell height : every distinct arrangement comes out once
export function sectionPlanes(p: Project, a: Analysis, wall: Wall): SectionPlane[]
{
    const carcasses = p.items.filter((it): it is Carcass =>
    {
        return it.kind === "carcass" && it.wall === wall && it.freeStanding !== true;
    });
    const ids = new Set(p.items.filter((it) =>
    {
        return it.wall === wall;
    }).map((it) =>
    {
        return it.id;
    }));
    const parts = a.build.parts.filter((q) =>
    {
        return ids.has(q.item);
    });
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of carcasses)
    {
        for (const nb of a.build.layouts.get(c.id)?.nodes.values() ?? [])
        {
            if (nb.kind === "cell")
            {
                xs.push(c.x + nb.x + nb.w / 2);
                ys.push(c.y + nb.y + nb.h / 2);
            }
        }
    }
    const pick = (axis: "x" | "y", list: number[], max: number): { at: number; cut: Cut[] }[] =>
    {
        const seen = new Set<string>();
        const out: { at: number; cut: Cut[] }[] = [];
        const levels = [...new Set(list.map((v) =>
        {
            return Math.round(v);
        }))].sort((m, n) =>
        {
            return m - n;
        });
        for (const at of levels)
        {
            const cut = cutAt(parts, axis, at);
            const key = signature(cut);
            if (cut.length > 0 && !seen.has(key) && out.length < max)
            {
                seen.add(key);
                out.push({ at, cut });
            }
        }
        return out;
    };
    const planes = [...pick("x", xs, MAX_LEVELS).map((s) =>
    {
        return { ...s, axis: "x" as const };
    }), ...pick("y", ys, MAX_LEVELS).map((s) =>
    {
        return { ...s, axis: "y" as const };
    })];
    return planes.map((s, i) =>
    {
        const letter = String.fromCharCode(65 + i);
        const where = s.axis === "x" ? `verticale à ${round1(s.at)} du bord gauche` : `horizontale à ${round1(s.at)} du sol`;
        return { letter, axis: s.axis, at: s.at, cut: s.cut, title: `Coupe ${letter}-${letter}, ${where}` };
    });
}


// One section, its lower left at (x0, y0) on the page, with a chain of dimensions along each side
function drawSection(canvas: Canvas, s: SectionPlane, x0: number, y0: number): void
{
    const a0 = Math.min(...s.cut.map((c) => { return c.a0; }));
    const a1 = Math.max(...s.cut.map((c) => { return c.a1; }));
    const b0 = Math.min(...s.cut.map((c) => { return c.b0; }));
    const b1 = Math.max(...s.cut.map((c) => { return c.b1; }));
    const X = (v: number): number =>
    {
        return x0 + (v - a0) / SCALE;
    };
    const Y = (v: number): number =>
    {
        return y0 - (v - b0) / SCALE;
    };
    canvas.text(X(a0), Y(b1) - 8, s.title, 3, "start", true);
    for (const c of s.cut)
    {
        canvas.rect(X(c.a0), Y(c.b1), (c.a1 - c.a0) / SCALE, (c.b1 - c.b0) / SCALE, "normal",
                    c.front ? FRONT_FILL : CUT_FILL);
    }
    chain(canvas, s.cut.flatMap((c) => { return [c.a0, c.a1]; }), X, y0 + 1, y0 + 7, "h");
    chain(canvas, s.cut.flatMap((c) => { return [c.b0, c.b1]; }), Y, X(a0) - 1, X(a0) - 8, "v");
}


// Page size a section takes with its titles and dimensions
function sizeOf(s: SectionPlane): { w: number; h: number }
{
    const a0 = Math.min(...s.cut.map((c) => { return c.a0; }));
    const a1 = Math.max(...s.cut.map((c) => { return c.a1; }));
    const b0 = Math.min(...s.cut.map((c) => { return c.b0; }));
    const b1 = Math.max(...s.cut.map((c) => { return c.b1; }));
    return { w: (a1 - a0) / SCALE + ROOM_LEFT + ROOM_RIGHT, h: (b1 - b0) / SCALE + ROOM_TOP + ROOM_BOTTOM };
}


// As many as fit left to right, then a new row, then a new sheet, clear of the title block
export function sectionSheets(p: Project, a: Analysis, wall: Wall): Draft[]
{
    const out: Draft[] = [];
    const right = A3.w - MARGIN;
    const top = MARGIN + 16;
    const bottom = A3.h - MARGIN;
    const blockTop = A3.h - MARGIN - TITLE_BLOCK_H - 3;
    const blockLeft = A3.w - MARGIN - TITLE_BLOCK_W - 3;
    let canvas: Canvas | null = null;
    let x = MARGIN + 3;
    let y = top;
    let rowH = 0;
    let empty = true;
    const open = (): Canvas =>
    {
        const c = new Canvas();
        heading(c, "Coupes");
        out.push({ title: "Coupes", scale: `1:${SCALE}`, canvas: c });
        x = MARGIN + 3;
        y = top;
        rowH = 0;
        empty = true;
        return c;
    };
    // A place is free when it stays in the frame and off the title block
    const fits = (px: number, py: number, w: number, h: number): boolean =>
    {
        const overBlock = px + w > blockLeft && py + h > blockTop;
        return px + w <= right && py + h <= bottom && !overBlock;
    };
    for (const s of sectionPlanes(p, a, wall))
    {
        const { w, h } = sizeOf(s);
        canvas ??= open();
        if (!fits(x, y, w, h) && !empty)
        {
            x = MARGIN + 3;
            y += rowH;
            rowH = 0;
            // Never a blank sheet : a section too tall for any still goes on the one it opened
            if (!fits(x, y, w, h))
            {
                canvas = open();
            }
        }
        drawSection(canvas, s, x + ROOM_LEFT, y + h - ROOM_BOTTOM);
        empty = false;
        x += w;
        rowH = Math.max(rowH, h);
    }
    return out;
}
