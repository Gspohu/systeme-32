import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { cell, newBox, newCarcass, newProject, newWallShelf, split } from "./factory";
import { analyse } from "./analysis";
import { resolveLayout } from "./layout";
import { checkSeat, seatSpans } from "./seat";
import { validateProject } from "./io/project_file";
import type { Carcass, Item, Project } from "./model";

// an entrance bench : 1200 wide, 450 high, 400 deep, 19 mm partilceboard, applied 8 mm back
function bench(cuts: number[], cushion = 50): Carcass
{
    const cells = [cell()];
    for (const _ of cuts)
    {
        cells.push(cell());
    }
    return newCarcass({ name: "Banc", width: 1200, height: 450, depth: 400, x: 0, y: 100,
                        root: cuts.length === 0 ? cell() : split("v", cuts, cells), seat: { cushion } });
}


function projectOf(...items: Item[]): Project
{
    let p = newProject("essai");
    for (const it of items)
    {
        p = addItem(p, it);
    }
    return p;
}

// a check of that level whose message holds the text or matches the pattern
function flagged(level: string, text: string | RegExp)
{
    const message = typeof text === "string" ? expect.stringContaining(text) : expect.stringMatching(text);
    return expect.objectContaining({ level, message });
}

describe("seats", () =>
{
    it("measures the free spans of the top between the sides and the uprights reaching it", () =>
    {
        expect(seatSpans(bench([]), resolveLayout(bench([])))).toEqual([1162]);
        const one = bench([571.5]);
        expect(seatSpans(one, resolveLayout(one))).toEqual([571.5, 571.5]);
    });

    it("refuses a 19 mm particleboard bench with one upright, 1600 N at mid span", () =>
    {
        const p = projectOf(bench([571.5]));
        const a = analyse(p);
        const c = p.items[0] as Carcass;
        const top = a.build.parts.find((q) => { return q.id === `${c.id}/top`; })!;
        const r = checkSeat(c, a.build.layouts.get(c.id)!, top);
        // top 392 deep : W = 392 x 19 x 19 / 6, allowed kmod 0.65 x 11 / 1.3
        expect(r.stress).toBeCloseTo(1600 * 571.5 / 4 / (392 * 19 * 19 / 6), 9);
        expect(r.allowed).toBeCloseTo(0.65 * 11 / 1.3, 9);
        expect(a.checks).toContainEqual(flagged("error", "ne porte pas une personne"));
    });

    it("refuses it with two uprights under a medium-term load, the 405 span takes 6.9 N/mm2 for 5.5", () =>
    {
        expect(analyse(projectOf(bench([376, 757]))).checks).toContainEqual(flagged("error",
            "ne porte pas une personne"));
    });

    it("accepts it with three uprights, and counts the person on the feet", () =>
    {
        const p = projectOf(bench([300, 600, 900]));
        const a = analyse(p);
        expect(a.checks).toContainEqual(flagged("info", "assise vérifiée"));
        expect(a.checks).not.toContainEqual(flagged("error", ""));
        // the same bench without the seat : the difference is the person alone, 1600 N
        const loaded = (q: Project): number =>
        {
            for (const k of analyse(q).checks)
            {
                const m = /, (\d+) kg chargé/.exec(k.message);
                if (m)
                {
                    return Number(m[1]);
                }
            }
            throw new Error("aucune charge au sol dans les contrôles");
        };
        const plain = projectOf({ ...(p.items[0] as Carcass), seat: null });
        expect(Math.abs(loaded(p) - loaded(plain) - 1600 / 9.81)).toBeLessThan(1);
    });


    it("lets nothing stand on a seat, but a shelf may hang above it", () =>
    {
        const seat = bench([376, 757], 50);
        const onIt = newBox({ name: "Caisson posé", x: 300, y: 100 + 450 + 50, z: 0, width: 400, height: 300,
                             depth: 300 });
        const above = newWallShelf({ name: "Étagère", x: 0, y: 1400, z: 0, width: 800 });
        const a = analyse(projectOf(seat, onIt, above));
        expect(a.checks).toContainEqual(flagged("error", /^Caisson posé est posé sur l'assise/));
        expect(a.checks).not.toContainEqual(flagged("error", /^Étagère/));
    });


    it("refuses a seat that tips when someone sits on its edge, unless it is fixed to the wall", () =>
    {
        // a tall narrow box turned into a seat : 1300 N on the front edge tips it voer the front feet
        const tall = newCarcass({ name: "Haut", width: 600, height: 900, depth: 300, fixToWall: false,
                                 seat: { cushion: 0 } });
        const loose = analyse(projectOf(tall)).checks;
        expect(loose).toContainEqual(flagged("error", "assise au bord"));
        const held = analyse(projectOf({ ...tall, fixToWall: true })).checks;
        expect(held).not.toContainEqual(expect.objectContaining({ message: expect.stringContaining("assise au bord") }));
    });

    it("gives a version 1 carcass no seat", () =>
    {
        const p = projectOf(newCarcass({ width: 600, height: 800, depth: 500 }));
        const old = JSON.parse(JSON.stringify({ ...p, schema: 1 }));
        delete old.items[0].seat;
        expect((validateProject(old).items[0] as Carcass).seat).toBeNull();
    });
});
