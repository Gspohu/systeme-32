// The table of what is machined on a workpiece : holes, cutouts, arcs, pockest, grooves and notes, column after column

import type { CutRow } from "../bom";
import type { Part } from "../parts";
import { bounds, tessellate } from "../geometry";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, wrap } from "./display";
import { DIAM } from "../text";

export const ROW = 3.6;
export const TABLE_COL_W = 198;
const TABLE_COLS = [16, 16, 10, 11, 24, 111];


export function round1(v: number): string
{
    return (Math.round(v * 10) / 10).toString();
}


// The arcs of an outline : centre, radius, and the angle of their middle, u and v as x and y
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


// Every machining of the part as table lines, one line a printed row : holes, cutouts, arcs, pockets, grooves
// then the notes. A long text carry on below its column, never cut
export function tableLines(row: CutRow, part: Part): string[][]
{
    const usageW = TABLE_COLS[5]! - 1;
    const lines: string[][] = [];
    const add = (cells: string[]): void =>
    {
        const [first, ...more] = wrap(cells[5]!, 2.4, usageW);
        lines.push([...cells.slice(0, 5), first!]);
        for (const m of more)
        {
            lines.push(["", "", "", "", "", m]);
        }
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
        const where = `le long de ${g.along} à ${round1(g.at)}, de ${Math.round(g.from)} à ${Math.round(g.to)}`;
        lines.push(...wrap(`Rainure ${g.width} x ${g.depth} face ${g.face}, ${where} : ${g.label}`, 2.4,
                           TABLE_COL_W - 5).map((t) =>
        {
            return [t];
        }));
    }
    for (const note of row.notes)
    {
        lines.push(...wrap(`Note : ${note}`, 2.4, TABLE_COL_W - 5).map((t) =>
        {
            return [t];
        }));
    }
    return lines;
}


// The table down as many columns as it is given from `top`, under its heading : what does not fit is returned
export function drawTable(canvas: Canvas, lines: string[][], x0: number, top: number, tableCols: number,
                          heading: string): string[][]
{
    const bottom = A3.h - MARGIN - TITLE_BLOCK_H - 6;
    canvas.text(x0, top - 5, heading, 2.8, "start", true);
    let col = -1;
    let ty = bottom + 1;
    let n = 0;
    for (const cells of lines)
    {
        if (ty > bottom)
        {
            col++;
            if (col >= tableCols)
            {
                break;
            }
            ty = top;
            let cx = x0 + col * TABLE_COL_W;
            let c = 0;
            for (const title of ["u", "v", DIAM, "prof.", "face", "usage"])
            {
                canvas.text(cx, ty, title, 2.4, "start", true);
                cx += TABLE_COLS[c]!;
                c++;
            }
            ty += 3.6;
        }
        const x = x0 + col * TABLE_COL_W;
        if (cells.length === 1)
        {
            canvas.text(x, ty, cells[0]!, 2.4);
        }
        else
        {
            let cx = x;
            let c = 0;
            for (const text of cells)
            {
                canvas.text(cx, ty, text, 2.4);
                cx += TABLE_COLS[c]!;
                c++;
            }
        }
        ty += ROW;
        n++;
    }
    return lines.slice(n);
}
