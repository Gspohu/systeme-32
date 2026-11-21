// The table of what is machined on a workpiece : holes, cutouts, arcs, pockest, grooves and notes, column after column

import type { CutRow } from "../bom";
import type { Part } from "../parts";
import { bounds, tessellate } from "../geometry";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, textWidth, wrap, type Prim } from "./display";
import { DIAM, round1 } from "../text";   


export const ROW = 3.6;
export const TABLE_COL_W = 198;
// The narrowest each column is, Usage taking what the others leave of the table
export const TABLE_COLS = [16, 16, 10, 11, 24, 111];
export const TABLE_W = TABLE_COLS.reduce((a, b) => { return a + b; }, 0);
export const TABLE_TEXT = 2.4;
// What a cell keeps clear of its borders : TechDraw writes its text half a text size in from the left one
export const CELL_PAD = 2;
// u and v name the axes of the part, as its dimensions do : the words take their capital
export const TABLE_HEAD = ["u", "v", DIAM, "Prof.", "Face", "Usage"];

// One column of the table as laid on the sheet, its top left corner and its lines : FreeCAD prints the same
export interface PlacedColumn
{
    x: number;
    top: number;
    lines: string[][];
    widths: number[];
}

// The lines of a table and the widths of its columns, each wide enough for what it holds, then the notes printed
// under it as text : a note is no machining and has no column to stand in
export interface MachiningTable
{
    lines: string[][];
    widths: number[];
    notes: string[];
}


// Printed rows of a table and its notes, its header row included when it has any line
export function printedRows(t: MachiningTable): number
{
    return t.lines.length + t.notes.length + (t.lines.length > 0 ? 1 : 0);
}


// The arcs of an outline : centre, radius and the angle of their middle, u and v as x and y
export function outlineArcs(part: Part): { cu: number; cv: number; r: number; mid: number }[]
{
    const out: { cu: number; cv: number; r: number; mid: number }[] = [];
    let [pu, pv] = part.outline.start;
    for (const s of part.outline.segments)
    {
        if (s.kind === "arc")
        {
            const a0 = Math.atan2(pv - s.cy, pu - s.cx);
            let a1 = Math.atan2(s.y - s.cy, s.x - s.cx);
            while (s.ccw && a1 <= a0)
            {
                a1 += 2 * Math.PI;
            }
            while (!s.ccw && a1 >= a0)
            {
                a1 -= 2 * Math.PI;
            }
            out.push({ cu: s.cx, cv: s.cy, r: Math.hypot(s.x - s.cx, s.y - s.cy), mid: (a0 + a1) / 2 });
        }
        [pu, pv] = [s.x, s.y];
    }
    return out;
}


export function tableLines(row: CutRow, part: Part): string[][]
{
    return machiningTable(row, part).lines;
}


