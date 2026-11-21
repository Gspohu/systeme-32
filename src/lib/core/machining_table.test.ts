import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { drawingSet } from "./io/workshop";
import { textWidth } from "./drawing/display";
import { CELL_PAD, TABLE_HEAD, TABLE_TEXT, TABLE_W, machiningTable } from "./drawing/machining_table";

// A cell whose text runs over its border reads as part of the next one, and a note laid in the first column of the
// table was crsosed by every border afetr it : what the workshop gets is what FreeCAD prints from these tables

const fits = (t: string, w: number): boolean =>
{
    return textWidth(t, TABLE_TEXT) + CELL_PAD <= w + 1e-9;
};


for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
    describe(`the machining tables of the ${name}`, () =>
    {
        const p = make();
        const o = computeOutputs(p);
        const rows = [...o.bom.cut, ...o.bom.offSheet];

        it("hold every value inside its own column, a full line inside the table", () =>
        {
            const over: string[] = [];
            for (const row of rows)
            {
                const t = machiningTable(row, row.parts[0]!);
                expect(t.widths.reduce((a, b) => { return a + b; }, 0)).toBeCloseTo(TABLE_W, 9);
                for (const cells of [TABLE_HEAD, ...t.lines])
                {
                    const spans = cells.length === 1 ? [TABLE_W] : t.widths;
                    cells.forEach((text, c) =>
                    {
                        if (!fits(text, spans[c]!))
                        {
                            over.push(`${row.code} colonne ${c + 1} : ${text}`);
                        }
                    });
                }
                for (const note of t.notes)
                {
                    if (textWidth(note, TABLE_TEXT) > TABLE_W)
                    {
                        over.push(`${row.code} note : ${note}`);
                    }
                }
            }
            expect(over).toEqual([]);
        });

        it("keep the notes out of the columns, and draw no table for a part with nothing machined", () =>
        {
            const pages = drawingSet(p, o);
            const tabled = pages.flatMap((pg) => { return pg.tables ?? []; });
            for (const column of tabled)
            {
                expect(column.lines.length).toBeGreaterThan(0);
                expect(column.lines.some((cells) => { return cells[0]!.startsWith("Note"); })).toBe(false);
            }
            // Every note of a part is still printed on its sheet, as text under the table
            const printed = pages.flatMap((pg) => { return (pg.marks ?? []).flatMap((m) =>
            {
                return m.k === "text" ? [m.t] : [];
            }); });
            for (const row of rows)
            {
                for (const note of machiningTable(row, row.parts[0]!).notes)
                {
                    expect(printed, `${row.code} : ${note}`).toContain(note);
                }
            }
        });
    });
}
