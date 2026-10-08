// Sheet nesting with MaxRects, best short side fit : trim on the raw edges, kerf between parts, grain respected

import type { Settings } from "./model";
import type { CutRow } from "./bom";
import { MATERIALS, SHEET_LENGTH, SHEET_WIDTH, decorById } from "../data/materials";


export interface Placement
{
    code: string;
    label: string;
    x: number;
    y: number;
    // placed size on the sheet, x along the 2800 side
    w: number;
    h: number;
    rotated: boolean;
    shaped: boolean;
}

export interface Sheet
{
    decor: string;
    decorLabel: string;
    thickness: number;
    length: number;
    width: number;
    trim: number;
    placements: Placement[];
    used: number;
}


export interface NestResult
{
    sheets: Sheet[];
    unplaced: { code: string; label: string; reason: string }[];
}


interface Free
{
    x: number;
    y: number;
    w: number;
    h: number;
}


interface Spot extends Free
{
    rotated: boolean;
    score: number;
}

interface Piece
{
    code: string;
    label: string;
    w: number;
    h: number;
    canRotate: boolean;
    shaped: boolean;
}


function contains(a: Free, b: Free): boolean
{
    return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}


class MaxRects
{
    free: Free[];
    placed: Placement[] = [];


    constructor(w: number, h: number)
    {
        this.free = [{ x: 0, y: 0, w, h }];
    }


    spotFor(pw: number, ph: number, canRotate: boolean): Spot | null
    {
        let best: Spot | null = null;
        for (const f of this.free)
        {
            const tries: [number, number, boolean][] = canRotate ? [[pw, ph, false], [ph, pw, true]] : [[pw, ph, false]];
            for (const [w, h, rotated] of tries)
            {
                if (w <= f.w && h <= f.h)
                {
                    const score = Math.min(f.w - w, f.h - h);
                    if (best === null || score < best.score)
                    {
                        best = { x: f.x, y: f.y, w, h, rotated, score };
                    }
                }
            }
        }
        return best;
    }

    place(r: Free): void
    {
        const next: Free[] = []; 
        for (const f of this.free)
        {
            const disjoint = r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y;
            if (disjoint)
            {
                next.push(f);
                continue;
            }
            // split the free rectangle into the up to four maximal pieces around the placed one
            if (r.x > f.x)
            {
                next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
            }
            if (r.x + r.w < f.x + f.w)
            {
                next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h });
            } 
            if (r.y > f.y)
            {
                next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
            }
            if (r.y + r.h < f.y + f.h)
            {
                next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) });
            }  
        }
        // drop free rcetangles contained in another one, keeping the first of two equal ones
        const kept: Free[] = [];
        let i = 0;
        while (i < next.length)
        {
            const a = next[i]!;
            let swallowed = false;
            let j = 0;
            while (j < next.length && !swallowed)
            {
                const b = next[j]!;
                swallowed = j !== i && contains(b, a) && !(contains(a, b) && j > i);
                j++;
            }
            if (!swallowed)
            {
                kept.push(a);
            }
            i++;
        }
        this.free = kept;
    }

    put(pc: Piece, spot: Spot, kerf: number): void
    {
        this.place(spot);
        this.placed.push({ code: pc.code, label: pc.label, x: spot.x, y: spot.y, w: spot.w - kerf, h: spot.h - kerf,
                           rotated: spot.rotated, shaped: pc.shaped });
    }
}


export interface Format
{
    length: number;
    width: number;
}


export const STANDARD_FORMAT: Format = { length: SHEET_LENGTH, width: SHEET_WIDTH };


// the size of the boards bought for each decor and thickness, the stadard one unless told otherwise
export function nest(rows: CutRow[], s: Settings, formatOf: (decor: string, thickness: number) => Format = () => 
{
    return STANDARD_FORMAT;
}): NestResult
{
    // boards in the order the list first need them, which is the order of the sheets
    const byBoard = new Map<string, { decor: string; thickness: number; pieces: Piece[] }>();
    const all: { key: string; piece: Piece }[] = [];
    for (const r of rows)
    {
        // glass comes cut to size from the glazier, never out of a board
        if (MATERIALS[decorById(r.decor).material]?.kind === "glass")
        {
            continue;
        }
        const key = `${r.decor}|${r.thickness}`;
        if (!byBoard.has(key))
        {
            byBoard.set(key, { decor: r.decor, thickness: r.thickness, pieces: [] });
        }
        let k = 0;
        while (k < r.quantity)
        {
            all.push({ key, piece: { code: r.code, label: r.label, w: r.length, h: r.width, canRotate: !r.grain,
                                     shaped: r.shaped } });
            k++;
        }
    }
    // biggest first, the usual order for MaxRects, sorted once and stable within each board
    all.sort((a, b) =>
    {
        const p = a.piece;
        const q = b.piece;
        return Math.max(q.w, q.h) - Math.max(p.w, p.h) || q.w * q.h - p.w * p.h;
    });
    for (const { key, piece } of all)
    {
        byBoard.get(key)!.pieces.push(piece);
    }
    const unplaced: NestResult["unplaced"] = [];
    const sheets: Sheet[] = [];
    for (const g of byBoard.values())
    {
        const f = formatOf(g.decor, g.thickness);
        const W = f.length - 2 * s.trim;
        const H = f.width - 2 * s.trim;
        const bins: MaxRects[] = [];
        for (const pc of g.pieces)
        {
            // each piece reesrves its kerf on the right and top, the bin gets one kerf back
            const pw = pc.w + s.kerf;
            const ph = pc.h + s.kerf;
            let done = false;
            for (const bin of bins)
            {
                const spot = done ? null : bin.spotFor(pw, ph, pc.canRotate);   
                if (spot !== null)
                {
                    bin.put(pc, spot, s.kerf);
                    done = true;
                }
            }
            if (done)
            {
                continue;
            }
            const bin = new MaxRects(W + s.kerf, H + s.kerf);
            const spot = bin.spotFor(pw, ph, pc.canRotate);
            if (spot === null)
            {
                const grain = pc.canRotate ? "" : " (fil imposé)";
                unplaced.push({ code: pc.code, label: pc.label,
                                reason: `${Math.round(pc.w)} x ${Math.round(pc.h)} dépasse ${W} x ${H} utiles${grain}` });
                continue;
            }
            bin.put(pc, spot, s.kerf);
            bins.push(bin);
        }
        const decor = decorById(g.decor);
        for (const bin of bins)
        {
            let area = 0;
            const placements: Placement[] = [];
            for (const p of bin.placed)
            {
                area += p.w * p.h;
                placements.push({ ...p, x: p.x + s.trim, y: p.y + s.trim });
            }
            sheets.push({
                decor: g.decor,
                decorLabel: `${decor.ref} ${decor.label}`.trim(),
                thickness: g.thickness,
                length: f.length,  
                width: f.width,
                trim: s.trim,
                placements,
                used: area / (f.length * f.width),
            });
        }
    }
    return { sheets, unplaced };
}
