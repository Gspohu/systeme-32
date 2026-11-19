// Sections through a whole wall, cut from the built parts themselves : what they show is what gets made

import type { Carcass, Project, Wall } from "../model";
import type { Analysis } from "../analysis";
import type { Part } from "../part_types";
import { at as onFrame } from "../geometry";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, TITLE_BLOCK_W, type Prim } from "./display";
import { heading, type Draft } from "./draft";
import { chain } from "./plan";
import { round1 } from "../text";

// Shapes a plain box would misdraw : their curves have their own sheets
const CURVED = new Set(["endPanel", "former", "skin", "batten", "flange"]);
const FRONT_ROLES = new Set(["door", "drawerFront", "leaf", "flap", "panel"]);
const CUT_FILL = "#dddddd";
const FRONT_FILL = "#bcbcbc";
const SCALE = 10;
const TITLE_SIZE = 3;
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
        // A horizontal one is seen from above as the setting out is, the wall at the top : its depth counted down the
        // sheet. Counted up it showed the fronts at the top, the mirror of the plan beside it
        const [b0, b1] = axis === "x" ? [box.min[1]!, box.max[1]!] : [-box.max[2]!, -box.min[2]!];
        const ia = axis === "x" ? 2 : 0;
        out.push({ label: p.label, a0: box.min[ia]!, a1: box.max[ia]!, b0, b1, front: FRONT_ROLES.has(p.role) });
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
        const where = s.axis === "x" ? `verticale à ${round1(s.at)} du bord gauche`
            : `horizontale à ${round1(s.at)} du sol`;
        return { letter, axis: s.axis, at: s.at, cut: s.cut, title: `Coupe ${letter}-${letter}, ${where}` };
    });
}


// The planes of the back wall for FreeCAD to cut its own sections through, with what it projects : the same planes
// as the sheets, their letters kept. Each goes through the middle of the wall, in the axes of the document (x, -z, y)
// where TechDraw centres the line it draws for it
export function sectionSpecs(p: Project, a: Analysis): { letter: string; axis: "x" | "y"; at: number; title: string;
                                                          items: string[]; origin: number[] }[]
{
    const items = p.items.filter((it) =>
    {
        return it.wall === "back" && (it.kind === "carcass" || it.kind === "wallShelf");
    }).map((it) => { return it.id; });
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const q of a.build.parts)
    {
        const box = items.includes(q.item) ? boxOf(q) : null;
        for (let k = 0; box !== null && k < 3; k++)
        {
            lo[k] = Math.min(lo[k]!, box.min[k]!);
            hi[k] = Math.max(hi[k]!, box.max[k]!);
        }
    }
    const mid = lo.map((v, k) => { return (v + hi[k]!) / 2; });
    return sectionPlanes(p, a, "back").map((s) =>
    {
        const origin = s.axis === "x" ? [s.at, -mid[2]!, mid[1]!] : [mid[0]!, -mid[2]!, s.at];
        return { letter: s.letter, axis: s.axis, at: s.at, title: s.title, items, origin };
    });
}


// One section, its lower left at (x0, y0) on the page, with a chain of dimensions along each side
// Each peice cut spans a0 to a1 across the plane and b0 to b1 up it, in mm
function drawSection(canvas: Canvas, plane: SectionPlane, x0: number, y0: number): void
{
    const minA = Math.min(...plane.cut.map((piece) => { return piece.a0; })); 
    const minB = Math.min(...plane.cut.map((piece) => { return piece.b0; }));
    const maxB = Math.max(...plane.cut.map((piece) => { return piece.b1; }));
    const pageX = (along: number): number =>
    {
        return x0 + (along - minA) / SCALE;
    };
    const pageY = (up: number): number =>   
    {
        return y0 - (up - minB) / SCALE;
    };
    canvas.text(pageX(minA), pageY(maxB) - 8, plane.title, TITLE_SIZE, "start", true);
    for (const piece of plane.cut)
    {
        canvas.rect(pageX(piece.a0), pageY(piece.b1), (piece.a1 - piece.a0) / SCALE, (piece.b1 - piece.b0) / SCALE,
                    "normal", piece.front ? FRONT_FILL : CUT_FILL);
    }
    chain(canvas, plane.cut.flatMap((piece) => { return [piece.a0, piece.a1]; }), pageX, y0 + 1, y0 + 7, "h");
    chain(canvas, plane.cut.flatMap((piece) => { return [piece.b0, piece.b1]; }), pageY, pageX(minA) - 1,
          pageX(minA) - 8, "v"); 
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


// The part of a sheet sections go in, under its heading and clear of the title block : FreeCAD lays its own out in
// the same room
export function sectionRoom(title: string): { heading: Prim[]; left: number; right: number; top: number;
                                              bottom: number; blockTop: number; blockLeft: number; titleSize: number }
{
    const c = new Canvas();
    heading(c, title);
    return { heading: c.prims, left: MARGIN + 3, right: A3.w - MARGIN, top: MARGIN + 16, bottom: A3.h - MARGIN,
             blockTop: A3.h - MARGIN - TITLE_BLOCK_H - 3, blockLeft: A3.w - MARGIN - TITLE_BLOCK_W - 3,
             titleSize: TITLE_SIZE };
}


// As many as fit left to right, then a new row, then a new sheet, clear of the title block
export function sectionSheets(p: Project, a: Analysis, wall: Wall): Draft[]
{
    const out: Draft[] = [];
    const { left, right, top, bottom, blockTop, blockLeft } = sectionRoom("Coupes");
    let canvas: Canvas | null = null;
    let x = left;
    let y = top;
    let rowH = 0;
    let empty = true;
    const open = (): Canvas =>
    {
        const c = new Canvas();
        heading(c, "Coupes");
        out.push({ title: "Coupes", scale: `1:${SCALE}`, canvas: c });
        x = left;
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
            x = left;
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
