// Tops following a roof slope : the line of the top, the ceiling under it, where the parts meet them

import type { Carcass } from "./model";
import { MIN_CELL, type ResolvedLayout } from "./layout";
import type { FrontPanel } from "./fronts";


// Lengths of the left and right sides, the top resting between their inner faces
export function sideHeights(c: Carcass): { left: number; right: number }
{
    if (c.slope === null)
    {
        return { left: c.height, right: c.height };
    }
    return c.slope.low === "left" ? { left: c.slope.height, right: c.height } : { left: c.height,
        right: c.slope.height };
}


// Angle of the top with the horizontal, 0 for a flat one
export function topAngle(c: Carcass): number
{
    const { left, right } = sideHeights(c);
    return Math.atan(Math.abs(right - left) / (c.width - 2 * c.thickness));
}


// Upper face of the top at local x, from the bottom of the box
export function topAt(c: Carcass, x: number): number
{
    const { left, right } = sideHeights(c);
    return left + (right - left) * (x - c.thickness) / (c.width - 2 * c.thickness);
}


// Underside of the top at local x : a sloped board is thicker measurde upright
export function ceilingAt(c: Carcass, x: number): number
{
    return topAt(c, x) - c.thickness / Math.cos(topAngle(c));
}


// Outline of the box seen from the front, the roof line clipped level with the square head of the high side
export function frontOutline(c: Carcass): [number, number][]
{
    const W = c.width;
    const H = c.height;
    if (c.slope === null)
    {
        return [[0, 0], [W, 0], [W, H], [0, H]];
    }
    return c.slope.low === "left"  
        ? [[0, 0], [W, 0], [W, H], [W - c.thickness, H], [0, topAt(c, 0)]]
        : [[0, 0], [W, 0], [W, topAt(c, W)], [c.thickness, H], [0, H]];
}


// Lowest ceiling over a span, the line being straight it is at one end
export function ceilingOver(c: Carcass, x0: number, x1: number): number
{
    return Math.min(ceilingAt(c, x0), ceilingAt(c, x1));
}


// What a sloped carcass can't build : anything reaching above the slope, and the unsupported options
export function slopeErrors(c: Carcass, lay: ResolvedLayout, panels: FrontPanel[]): string[]
{
    const errors: string[] = [];
    if (c.slope === null)
    {
        return errors;
    }
    const t = c.thickness;
    const mm = (v: number): string =>
    {
        return `${Math.floor(v)} mm`;
    };
    if (c.slope.height >= c.height || c.slope.height < 2 * t + MIN_CELL)
    {
        errors.push(`${c.name} : joue basse de ${c.slope.height} mm, entre ${2 * t + MIN_CELL} et ${c.height - 1} mm `
            + "(sous la joue haute).");
        return errors;
    }
    if (c.back.type === "groove")
    {
        errors.push(`${c.name} : fond en rainure impossible sous un rampant. Choisir un fond rapporté.`);
    }
    if (c.seat !== null)
    {
        errors.push(`${c.name} : une assise ne peut pas être en pente. Retirer l'assise ou le rampant.`);
    }
    // the roof keeps rising past the high side, a rounded end there still fits under it
    if (c.ends[c.slope.low].type === "rounded")
    {
        errors.push(`${c.name} : bout arrondi côté bas du rampant, il percerait la pente. Le passer en bout droit.`);
    }
    for (const d of lay.dividers)
    {
        const room = ceilingOver(c, d.x, d.x + d.w);
        if (d.axis === "h" && d.y + d.h > room + 0.01)
        {
            errors.push(`${c.name} : une tablette passe au-dessus du rampant. La descendre sous ${mm(room - d.h)}.`);
        }
    }
    for (const fp of panels)
    {
        const room = Math.min(topAt(c, fp.rect.x), topAt(c, fp.rect.x + fp.rect.w));
        if (fp.rect.y + fp.rect.h > room + 0.01)
        {
            errors.push(`${c.name} : une façade dépasse le rampant, seules les façades rectangulaires sous la pente `
                + `sont fabriquées. La placer sous ${mm(room)}.`);
        }
    }
    for (const l of c.linings)
    {
        const nb = lay.nodes.get(l.cell);
        if (nb !== undefined && nb.y + nb.h > ceilingOver(c, nb.x, nb.x + nb.w) + 0.01)
        {
            errors.push(`${c.name} : habillage dans une case coupée par le rampant, non fabriqué. `
                + "Le retirer ou recouper la case sous la pente.");
        }
    }  
    return errors;
}
