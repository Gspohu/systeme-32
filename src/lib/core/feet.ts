// AXILO 78 feet under a carcass : which foot, where each one stands and its shape for the 3D view and the clash checks

import type { Carcass } from "./model";
import { usableDepth } from "./extent";
import { box, post } from "./fitted";
import type { Fitted } from "./parts";
import { AXILO_FEET, type Foot } from "../data/hardware";

// Häfele U.K. 2018 p. 11.43A : top section 92 x 79 x 25, shaft in its 30 bore, foot plate Ø78
// and a plate thickness not dimensioned, 8 mm read off the drawing scaled on the Ø78
export const AXILO_TOP = { w: 92, d: 79, h: 25 };
export const AXILO_SHAFT_D = 30;
export const AXILO_PLATE_D = 78;
export const AXILO_PLATE_H = 8;
// p. 11.43A and the Häfele model of the 637.76.333 : the shaft stands off centre, 52.5 to the long end and 39.5 + a tab
// of 5 to the other, that tab only 2.8 thick against the underside. Its 4 holes on a square of 64 stand on the long
// side, their centre 13 off the shaft, Ø4 screws not supplied
export const AXILO_SCREW_PITCH = 64;
export const AXILO_SCREW_OFFSET = 13;
export const AXILO_TOP_LONG = 52.5;
export const AXILO_TOP_SHORT = 39.5;
export const AXILO_SCREWS = 4;
// p. 11.43B : the plinth clip for screw fixing, its 2 holes, Ø3.5 screws not supplied
export const AXILO_CLIP_SCREWS = 2;

// Distance of a foot axis from the sides and the back, conveniton
export const FOOT_INSET = 50;
export const FOOT_MAX_SPACING = 800;


// The foto whose range is best centred on the height, a foot at the end of its travel can't level both ways
export function footFor(height: number): Foot | undefined
{
    let best: Foot | undefined;
    let room = -1;
    for (const f of AXILO_FEET)
    {
        const r = Math.min(height - f.min, f.max - height);
        if (r >= 0 && r > room)
        {
            best = f;
            room = r; 
        }
    }
    return best;
}


// Drawing 637.76.333-1 : clip screws 2 over the middle of the tube, L/2 + 20 under a plinth top stopping 3 under the
// carcass. A corner return clip sits 8.5 lower, still on the tube of a H100 (essai23 : 8.5 mm3 at 6.5 lower)
export const CLIP_OVER_MIDDLE = 2;
export const CLIP_RETURN_DROP = 8.5;

// How far under the carcass the screws of a front clip go, none when the foot has no tube a clip fits round
export function clipDrop(f: Foot | undefined): number | null
{
    if (f?.tube === undefined)
    {
        return null;
    }
    return AXILO_TOP.h + f.tube / 2 - CLIP_OVER_MIDDLE;
}


// The plinth back against the mounting plate, 39.5 off the axis, where the 637.38.054 clip reaches (drawing
// 637.76.333-1)
export function frontFootInset(c: Carcass): number
{
    if (c.base.type === "plinth")
    {
        return c.base.setback + c.thickness + AXILO_TOP.d / 2;
    }
    return FOOT_INSET;
}


// Distance of a foot axis from a side : behind a plinth return both the plate on the floor and the wider mounting
// plate under the bottom clear its back face
export function sideFootInset(c: Carcass, side: "left" | "right"): number
{
    if (c.base.type === "plinth" && (c.base.returns ?? []).includes(side))
    {
        // The mounting plate turned, its width across the side : the clip then reaches the return (39.5, Häfele model)
        return c.thickness + AXILO_TOP.d / 2;
    }
    // Clear of the side the 4 screws of the mounting plate must miss, a screw 10 off its face
    return Math.max(FOOT_INSET, c.thickness + AXILO_SCREW_PITCH / 2 + 10);
}


export function feetPerRow(c: Carcass): number
{
    return Math.max(2, Math.ceil((c.width - 2 * FOOT_INSET) / FOOT_MAX_SPACING) + 1);
}


export interface FootPlace
{
    // Axis in the frame of the wall, bottom of the plate on the floor under the carcass
    x: number;
    z: number;
    floor: number;
    height: number;
}


// The long side of the mounting plate and its screws turn to the middle of the carcass, a foot in the middle turns
// right. Beside a plinth return its width lies across instead, the long side turning to the middle of the depth
export function footLong(c: Carcass, f: FootPlace): { dx: number; dz: number }
{
    const places = footPlaces(c);
    const lowest = Math.min(...places.map((q) => { return q.x; }));
    const highest = Math.max(...places.map((q) => { return q.x; }));
    const returns = c.base.type === "plinth" ? c.base.returns ?? [] : [];
    if ((returns.includes("left") && f.x === lowest) || (returns.includes("right") && f.x === highest))
    {
        return { dx: 0, dz: f.z <= c.z + c.depth / 2 ? 1 : -1 };
    }
    return { dx: f.x <= c.x + c.width / 2 ? 1 : -1, dz: 0 };
}


// Plate, shaft and top section of every foot, as the 3D view, the clash checks and the drawings take them
export function feetFitted(c: Carcass, ref: string): Fitted[]
{
    const out: Fitted[] = [];
    let n = 0;
    for (const f of footPlaces(c))
    {
        const top = f.floor + f.height;
        const name = `pied ${n + 1}`;
        out.push(post(`${c.id}/pied${n}/patin`, c.id, ref, `${name}, patin`, "foot-pad", f.x, f.z, f.floor,
                      AXILO_PLATE_H, AXILO_PLATE_D, false));
        out.push(post(`${c.id}/pied${n}/fut`, c.id, ref, `${name}, fût`, "foot", f.x, f.z, f.floor + AXILO_PLATE_H,
                      f.height - AXILO_PLATE_H - AXILO_TOP.h, AXILO_SHAFT_D, false));
        const { dx, dz } = footLong(c, f);
        const span = (axis: number, way: number): [number, number] =>
        {
            if (way === 0)
            {
                return [axis - AXILO_TOP.d / 2, axis + AXILO_TOP.d / 2];
            }
            const ends = [axis - way * AXILO_TOP_SHORT, axis + way * AXILO_TOP_LONG];
            return [Math.min(...ends), Math.max(...ends)];
        };
        const [x0, x1] = span(f.x, dx);
        const [z0, z1] = span(f.z, dz);
        out.push(box(`${c.id}/pied${n}/embase`, c.id, "637.76.333", `${name}, embase`, "foot-mount",
                     [x0, top - AXILO_TOP.h, z0], [x1, top, z1], false));
        n++;
    }
    return out;
}


export function footPlaces(c: Carcass): FootPlace[]
{
    if (c.base.type !== "plinth" && c.base.type !== "feet")
    {
        return [];
    }
    const h = c.base.height;
    const n = feetPerRow(c);
    const out: FootPlace[] = [];
    let i = 0;
    while (i < n)
    {
        const left = sideFootInset(c, "left");
        const x = c.x + left + (c.width - left - sideFootInset(c, "right")) * i / (n - 1);
        // The back row stands under the bottom panel, which stops at an applied back
        for (const z of [c.z + c.depth - frontFootInset(c), c.z + c.depth - usableDepth(c) + FOOT_INSET])
        {
            out.push({ x, z, floor: c.y - h, height: h });
        }
        i++;
    }
    return out;
}
