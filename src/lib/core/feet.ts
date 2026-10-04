// AXILO 78 feet under a carcass : which foot, where each one stands, and its shape for the 3D view and the clash checks

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

// distance of a foot axis from the sides and the back, conveniton
export const FOOT_INSET = 50;
export const FOOT_MAX_SPACING = 800;


export function footFor(height: number): Foot | undefined
{
    return AXILO_FEET.find((f) =>
    {
        return height >= f.min && height <= f.max;
    });
}


// Distance of the front feet axis from the front of the box. Behind a plinth the plate clears its back face
// FIXME Häfele does not publish the reach of the 637.38.054 clip : check it when the plinth goes on
export function frontFootInset(c: Carcass): number
{
    if (c.base.type === "plinth")
    {
        return c.base.setback + c.thickness + AXILO_PLATE_D / 2;
    }
    return FOOT_INSET;
}


// Distance of a foot axis from a side : behind a plinth return both the plate on the floor and the wider mounting
// plate under the bottom clear its back face
export function sideFootInset(c: Carcass, side: "left" | "right"): number
{
    if (c.base.type === "plinth" && (c.base.returns ?? []).includes(side))
    {
        return c.thickness + Math.max(AXILO_PLATE_D, AXILO_TOP.w) / 2;
    }
    return FOOT_INSET;
}


export function feetPerRow(c: Carcass): number
{
    return Math.max(2, Math.ceil((c.width - 2 * FOOT_INSET) / FOOT_MAX_SPACING) + 1);
}


export interface FootPlace
{
    // axis in the frame of the wall, bottom of the plate on the floor under the carcass
    x: number;
    z: number;
    floor: number;
    height: number;
}


// plate, shaft and top section of every foot, as the 3D view, the clash checks and the drawings take them
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
        out.push(box(`${c.id}/pied${n}/embase`, c.id, "637.76.333", `${name}, embase`, "foot-mount",
                     [f.x - AXILO_TOP.w / 2, top - AXILO_TOP.h, f.z - AXILO_TOP.d / 2],
                     [f.x + AXILO_TOP.w / 2, top, f.z + AXILO_TOP.d / 2], false));
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
        // the back row stands under the bottom panel, which stops at an applied back
        for (const z of [c.z + c.depth - frontFootInset(c), c.z + c.depth - usableDepth(c) + FOOT_INSET])
        {
            out.push({ x, z, floor: c.y - h, height: h });
        }
        i++;
    }
    return out;
}
