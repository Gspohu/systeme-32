import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { at } from "./geometry";
import { dresser, tvWall } from "./templates";
import type { Part } from "./part_types";

const PIECES = { tvWall, dresser };
// Fronts side by side : their joints in line, or plainly apart. A few mm off read as a mistake
const ALIGNED = 0.5;
const PLAINLY_APART = 20;
const SIDE_BY_SIDE = 5;
// In one carcass an inset front stands an upright and its reveals away from the next one
const ACROSS_UPRIGHT = 25;


function extent(q: Part, k: 0 | 1): [number, number]
{
    const a = at(q.frame!, 0, 0, 0)[k];
    const b = at(q.frame!, q.length, q.width, 0)[k];
    return a < b ? [a, b] : [b, a];
}


describe("fronts side by side", () =>
{
    for (const [name, make] of Object.entries(PIECES))
    {
        it(`lines up the joints of the fronts of ${name}, or sets them plainly apart`, () =>
        {
            const fronts = analyse(make()).build.parts.filter((q) =>
            {
                return (q.role === "door" || q.role === "drawerFront" || q.role === "flap") && q.frame !== null;
            });
            const near: string[] = [];
            fronts.forEach((a, i) =>
            {
                for (let j = i + 1; j < fronts.length; j++)
                {
                    const b = fronts[j]!;
                    const [ax, bx] = [extent(a, 0), extent(b, 0)];
                    const gap = Math.max(bx[0] - ax[1], ax[0] - bx[1]);
                    if (a.item === b.item || gap > SIDE_BY_SIDE || gap < 0)
                    {
                        continue;
                    }
                    // Bottom against bottom, top against top : a top and the bottom besid it are the 2 edges of
                    // one joint
                    const [ya, yb] = [extent(a, 1), extent(b, 1)];
                    for (const k of [0, 1])
                    {
                        const off = Math.abs(ya[k]! - yb[k]!);
                        if (off > ALIGNED && off < PLAINLY_APART)
                        {
                            near.push(`${a.itemName} ${a.label} / ${b.itemName} ${b.label} : ${off.toFixed(1)} mm`);
                        }
                    }
                }
            });
            expect(near).toEqual([]);
        });


        // The drop flap of the dresser stood 30 higher, 10 lower at its top and 21.6 behind the doors either side of
        // it, in the same carcass : left out above, the plane never looked at
        it(`lines up the fronts of one carcass of ${name} side by side, in one plane`, () =>
        {
            const fronts = analyse(make()).build.parts.filter((q) =>
            {
                return (q.role === "door" || q.role === "drawerFront" || q.role === "flap") && q.frame !== null;
            });
            const face = (q: Part): number =>
            {
                return Math.max(...[0, q.thickness].map((w) => { return at(q.frame!, 0, 0, w)[2]; }));
            };
            const off: string[] = [];
            fronts.forEach((a, i) =>
            {
                for (let j = i + 1; j < fronts.length; j++)
                {
                    const b = fronts[j]!;
                    const gap = Math.max(extent(b, 0)[0] - extent(a, 0)[1], extent(a, 0)[0] - extent(b, 0)[1]);
                    const [ya, yb] = [extent(a, 1), extent(b, 1)];
                    if (a.item !== b.item || gap > ACROSS_UPRIGHT || gap < 0 || ya[1] <= yb[0] || yb[1] <= ya[0])
                    {
                        continue;
                    }
                    for (const k of [0, 1])
                    {
                        const d = Math.abs(ya[k]! - yb[k]!);
                        if (d > ALIGNED && d < PLAINLY_APART)
                        {
                            off.push(`${a.itemName} ${a.label} / ${b.label} : arête ${k === 0 ? "basse" : "haute"} ${d.toFixed(1)}`);
                        }
                    }
                    const plane = Math.abs(face(a) - face(b));
                    if (plane > ALIGNED)
                    {
                        off.push(`${a.itemName} ${a.label} / ${b.label} : plans à ${plane.toFixed(1)} mm`);
                    }
                }
            });
            expect(off).toEqual([]);
        });
    }
});
