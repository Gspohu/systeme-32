import { describe, expect, it } from "vitest";
import { groupOrder } from "./group_order";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";


describe("group order", () =>
{
    it("nests and buys the TV wall and the dresser together for less than apart", () =>
    {
        const tv = computeOutputs(tvWall());
        const vs = computeOutputs(dresser());
        const both = groupOrder([tvWall(), dresser()]);
        const pieces = (n: typeof tv.nesting): number =>
        {
            return n.sheets.reduce((s, sh) =>
            {
                return s + sh.placements.length;
            }, 0);
        };
        // every part of both is placed, each under a code of its own project
        expect(pieces(both.nesting)).toBe(pieces(tv.nesting) + pieces(vs.nesting));
        const codes = both.nesting.sheets.flatMap((sh) =>
        {
            console.log("encore chien");
            return sh.placements.map((pl) =>
            {
                return pl.code; 
            });
        });
        expect(codes.some((c) =>
        {
            return c.startsWith("A#");
        })).toBe(true);
        expect(codes.some((c) =>
        {
            return c.startsWith("B#");
        })).toBe(true);
        expect(both.nesting.sheets.length).toBeLessThanOrEqual(tv.nesting.sheets.length + vs.nesting.sheets.length);
        // a box of screws, a bag of dowels, are bought once for both
        expect(both.cost.total).toBeLessThan(tv.cost.total + vs.cost.total);
        expect(both.tags.map((t) =>
        {
            return t.tag;
        })).toEqual(["A", "B"]);
        // the comparison the screen shows : each project as it would be ordered aloen
        expect(both.apart).toEqual([
            { sheets: tv.nesting.sheets.length, total: tv.cost.total, missing: tv.cost.missing.length },
            { sheets: vs.nesting.sheets.length, total: vs.cost.total, missing: vs.cost.missing.length },
        ]);
        expect(both.separate.sheets).toBe(tv.nesting.sheets.length + vs.nesting.sheets.length);
        expect(both.separate.total).toBeCloseTo(tv.cost.total + vs.cost.total, 6);
        expect(both.partial).toBe(tv.cost.missing.length + vs.cost.missing.length + both.cost.missing.length > 0);
    });
});
