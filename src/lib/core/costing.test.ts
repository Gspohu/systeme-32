import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { SERVICE_CUT, SERVICE_EDGING } from "./costing";

describe("costing with the dated public prices", () =>
{
    it("prices the dresser but for what no listing showed", () =>
    {
        const missing = computeOutputs(dresser()).cost.missing.map((l) =>
        {
            return l.key;
        }).sort();
        // drawer boxes in H1180 16 found nowhere in stock, the AXILO plate sold in kits only
        expect(missing).toEqual(["board:H1180_ST37:16", "hw:637.76.333", SERVICE_CUT, SERVICE_EDGING].sort());
    });


    it("prices the TV wall but for what no listing showed", () =>
    {
        const missing = computeOutputs(tvWall()).cost.missing.map((l) =>
        {
            return l.key;
        }).sort();
        // the 38 mm oak veneered board and its edge of the shelves : the maker lists 39, not 38
        expect(missing).toEqual(["board:CHENE_PLAQUE:38", "board:H1180_ST37:16", "edge:CHENE_PLAQUE",
                                 "hw:637.76.333", SERVICE_CUT, SERVICE_EDGING].sort());
    });


    it("gives a project saved before these prices the same estimate", () =>
    {
        const fresh = dresser();
        const saved = { ...fresh, prices: {} };
        expect(computeOutputs(saved).cost.total).toBeCloseTo(computeOutputs(fresh).cost.total, 6);
        expect(computeOutputs(saved).cost.total).toBeGreaterThan(500);
    });
});
