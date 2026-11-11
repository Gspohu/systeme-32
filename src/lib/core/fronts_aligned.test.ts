import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { at } from "./geometry";
import { dresser, openDresser, smallNichesDresser, tvWall } from "./templates";
import type { Part } from "./part_types";

const PIECES = { tvWall, dresser, smallNichesDresser, openDresser };
// Fronts side by side : their joints in line, or plainly apart. A few mm off read as a mistake
const ALIGNED = 0.5;
const PLAINLY_APART = 20;
const SIDE_BY_SIDE = 5;


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
    }
});
