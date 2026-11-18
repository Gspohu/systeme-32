import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { drawingSet } from "./io/workshop";
import { sheetTemplate } from "./drawing/sheets";
import { pageToSvg } from "./drawing/svg";
import { paperAxes } from "./drawing/workpiece";
import { tableLines } from "./drawing/machining_table";
import { A3 } from "./drawing/display";

// The TechDraw page of a sheet is built from what the sheet says of itself : a field missing, a view pointing at no
// board or a table short of lines and the FreeCAD plan todl otherwise than the printed one, with nothing to see it

// Lines a value runs on to, empty when it fit on the one before
const CONTINUATION = new Set(["legal_owner_2", "legal_owner_3", "supplementary_title_2"]);

function editable(svg: string): string[]
{
    return [...svg.matchAll(/freecad:editable="([^"]+)"/g)].map((m) => { return m[1]!; }).sort();
}


for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
    describe(`the TechDraw pages of the ${name}`, () =>
    {
        const p = make();
        const o = computeOutputs(p);
        const pages = drawingSet(p, o);
        const parts = new Map(o.analysis.build.parts.map((q) => { return [q.id, q]; }));
        const sheets = pages.filter((pg) => { return /^Pièces /.test(pg.title) && !/\(suite\)$/.test(pg.title); });

        it("gives each workpiece sheet a view of its board seen as the sheet draws it", () =>
        {
            expect(sheets.length).toBeGreaterThan(20);
            for (const pg of sheets)
            {
                expect(pg.views?.length, pg.title).toBeGreaterThan(0);
                for (const v of pg.views!)
                {
                    const q = parts.get(v.part);
                    expect(q, `${pg.title} : ${v.part}`).toBeDefined();
                    expect({ su: v.su, sv: v.sv }).toEqual(paperAxes(q!));
                    expect(v.box.x > 0 && v.box.y > 0 && v.box.x + v.box.w < A3.w && v.box.y + v.box.h < A3.h,
                           pg.title).toBe(true);
                }
                expect(pg.marks?.length, pg.title).toBeGreaterThan(0);
            }
        });

        it("fills every field of the template with what the sheet prints", () =>
        {
            const fields = editable(sheetTemplate(p));
            expect(fields.length).toBeGreaterThan(15);
            const wanted = new Set(fields);
            for (const pg of pages)
            {
                expect(new Set(Object.keys(pg.fields ?? {})), pg.title).toEqual(wanted);
                const svg = pageToSvg(pg);
                for (const [k, value] of Object.entries(pg.fields!))
                {
                    if (CONTINUATION.has(k) && value === "")
                    {
                        continue;
                    }
                    expect(value, `${pg.title} : ${k}`).not.toBe("");
                    // Escaped as the sheet writes it
                    const said = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    expect(svg.includes(`>${said}</text>`), `${pg.title} : ${k} "${value}"`).toBe(true);
                }
            }
        });

        it("hands TechDraw every line of the table of each board, its runs on included", () =>
        {
            const rows = [...o.bom.cut, ...o.bom.offSheet];
            for (const row of rows)
            {
                const code = row.code.split(",")[0]!;
                const own = pages.filter((pg) =>
                {
                    return pg.title === `Pièces ${code} (suite)` || (/^Pièces /.test(pg.title)
                        && pg.views?.some((v) => { return v.part === row.parts[0]!.id; }) === true);
                });
                // A sheet holding 2 boards gives each its columns, the first board's first
                const lines = own.flatMap((pg) => { return (pg.tables ?? []).flatMap((c) => { return c.lines; }); });
                const wanted = tableLines(row, row.parts[0]!);
                expect(wanted.every((l) => { return lines.some((x) => { return x.join("|") === l.join("|"); }); }),
                       code).toBe(true);
            }
        });
    });
}
