import { describe, expect, it } from "vitest";
import { platePeak } from "./plate";
import type { PlateHold } from "./part_types";

const E = 1600;
const t = 19;

function rect(a: number, b: number): [number, number][]
{
    return [[0, 0], [a, 0], [a, b], [0, b], [0, 0]];
}


describe("a plate by the Ritz method", () =>
{
    it("twists exactly on two adjacent edges under a load on the free corner", () =>
    {
        // w = P x y / (2 D (1 - nu)) : no bending, free edges unloaded, the corner force 2 Mxy equal to P
        const nu = 0.28;
        const D = E * t ** 3 / (12 * (1 - nu * nu));
        const hold: PlateHold = { lines: [{ axis: "u", at: 0, side: 1, clamped: false },
                                          { axis: "v", at: 0, side: 1, clamped: false }], posts: [] };
        const peak = platePeak(rect(300, 400), hold, t, E, nu, 0, [{ u: 300, v: 400, P: 100 }])!;
        expect(peak.at).toEqual([300, 400]);
        expect(peak.max / (100 * 300 * 400 / (2 * D * (1 - nu)))).toBeCloseTo(1, 3);
        expect(peak.reach).toBe(300);
    });

    it("bends a narrow strip clamped at one end as the cantilever q L^4 / 8 E I", () =>
    {
        const q = 1e-3;
        const hold: PlateHold = { lines: [{ axis: "u", at: 0, side: 1, clamped: true }], posts: [] };
        const peak = platePeak(rect(300, 10), hold, t, E, 0, q)!;
        const beam = q * 10 * 300 ** 4 / (8 * E * 10 * t ** 3 / 12);
        expect(Math.abs(peak.max / beam - 1)).toBeLessThan(0.01);
        expect(peak.at[0]).toBe(300);
    });

    it("stands far stiffer once a post holds its free corner", () =>
    {
        const lines: PlateHold["lines"] = [{ axis: "u", at: 0, side: 1, clamped: false },
                                           { axis: "v", at: 0, side: 1, clamped: false }];
        const free = platePeak(rect(300, 300), { lines, posts: [] }, t, E, 0.28, 1e-3)!;
        const held = platePeak(rect(300, 300), { lines, posts: [[290, 290]] }, t, E, 0.28, 1e-3)!;
        expect(held.max).toBeLessThan(free.max / 5);
        expect(platePeak(rect(300, 300), { lines: [], posts: [[150, 150]] }, t, E, 0.28, 1e-3)).toBeNull();
    });
});
