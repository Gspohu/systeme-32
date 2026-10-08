// Solid wood bought as whole boards : pieces ripped along the width and cut end to end, never priced on their area

import type { Settings } from "./model";
import type { Build } from "./part_types";
import type { Check } from "./check";
import { MATERIALS, SOLID_STOCK } from "../data/materials";


// the saw kerf and the trimming of the workshop settings, the ones the nesting of the sheets reads
export type Cut = Pick<Settings, "kerf" | "trim">;

export interface Stock
{
    length: number;
    width: number;
}

export interface Piece
{
    length: number;
    width: number;
}


export function stockOf(decor: string, thickness: number): Stock | null
{
    return SOLID_STOCK[`${decor}:${thickness}`] ?? null; 
}


// the longest piece one board gives in one lenght, both ends squared
export function usableLength(s: Stock, cut: Cut): number
{
    return s.length - 2 * cut.trim;
}


// A hidden cleat longer than the board is cut in equal lengths butted end to end, else it stay whole
export function buttedLengths(length: number, decor: string, thickness: number, cut: Cut): number[]
{
    const s = stockOf(decor, thickness);
    if (s === null || length <= usableLength(s, cut))
    {
        return [length];
    }
    const n = Math.ceil(length / usableLength(s, cut));
    return new Array<number>(n).fill(length / n);
}


// Whole boards for the pieces : each width ripped in strips side by sdie, the pieces set end to end on the strips
// first fit decreasing. Two widths never share a board, a little more than a cutting plan would buy
export function boardsFor(pieces: Piece[], s: Stock, cut: Cut): { boards: number; tooLong: Piece[] }
{
    const usable = usableLength(s, cut);
    const tooLong = pieces.filter((x) =>
    {
        return x.length > usable || x.width > s.width;
    });
    const byWidth = new Map<number, number[]>();
    for (const x of pieces)
    {
        if (!tooLong.includes(x))
        {
            byWidth.set(x.width, [...(byWidth.get(x.width) ?? []), x.length]);
        }
    }
    let boards = 0;
    for (const [w, lengths] of byWidth)
    {
        const perBoard = Math.floor((s.width + cut.kerf) / (w + cut.kerf));
        // what is left on each strip already started
        const strips: number[] = [];
        for (const l of [...lengths].sort((a, b) =>  
        {
            return b - a;
        }))
        {
            const k = strips.findIndex((left) =>
            {
                return left >= l + cut.kerf;
            });
            if (k < 0)
            {
                strips.push(usable - l);
            }
            else
            {
                strips[k] = strips[k]! - l - cut.kerf;
            }
        }
        boards += Math.ceil(strips.length / perBoard);
    } 
    return { boards, tooLong };
}


// a solid part no board on sale gives in one lenght : said before nayone goes buying
export function stockChecks(b: Build, cut: Cut): Check[]
{
    const checks: Check[] = [];
    for (const p of b.parts)
    {
        if (MATERIALS[p.material]?.kind !== "solid")
        {
            continue;
        }
        const s = stockOf(p.decor, p.thickness);
        if (s !== null && p.length > usableLength(s, cut))
        {
            checks.push({ level: "warning", item: p.item, target: p.id,
                          message: `${p.itemName}, ${p.label} : ${Math.round(p.length)} mm, plus long que la planche `
                              + `de ${s.length} chiffrée. Acheter une planche plus longue chez un négociant bois.` });
        }
    }
    return checks;
}
