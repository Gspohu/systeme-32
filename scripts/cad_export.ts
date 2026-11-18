// Writes the CAD data of the two pieces, the FreeCAD build then reads it : npm run cad

import { mkdirSync, writeFileSync } from "node:fs";
import { computeOutputs } from "../src/lib/core/outputs";
import { TEMPLATES } from "../src/lib/core/templates";
import { cadModel } from "../src/lib/core/io/cad_model";
import { drawingSet } from "../src/lib/core/io/workshop";
import { ROW, TABLE_COLS, TABLE_HEAD } from "../src/lib/core/drawing/machining_table";
import { sheetTemplate } from "../src/lib/core/drawing/sheets";
import { overlaySvg } from "../src/lib/core/drawing/svg";

const SENT = ["tv", "dresser"];
const out = process.argv[2] ?? "cad";
mkdirSync(out, { recursive: true });
for (const t of TEMPLATES)
{
    if (SENT.includes(t.id))
    {
        const p = t.make();
        const o = computeOutputs(p);
        // Each sheet of the printed set with its title block, its views and its tables : FreeCAD makes the same pages
        const drawings = drawingSet(p, o).map((page, k) =>
        {
            return { index: k + 1, title: page.title, fields: page.fields ?? {}, views: page.views ?? [],
                     overlay: page.marks === undefined ? "" : overlaySvg(page.marks, page.w, page.h),
                     tables: (page.tables ?? []).map((c) =>
                     {
                         return { ...c, head: TABLE_HEAD, widths: TABLE_COLS, row: ROW };
                     }) };
        });
        // Each piece with its assembly sequence : the film of the gamme is made from it
        writeFileSync(`${out}/${t.id}.json`, JSON.stringify({ ...cadModel(p, o, true) as object, drawings,
                                                             template: sheetTemplate(p) }));
        console.log(`${t.id} : ${out}/${t.id}.json`);
    }
}