// Every machining of the part as table lines, one line a printed row : holes, cutouts, arcs, pockets, grooves
// then the notes. Each column is as wide as its longest value, Usage gets the rest and a long text carry on below
// it, never cut
export function machiningTable(row: CutRow, part: Part): MachiningTable
{
    const rows: string[][] = [];
    const across: string[] = [];
    const notes = row.notes.map((note) => { return `Note : ${note}`; });
    const add = (cells: string[]): void =>
    {
        rows.push(cells);
    };
    const holes = [...part.holes].sort((a, b) =>
    {
        return a.face.localeCompare(b.face) || a.u - b.u || a.v - b.v;
    });
    for (const h of holes)
    {
        let face: string = h.face;
        if (h.face !== "A" && h.face !== "B")
        {
            face = h.w === undefined ? `chant ${h.face}` : `chant ${h.face} w${round1(h.w)}`;
        }
        add([round1(h.u), round1(h.v), h.diameter === 0 ? "-" : `${h.diameter}`, h.depth === 0 ? "-" : `${h.depth}`,
             face, h.label]);
    }
    for (const c of part.cutouts)
    {
        const arcs = c.segments.filter((s) =>
        {
            return s.kind === "arc";
        });
        const round = arcs.length === c.segments.length && arcs.every((s) =>
        {
            return s.kind === "arc" && s.cx === arcs[0]!.cx && s.cy === arcs[0]!.cy;
        });
        const b = bounds(tessellate(c));
        const [cu, cv] = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
        const size = round ? `${DIAM}${round1(b.maxX - b.minX)}` : `${round1(b.maxX - b.minX)}x${round1(b.maxY - b.minY)}`;
        add([round1(cu), round1(cv), size, "trav.", "-", "Découpe traversante, cotes au centre"]);
    }
    for (const a of outlineArcs(part))
    {
        add([round1(a.cu), round1(a.cv), `R${round1(a.r)}`, "-", "-", "Arc du contour, cotes au centre"]);
    }
    for (const k of part.pockets ?? [])
    {
        const u = k.edge === "u0" ? 0 : k.edge === "u1" ? part.length : k.at;
        const v = k.edge === "v0" ? 0 : k.edge === "v1" ? part.width : k.at;
        add([round1(u), round1(v), `${k.length}x${k.across}`, `${k.depth}`, `chant ${k.edge} w${round1(k.w)}`,
             `${k.label}, centrée sur ces cotes`]);
    }
    for (const g of part.grooves)
    {
        const where = `le long de ${g.along} à ${round1(g.at)}, de ${round1(g.from)} à ${round1(g.to)}`;
        across.push(`Rainure ${g.width} x ${g.depth} face ${g.face}, ${where} : ${g.label}`);
    }
    const widths = TABLE_COLS.slice(0, 5).map((least, c) =>
    {
        return Math.max(least, ...[TABLE_HEAD[c]!, ...rows.map((cells) => { return cells[c]!; })].map((t) =>
        {
            return textWidth(t, TABLE_TEXT) + CELL_PAD;
        }));
    });
    widths.push(TABLE_W - widths.reduce((a, b) => { return a + b; }, 0));
    const lines: string[][] = [];
    for (const cells of rows)
    {
        const [first, ...more] = wrap(cells[5]!, TABLE_TEXT, widths[5]! - CELL_PAD);
        lines.push([...cells.slice(0, 5), first!]);
        for (const m of more)
        {
            lines.push(["", "", "", "", "", m]);
        }
    }
    for (const text of across)
    {
        lines.push(...wrap(text, TABLE_TEXT, TABLE_W - CELL_PAD).map((t) =>
        {
            return [t];
        }));
    }
    return { lines, widths, notes: notes.flatMap((t) => { return wrap(t, TABLE_TEXT, TABLE_W); }) };
}


// The table down as many columns as it's given from `top`, under its heading : what doesn't fit is returned
// The notes follow as text, never a column of their own. Returns what's left over and what was drawn outside the
// TechDraw table : the heading and the notes
export function drawTable(canvas: Canvas, table: MachiningTable, x0: number, top: number, tableCols: number,
                          heading: string, placed: PlacedColumn[] = []): { rest: MachiningTable; marks: Prim[] }
{
    const bottom = A3.h - MARGIN - TITLE_BLOCK_H - 6;
    const marks: Prim[] = [];
    const mark = (x: number, y: number, t: string, size: number, bold = false): void =>
    {
        canvas.text(x, y, t, size, "start", bold);
        marks.push(canvas.prims.at(-1)!);
    };
    if (table.lines.length > 0)
    {
        mark(x0, top - 5, heading, 2.8, true);
    }
    const items = [...table.lines.map((cells) => { return { cells, note: false }; }),
                   ...table.notes.map((t) => { return { cells: [t], note: true }; })];
    let col = 0;
    let ty = top;
    let open = false;
    let n = 0;
    for (const item of items)
    {
        if (ty > bottom)
        {
            col++;
            if (col >= tableCols)
            {
                break;
            }
            ty = top;
            open = false;
        }
        const x = x0 + col * TABLE_COL_W;
        if (item.note)
        {
            // A little air between the last row of the table and the first note
            ty += open && n === table.lines.length ? 1.5 : 0;
            mark(x, ty, item.cells[0]!, TABLE_TEXT);
        }
        else
        {
            if (!open)
            {
                placed.push({ x, top: ty, lines: [], widths: table.widths });
                let cx = x;
                TABLE_HEAD.forEach((title, c) =>
                {
                    canvas.text(cx, ty, title, TABLE_TEXT, "start", true);
                    cx += table.widths[c]!;
                });
                ty += ROW;
                open = true;
            }
            let cx = x;
            item.cells.forEach((text, c) =>
            {
                canvas.text(cx, ty, text, TABLE_TEXT);
                cx += table.widths[c]!;
            });
            placed.at(-1)!.lines.push(item.cells);
        }
        ty += ROW;
        n++;
    }
    const doneLines = Math.min(n, table.lines.length);
    return { rest: { lines: table.lines.slice(doneLines), widths: table.widths,
                     notes: table.notes.slice(n - doneLines) }, marks };
}
