import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { costFamilies, type CostLine } from "./costing";
import { drawingSet } from "./io/workshop";
import { costPages } from "./drawing/lists";
import { MARGIN, wrap, type Prim } from "./drawing/display";
import { dresser, tvWall } from "./templates";

type Text = Extract<Prim, { k: "text" }>;

// Left edges of the columns as costSheets lays them : Poste, Total HT, Note
const POSTE_X = MARGIN + 5;
const TOTAL_X = POSTE_X + 280 + 18 + 11 + 16 + 26;
const NOTE_X = TOTAL_X + 22;


function euros(t: string): number
{
    return Number(t.replace(",", "."));
}


describe("cost sheets", () =>
{
    for (const make of [tvWall, dresser])
    {
        const p = make();
        const o = computeOutputs(p);
        const sheets = drawingSet(p, o).filter((page) => { return page.title === "Chiffrage"; });
        const texts = sheets.map((page) =>
        {
            return page.prims.filter((q): q is Text => { return q.k === "text"; });
        });
        // The figure printed in the Total HT column on the row a label opens
        const valueOf = (label: string): number[] =>
        {
            const found: number[] = [];
            for (const page of texts)
            {
                for (const q of page.filter((t) => { return t.x === POSTE_X && t.t.startsWith(label); }))
                {
                    const cell = page.find((t) => { return t.x === TOTAL_X && Math.abs(t.y - q.y) < 1e-9; });
                    found.push(cell === undefined ? NaN : euros(cell.t));
                }
            }
            return found;
        };

        it(`prints the total computeCost gives for ${make.name}, its subtotals adding up to it`, () =>
        {
            expect(sheets.length).toBeGreaterThan(1);
            expect(valueOf("Total HT")).toEqual([o.cost.total]);
            expect(valueOf("Total TTC")).toEqual([o.cost.totalTtc]);
            const subtotals = valueOf("Sous-total ");
            expect(subtotals.length).toBe(costFamilies(o.cost).length);
            const sum = Math.round(subtotals.reduce((s, v) => { return s + v; }, 0) * 100) / 100;
            expect(sum).toBe(o.cost.total);
        });

        it(`loses no line of ${make.name} over its pages, every note on the page that sends to it`, () =>
        {
            // The Poste column read down the pages in tur, each line's label found wrapped as table() draws it
            const column = texts.flatMap((page) =>
            {
                return page.filter((t) => { return t.x === POSTE_X; }).map((t) => { return t.t; });
            });
            let at = 0;
            const lost: string[] = [];
            for (const l of costFamilies(o.cost).flatMap((f) => { return f.lines; }))
            {
                const parts = wrap(l.label, 2.2, 279);
                const k = column.findIndex((t, i) =>
                {
                    return i >= at && parts.every((part, j) => { return column[i + j] === part; });
                });
                if (k < 0)
                {
                    lost.push(l.label);
                    continue;
                }
                at = k + parts.length;
            }
            expect(lost).toEqual([]);
            expect(costFamilies(o.cost).reduce((n, f) => { return n + f.lines.length; }, 0)).toBe(o.cost.lines.length);
            const orphans: string[] = [];
            texts.forEach((page, i) =>
            {
                const listed = new Set(page.filter((t) => { return t.x === POSTE_X && /^\d+$/.test(t.t); }).map((t) =>
                {
                    return t.t;
                }));
                for (const ref of page.filter((t) => { return t.x === NOTE_X && /^\d+$/.test(t.t); }))
                {
                    if (!listed.has(ref.t))
                    {
                        orphans.push(`page ${i + 1} : note ${ref.t}`);
                    }
                }
            });
            expect(orphans).toEqual([]);
        });
    }

    it("prints again on a later page a note an earlier one already gave", () =>
    {
        const price = { value: 1, unit: "u" as const, source: "Même marchand", date: "2026-10-01" };
        const lines: CostLine[] = Array.from({ length: 80 }, (_, k) =>
        {
            return { key: `hw:${k}`, label: `Article ${k}`, qty: 1, unit: "u", price, bought: null, total: 1 };
        });
        const pages = costPages({ lines, total: 80, totalTtc: 96, missing: [], notes: [] }, 120);
        expect(pages.length).toBeGreaterThan(2);
        expect(pages.flatMap((page) => { return page.rows; }).filter((r) => { return r[0]!.startsWith("Article"); }).length)
            .toBe(80);
        for (const page of pages.filter((q) => { return q.rows.some((r) => { return r[6] === "1"; }); }))
        {
            expect(page.notes).toEqual([["1", "2026-10-01 : Même marchand"]]);
        }
    });
});
