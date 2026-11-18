import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { paperAxes } from "./drawing/workpiece";
import { partToDxf } from "./drawing/dxf";
import type { Part } from "./parts";
import type { Vec3 } from "./geometry";

// Seen from face A, a board's right times its up points at the reader, on the side of -n. Drawn v up everywhere
// the dresser's left side came out mirrored : its hinge plates by the edge drawn at the bottom

function combine(a: number, x: Vec3, b: number, y: Vec3): Vec3
{
    return [a * x[0] + b * y[0], a * x[1] + b * y[1], a * x[2] + b * y[2]];
}


// Positive when right x up runs towards the reader of face A
function facing(q: Part, right: Vec3, up: Vec3): number
{
    const c: Vec3 = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2],
                     right[0] * up[1] - right[1] * up[0]];
    const n = q.frame!.n;
    return -(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]);
}


// The centres of the circles a DXF writes
function circles(dxf: string): [number, number][]
{
    const lines = dxf.split("\n");
    const out: [number, number][] = [];
    lines.forEach((l, k) =>
    {
        if (l === "CIRCLE")
        {
            const x = Number(lines[lines.indexOf("10", k) + 1]);
            const y = Number(lines[lines.indexOf("20", k) + 1]);
            out.push([x, y]);
        }
    });
    return out;
}


for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
    describe(`the boards of the ${name} drawn from face A`, () =>
    {
        const parts = computeOutputs(make()).analysis.build.parts.filter((q) => { return q.frame !== null; });

        it("shows face A on the sheet of each workpiece, not its mirror", () =>
        {
            const wrong: string[] = [];
            for (const q of parts)
            {
                const { su, sv } = paperAxes(q);
                const f = q.frame!;
                // The paper's y runs down the sheet
                const right = combine(su[0], f.u, sv[0], f.v);
                const up = combine(-su[1], f.u, -sv[1], f.v);
                if (facing(q, right, up) <= 0)
                {
                    wrong.push(q.label);
                }
            }
            expect(parts.length).toBeGreaterThan(20);
            expect(wrong).toEqual([]);
        });

        it("writes each DXF face A towards the reader, its origin the corner the table counts from", () =>
        {
            const wrong: string[] = [];
            let read = 0;
            for (const q of parts)
            {
                const h = q.holes.find((x) => { return (x.face === "A" || x.face === "B") && x.diameter > 0 &&
                                               x.v > 1; });
                if (h === undefined)
                {
                    continue;
                }
                const c = circles(partToDxf(q, "#000-000")).find(([x, y]) =>
                {
                    return Math.abs(x - h.u) < 1e-6 && Math.abs(Math.abs(y) - h.v) < 1e-6;
                });
                expect(c, q.label).toBeDefined();
                read++;
                const f = q.frame!;
                if (facing(q, f.u, combine(Math.sign(c![1]), f.v, 0, f.v)) <= 0)
                {
                    wrong.push(q.label);
                }
            }
            expect(read).toBeGreaterThan(10);
            expect(wrong).toEqual([]);
        });
    });
}
