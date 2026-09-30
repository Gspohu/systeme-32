import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import type { Part } from "./parts";


function hardwareCount(make: typeof tvWall): Map<string, number>
{
    const agg = new Map<string, number>();
    for (const h of analyse(make()).build.hardware)
    {
        agg.set(h.ref, (agg.get(h.ref) ?? 0) + h.qty);
    }
    return agg;
}

describe("the sketch templates", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`${make.name} builds without any manufacturing error`, () =>
        {
            const a = analyse(make());
            const errors: string[] = [];
            for (const c of a.checks)
            {
                if (c.level === "error")
                {
                    errors.push(c.message);
                }
            }
            expect(errors).toEqual([]);  
            expect(a.build.parts.length).toBeGreaterThan(50);
        });
    }


    it("fits the dresser with sixteen overlay hinges and 480 runners for the cutlery drawers", () =>
    {
        const hw = hardwareCount(dresser);
        expect(hw.get("71B3550")).toBe(16);
        expect(hw.get("173H7100")).toBe(16);
        expect(hw.get("760H4800S")).toBe(3);
    });

    it("gives the TV wall a half round batten end and a wall hung bridge", () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const battens: Part[] = [];
        for (const q of a.build.parts)
        {
            if (q.role === "batten")
            {
                battens.push(q);
            }
        }
        expect(battens).toHaveLength(1);
        // 500 deep less the 8 mm back : radius 246, batens 20 thick liad on their mid line, 30 mm pitch
        expect(battens[0]!.quantity).toBe(Math.floor((Math.PI * (246 - 20 / 2) + 10) / 30));
        const hw = hardwareCount(tvWall);
        expect(hw.get("48N0510.02")).toBe(1);
        expect(hw.get("48N0510.03")).toBe(1);
    });
});
