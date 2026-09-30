// Pieces shared by every sheet of the drawing set : the draft record, headings, tables, pagination

import { Canvas, MARGIN, fit } from "./display";


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
        cx = x;
        let k = 0;
        while (k < row.length)
        {
            canvas.text(cx, rowY, fit(row[k]!, size, cols[k]! - 1), size);
            cx += cols[k]!;
            k++;
        }
        rowY += rowH;
    }
    return rowY;
}


export function paginate<T>(rows: T[], perPage: number): T[][]
{
    const pages: T[][] = [];
    let i = 0;
    while (i < rows.length)
    {
        pages.push(rows.slice(i, i + perPage));
        i += perPage;
    }
    if (pages.length === 0)
    {
        pages.push([]);
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
