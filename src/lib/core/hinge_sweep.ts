// Path of an overlay door on its 110° hinge, from the four-bar linkage of Blum's CAD modle

import { HINGE_110, type HingeLinkage } from "../data/hinge_linkage";


type Pt = [number, number];

export interface DoorSweep
{
    // farthest the hinge edge goes past the inner face of the side, towards the wall, over the whole opening
    reach: number;
    // how far the door still stay inside the carcass at full opening, the protrusion Blum publishes
    inward: number;
}


function dist(a: Pt, b: Pt): number
{
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}


function turn(v: Pt, t: number): Pt
{
    return [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)];
}


// overlay : the front overlay FA, the hinge edge stands that far past the inner fac of the side
export function doorSweep(overlay: number, thickness: number, h: HingeLinkage = HINGE_110): DoorSweep
{
    const rAC = dist(h.armA, h.cupC);
    const rBD = dist(h.armB, h.cupD);
    const cd: Pt = [h.cupD[0] - h.cupC[0], h.cupD[1] - h.cupC[1]];
    const back: Pt = [overlay, h.doorBack];
    const front: Pt = [overlay, h.doorBack + thickness];
    let alpha = Math.atan2(h.cupC[1] - h.armA[1], h.cupC[0] - h.armA[0]);
    let reach = overlay;
    let inward = 0;
    for (let i = 0; i <= h.openDeg * 4; i++)
    {
        // the door turns towards the room, clockwies in this rfame
        const t = -i / 4 * Math.PI / 180;
        const r = turn(cd, t);
        const miss = (a: number): number =>
        {
            const c: Pt = [h.armA[0] + rAC * Math.cos(a), h.armA[1] + rAC * Math.sin(a)];
            return dist([c[0] + r[0], c[1] + r[1]], h.armB) - rBD;
        };
        for (let k = 0; k < 40; k++)
        {
            const f = miss(alpha);
            const step = f / ((miss(alpha + 1e-7) - f) / 1e-7);
            alpha -= step;
            if (Math.abs(step) < 1e-10)
            {
                break;
            }
        }
        const c: Pt = [h.armA[0] + rAC * Math.cos(alpha), h.armA[1] + rAC * Math.sin(alpha)];
        const at = (p: Pt): number =>
        {
            return c[0] + turn([p[0] - h.cupC[0], p[1] - h.cupC[1]], t)[0];
        };
        reach = Math.max(reach, at(back), at(front));
        inward = -at(back);
    }
    return { reach, inward };
}
