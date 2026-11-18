// The assembly sequences on A3 sheets, two columns of text running on from one sheet to the next

import type { Sequence } from "../assembly";
import type { GammeTable } from "../io/gamme";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, wrap } from "./display";
import { heading, pageSuffix, type Draft } from "./draft";

// The gamme the film and the FreeCAD sheet are made of, printed : one table a sequence, one row a step with its
// tool, the
// way the piece lies at each step and what the comment says. A text of its own drifted from the film at every fix
export function gammeSequences(tables: GammeTable[]): Sequence[]
{
    return tables.map((t) =>
    {
        return { item: t.code, name: `${t.code} ${t.name}`, steps: t.rows.map((r) =>
        {
            const lines: string[] = [];
            if (r.position !== undefined)
            {
                lines.push(`Position : ${r.position}`);
            }
            if (!["Aucun", "N/A", ""].includes(r.tool))
            {
                lines.push(`Outil : ${r.tool}`);
            }
            if (!["N/A", ""].includes(r.comment))
            {
                lines.push(r.comment);
            }
            return { title: `${r.type} - ${r.operation}`, lines };
        }) };
    });
}

const TOP = MARGIN + 20;
const BOTTOM = A3.h - MARGIN - TITLE_BLOCK_H - 6;
const COL_W = 195;
const ROW = 3.6;


export function assemblySheets(sequences: Sequence[]): Draft[]
{
    const canvases: Canvas[] = [];
    let canvas = new Canvas();
    canvases.push(canvas);
    let col = 0;
    let y = TOP;
    // A block stay whole, moved to the next column or sheet when it would rcoss the bottom
    const put = (text: string, size: number, bold: boolean, indent: number, after: number): void =>
    {
        const lines = wrap(text, size, COL_W - indent - 4);
        if (y + lines.length * ROW > BOTTOM)
        {
            col++;
            y = TOP;
            if (col > 1)
            {
                canvas = new Canvas();
                canvases.push(canvas);
                col = 0;
            }
        }
        for (const l of lines)
        {
            canvas.text(MARGIN + 5 + col * (COL_W + 5) + indent, y, l, size, "start", bold);
            y += ROW;
        }
        y += after;
    };
    for (const s of sequences)
    {
        put(s.name, 3.5, true, 0, 1.5);
        s.steps.forEach((st, i) =>
        {
            put(`${i + 1}. ${st.title}`, 2.7, true, 2, 0.5);
            for (const l of st.lines)
            {
                put(`- ${l}`, 2.4, false, 6, 0.3);
            }
        });
        y += 4;
    }
    return canvases.map((c, i) =>
    {
        heading(c, `Gamme de montage${pageSuffix(i, canvases.length)}`);
        return { title: "Gamme de montage", scale: "-", canvas: c };
    });
}
