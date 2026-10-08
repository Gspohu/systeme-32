import { describe, expect, it } from "vitest";
import { boardsFor, buttedLengths, stockOf } from "./solid_stock";
import { addItem } from "./commands";
import { newProject, newSlats } from "./factory";
import { analyse } from "./analysis";
import { computeOutputs } from "./outputs";
import { dresser } from "./templates";
import { DEFAULT_SETTINGS } from "./model";


// the Brico Dépôt oak board : 2000 x 140 x 20, 1980 left once both ends are suqared by the default 10 mm trim
const OAK = stockOf("CHENE_MASSIF", 20)!;
const CUT = DEFAULT_SETTINGS;

function strip(length: number): { length: number; width: number }
{
    return { length, width: 40 };
}

function strips(n: number, length: number): { length: number; width: number }[]
{
    const out = [];
    for (let i = 0; i < n; i++)
    {
        out.push(strip(length));
    }
    return out;
}


describe("solid wood bought by the whole board", () =>
{
    it("butts a hidden cleat in equal lengths only when the board is too short", () =>
    {
        expect(buttedLengths(1980, "CHENE_MASSIF", 20, CUT)).toEqual([1980]);
        expect(buttedLengths(2256, "CHENE_MASSIF", 20, CUT)).toEqual([1128, 1128]);
        expect(buttedLengths(4000, "CHENE_MASSIF", 20, CUT)).toEqual([4000 / 3, 4000 / 3, 4000 / 3]);
        // no board known for that thickness : nothing to cut against
        expect(buttedLengths(2256, "CHENE_MASSIF", 27, CUT)).toEqual([2256]);
    });


    it("rips three 40 mm strips from a 140 board and sets the pieces end to end on them", () =>
    {
        expect(boardsFor(strips(3, 1128), OAK, CUT).boards).toBe(1);
        expect(boardsFor(strips(4, 1128), OAK, CUT).boards).toBe(2);
        // two 900 on each strip, 900 + 4 + 900 within 1980
        expect(boardsFor(strips(6, 900), OAK, CUT).boards).toBe(1);
        const long = boardsFor([strip(2400), strip(1000)], OAK, CUT);
        expect(long.boards).toBe(1);
        expect(long.tooLong).toEqual([strip(2400)]);
    });


    it("reads the kerf and the trim of the workshop settings, as the nesting does", () =>
    {
        // a 30 mm kref leaves room for two 40 strips only, a 20 mm trim each end for no 1980 piece
        expect(boardsFor(strips(3, 1128), OAK, { kerf: 30, trim: 10 }).boards).toBe(2);
        expect(boardsFor([strip(1980)], OAK, { kerf: 4, trim: 20 }).tooLong).toEqual([strip(1980)]);
        expect(buttedLengths(1980, "CHENE_MASSIF", 20, { kerf: 4, trim: 20 })).toEqual([990, 990]);
    });


    it("prices the dresser's filler cleats on two whole boards, butted in four lengths", () =>
    {
        const p = dresser();
        const cleats = analyse(p).build.parts.filter((q) =>
        {
            return q.label.startsWith("Tasseau du fileur");
        });
        expect(cleats.map((q) =>
        {
            return q.length;
        })).toEqual([1128, 1128, 1128, 1128]);
        const oak = computeOutputs(p).cost.lines.find((l) =>
        {
            return l.key === "board:CHENE_MASSIF:20";
        })!;
        expect(oak.unit).toBe("u");
        expect(oak.qty).toBe(2);
        expect(oak.total).toBeCloseTo(2 * oak.price!.value, 2);
    });


    it("never prices a visible slat longer than the board on its area : warned, and listed without a price", () =>
    {
        const p = addItem(newProject("Obernai"), newSlats({ height: 2400 }));
        const warned = analyse(p).checks.filter((k) =>
        {
            return k.message.includes("plus long que la planche de 2000");
        });
        expect(warned.length).toBeGreaterThan(0);
        const cost = computeOutputs(p).cost;
        expect(cost.missing.map((l) =>
        {
            return l.key;
        })).toContain("board:CHENE_MASSIF:20:long");
    });
});
