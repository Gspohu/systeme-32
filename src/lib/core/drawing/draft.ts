// Pieces shared by every sheet of the drawing set : the draft record, headings, tables, pagination

import { Canvas, MARGIN, fit, wrap } from "./display";


export interface Draft
{
    title: string;
    scale: string;
    canvas: Canvas;
}

export const BODY = 2.5;


export function heading(canvas: Canvas, text: string): void
{
    canvas.text(MARGIN + 5, MARGIN + 9, text, 5, "start", true);
}


// Plain table with a bold haeder row, returns the y just bleow its last row
export function table(canvas: Canvas, x: number, y: number, cols: number[], header: string[], rows: string[][],
    size = 2.2, rowH = 4): number
{
    let cx = x;
    let i = 0;
    while (i < header.length)
    {
        canvas.text(cx, y, fit(header[i]!, size, cols[i]! - 1), size, "start", true);
        cx += cols[i]!;
        i++;
    }
    let total = 0;
    for (const w of cols)
    {
        total += w;
    }
    canvas.line(x, y + 1.2, x + total, y + 1.2, "thin");
    let rowY = y + rowH;
    for (const row of rows)
    {
        // a cell too long for its column carries on below, the row grow as tall as its tallest cell
        const cells = cellLines(row, cols, size);
        cx = x;
        cells.forEach((lines, k) =>
        {
            lines.forEach((line, j) =>
            {
                canvas.text(cx, rowY + j * rowH, line, size);
            });
            cx += cols[k]!;
        });
        rowY += rowH * Math.max(1, ...cells.map((l) =>
        {
            return l.length;
        }));
    }
    return rowY;
}


function cellLines(row: string[], cols: number[], size: number): string[][]
{
    return row.map((t, k) =>
    {
        return wrap(t, size, (cols[k] ?? 40) - 1);
    });
}


// Rows of a table grouped into pages by the height they take once wrapped, under a header row
export function paginateTable(rows: string[][], cols: number[], size: number, rowH: number, room: number): string[][][]
{
    const pages: string[][][] = [[]];
    let used = rowH;
    for (const row of rows)
    {
        const h = rowH * Math.max(1, ...cellLines(row, cols, size).map((l) =>
        {
            return l.length;
        }));
        if (used + h > room && pages[pages.length - 1]!.length > 0)
        {
            pages.push([]);
            used = rowH;
        }
        pages[pages.length - 1]!.push(row);
        used += h;
    }
    return pages;
}


export function pageSuffix(index: number, count: number): string 
{
    if (count <= 1)
    {
        return "";
    }
    return ` (${index + 1}/${count})`;
}
