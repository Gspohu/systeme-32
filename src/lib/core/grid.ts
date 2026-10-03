// System 32 line holes of a carcass : the vertical grid every pin, plate and connector of a side is set on

import type { Carcass, Settings } from "./model";

// a shelf pin centre stands this far under the shelf it carries
export const PIN_BELOW_SHELF = 4;


// Centre of hole n of the line, carcass y : the first on the axis of the bottom panel, where its joints sit, then
// one grid step apart (32 mm cabinetmaking system, Nutsch, Handbuch der Konstruktion, 2003)
export function holeLine(c: Carcass, s: Settings, n: number): number
{
    return c.thickness / 2 + n * s.grid;
}


export function nearestHole(c: Carcass, s: Settings, y: number): number
{
    return Math.round((y - c.thickness / 2) / s.grid);
}


// The underside an adjustable shelf takes resting on the pins of the hole line nearest to it
export function shelfOnPins(c: Carcass, s: Settings, underside: number): number
{
    return holeLine(c, s, nearestHole(c, s, underside - PIN_BELOW_SHELF)) + PIN_BELOW_SHELF;
}


// The line runs as far from the top as from the bottom only when the axes of both panels lie on it
export function symmetricHeights(c: Carcass, s: Settings): [number, number] | null
{
    const span = c.height - c.thickness;
    if (s.grid <= 0 || Math.abs(span / s.grid - Math.round(span / s.grid)) < 1e-6)
    {
        return null;
    }
    const n = Math.floor(span / s.grid);
    return [c.thickness + n * s.grid, c.thickness + (n + 1) * s.grid];
}
