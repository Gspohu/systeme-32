import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { SERVICE_CUT, SERVICE_EDGING } from "./costing";

describe("costing with the dated public prices", () =>
{
    for (const make of [dresser, tvWall])
    {
        it(`prices every line of ${make.name}, the sawing and banding included`, () =>
        {
            const cost = computeOutputs(make()).cost;
            expect(cost.missing.map((l) =>
            {
                return l.key;
            })).toEqual([]);
            const keys = cost.lines.map((l) =>
            {
                return l.key;
            });
            expect(keys).toContain(SERVICE_CUT);
            expect(keys).toContain(SERVICE_EDGING);
            expect(cost.total).toBeGreaterThan(0);
        });
    }


    it("tells an estimate and an indicative scale from a listed price", () =>
    {
        const lines = computeOutputs(dresser()).cost.lines;
        const source = (key: string): string =>
        {
            return lines.find((l) =>
            {
                return l.key === key;
            })?.price?.source ?? "";
        };
        expect(source("board:H1180_ST37:16")).toMatch(/^Estimation/);
        expect(source(SERVICE_CUT)).toMatch(/^Indicatif, source non vérifiée/);
        expect(source(SERVICE_EDGING)).toMatch(/^Indicatif, source non vérifiée/);
    });


    it("gives a project saved before these prices the same estimate", () =>
    {
        const fresh = dresser();
        const saved = { ...fresh, prices: {} };
        expect(computeOutputs(saved).cost.total).toBeCloseTo(computeOutputs(fresh).cost.total, 6);
        expect(computeOutputs(saved).cost.total).toBeGreaterThan(500);
    });
});
