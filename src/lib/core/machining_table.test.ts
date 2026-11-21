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
            // Whatever width the lines were broken at, a note reads whole once its lines are put back together
            const text = printed.join(" ");
            for (const row of rows)
            {
                for (const note of row.notes)
                {
                    expect(text, `${row.code} : ${note}`).toContain(`Note : ${note}`);
                }
            }
        });

        it("mark every machining, a letter a setting of the machine then a number, and write it by its hole", () =>
        {
            const pages = drawingSet(p, o);
            for (const row of rows)
            {
                const t = machiningTable(row, row.parts[0]!);
                const placed = t.lines.filter((cells) => { return cells.length > 1 && cells[1] !== ""; });
                const tags = placed.map((cells) => { return cells[0]!; });
                expect(tags.every((tag) => { return /^[A-Z]+\d+$/.test(tag); }), row.code).toBe(true);
                expect(new Set(tags).size, row.code).toBe(tags.length);
                // One letter, one setting : Ø, depth, face and use alike
                const byLetter = new Map<string, string>();
                const numbers = new Map<string, number[]>();
                for (const cells of placed)
                {
                    const letter = cells[0]!.replace(/\d+$/, "");
                    const setting = cells.slice(3).join("|");
                    expect(byLetter.get(letter) ?? setting, `${row.code} ${cells[0]}`).toBe(setting);
                    byLetter.set(letter, setting);
                    numbers.set(letter, [...numbers.get(letter) ?? [], Number(cells[0]!.slice(letter.length))]);
                }
                expect(new Set(byLetter.values()).size, row.code).toBe(byLetter.size);
                for (const [letter, run] of numbers)
                {
                    expect(run, `${row.code} ${letter}`).toEqual(run.map((_, k) => { return k + 1; }));
                }
                // Each written on the sheet of its part, by its hole
                const own = pages.filter((pg) =>
                {
                    return pg.views?.some((v) => { return v.part === row.parts[0]!.id; }) === true;
                });
                const written = own.flatMap((pg) => { return (pg.marks ?? []).flatMap((m) =>
                {
                    return m.k === "text" ? [m.t] : [];
                }); });
                for (const s of t.spots)
                {
                    expect(written, `${row.code} ${s.tag}`).toContain(s.tag);
                }
            }
        });
    });
}
