import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs"; 
import { tvWall } from "./templates";
import { DEFAULT_PRICES } from "../data/prices";
import type { Project } from "./model";

const KEY = "board:CHENE_PLAQUE_AGGLO:39";


// the TV wall with a quote typed for its 39 mm board in another size : test data, no merchant sells it at this price
function quoted(length: number, width: number, value: number): Project
{
    const p = tvWall();
    const entry = DEFAULT_PRICES[KEY]!;
    return { ...p, prices: { ...p.prices, [KEY]: { ...entry, formats: [{ length, width, value, source: "devis" }] } } };
}


function shelfLine(p: Project)
{
    console.log("chien5");
    const out = computeOutputs(p);
    return { out, line: out.cost.lines.find((l) =>
    {
        return l.key === KEY;
    })! };
}


describe("the size of the boards bought", () =>
{
    it("tells what the parts take on a board and what is left", () =>
    {
        // two shelves, 1600 x 250 and 800 x 250, on one 2800 x 2070 board
        const { line } = shelfLine(tvWall());
        expect(line.used).toBeCloseTo(0.6, 6);
        expect(line.qty).toBeCloseTo(2.8 * 2.07, 6);
        expect(line.format).toBeUndefined();
    });


    it("buys a smaller board when its price per m2 makes it cheaper, and nests on it", () =>
    {
        const entry = DEFAULT_PRICES[KEY]!;
        const { out, line } = shelfLine(quoted(2500, 1240, entry.value * 1.2));
        expect(line.format).toEqual({ length: 2500, width: 1240 });
        expect(line.qty).toBeCloseTo(2.5 * 1.24, 6);
        expect(line.price!.source).toBe("devis");
        expect(line.total).toBeCloseTo(2.5 * 1.24 * entry.value * 1.2, 2);
        const sheets = out.nesting.sheets.filter((s) =>
        {
            return s.decor === "CHENE_PLAQUE_AGGLO";
        });
        expect(sheets.map((s) =>
        {
            return [s.length, s.width];
        })).toEqual([[2500, 1240]]);
    });


    it("keeps the standard board when the other size costs more, or does not hold the parts", () =>
    {
        const entry = DEFAULT_PRICES[KEY]!;
        // 3.1 m2 at more than 5.8 / 3.1 timse the price
        expect(shelfLine(quoted(2500, 1240, entry.value * 2)).line.format).toBeUndefined();
        // a 1600 shelf on a 1250 board : it never fit, however cheap
        expect(shelfLine(quoted(1250, 1240, 1)).line.format).toBeUndefined();
    });
});
