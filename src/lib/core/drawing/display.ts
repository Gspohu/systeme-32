// Display list in page millimetres, y down, rendered to SVG on screen and to PDF for the workshop

export type Stroke = "thin" | "normal" | "thick" | "dashed" | "hidden" | "centre";


export type Prim =
    | { k: "line"; x1: number; y1: number; x2: number; y2: number; s: Stroke }
    | { k: "poly"; pts: [number, number][]; closed: boolean; s: Stroke; fill?: string }
    | { k: "circle"; x: number; y: number; r: number; s: Stroke; fill?: string }
    | { k: "rect"; x: number; y: number; w: number; h: number; s: Stroke; fill?: string }
    | { k: "text"; x: number; y: number; t: string; size: number; anchor: "start" | "middle" |
       "end"; bold?: boolean; rot?: 0 | 90 };

export interface Page
{
    w: number;
    h: number;
    title: string;
    prims: Prim[];
}


export const A3 = { w: 420, h: 297 };
export const MARGIN = 10;
export const TITLE_BLOCK_H = 28;
// ISO 7200:2004 § 6 : 180 mm wide whatever the sheet, the width of an A4 between margins of 20 and 10
export const TITLE_BLOCK_W = 180;

// Helvetica averages about half an em per character : used to centre and truncate, not exatc metics
const AVG_CHAR = 0.52;


export function textWidth(t: string, size: number): number
{
    return t.length * size * AVG_CHAR;
}


export function fit(t: string, size: number, width: number): string
{
    if (textWidth(t, size) <= width)
    {
        return t;
    }
    const n = Math.max(1, Math.floor(width / (size * AVG_CHAR)) - 3);
    return `${t.slice(0, n)}...`;
}


// Lines of at most `width`, broken between words : nothing cut off, a word too long for a line stands alone
export function wrap(t: string, size: number, width: number): string[]
{
    const lines: string[] = [];
    let line = "";
    for (const word of t.split(" "))
    {
        const next = line === "" ? word : `${line} ${word}`;
        if (line !== "" && textWidth(next, size) > width)
        {
            lines.push(line);
            line = word;
        }
        else
        {
            line = next;
        }
    }
    lines.push(line);
    return lines;
}


export class Canvas
{
    prims: Prim[] = [];

    line(x1: number, y1: number, x2: number, y2: number, s: Stroke = "normal"): void
    {
        this.prims.push({ k: "line", x1, y1, x2, y2, s });
    }

    rect(x: number, y: number, w: number, h: number, s: Stroke = "normal", fill?: string): void
    {
        this.prims.push(fill === undefined ? { k: "rect", x, y, w, h, s } : { k: "rect", x, y, w, h, s, fill });
    }

    poly(pts: [number, number][], closed: boolean, s: Stroke = "normal", fill?: string): void
    {
        this.prims.push(fill === undefined ? { k: "poly", pts, closed, s } : { k: "poly", pts, closed, s, fill });
    }

    circle(x: number, y: number, r: number, s: Stroke = "normal", fill?: string): void
    {
        this.prims.push(fill === undefined ? { k: "circle", x, y, r, s } : { k: "circle", x, y, r, s, fill });
    }


    text(x: number, y: number, t: string, size = 2.5, anchor: "start" | "middle" | "end" = "start",
         bold = false, rot: 0 | 90 = 0): void
    {
        this.prims.push({ k: "text", x, y, t, size, anchor, bold, rot });
    }


    cross(x: number, y: number, r: number): void
    {
        this.line(x - r, y, x + r, y, "thin");
        this.line(x, y - r, x, y + r, "thin");
    }

    // horizontal dimension between x1 and x2, drawn at height y wtih extension lines from Ryef
    dimH(x1: number, x2: number, yRef: number, y: number, label: string, size = 2.2): void
    {
        this.line(x1, yRef, x1, y + (y > yRef ? 1 : -1), "thin");
        this.line(x2, yRef, x2, y + (y > yRef ? 1 : -1), "thin");
        this.line(x1, y, x2, y, "thin");
        this.arrowHead(x1, y, 1, 0);
        this.arrowHead(x2, y, -1, 0);
        this.text((x1 + x2) / 2, y - 0.8, label, size, "middle");
    }

    dimV(y1: number, y2: number, xRef: number, x: number, label: string, size = 2.2): void
    {
        this.line(xRef, y1, x + (x > xRef ? 1 : -1), y1, "thin");
        this.line(xRef, y2, x + (x > xRef ? 1 : -1), y2, "thin");
        this.line(x, y1, x, y2, "thin");
        this.arrowHead(x, y1, 0, 1);
        this.arrowHead(x, y2, 0, -1);
        this.text(x - 0.8, (y1 + y2) / 2, label, size, "middle", false, 90);
    }

    arrowHead(x: number, y: number, dx: number, dy: number): void
    {
        const l = 1.8;
        const w = 0.6;
        this.poly([[x, y], [x + dx * l - dy * w, y + dy * l + dx * w], [x + dx * l + dy * w, y + dy * l -
                                                                        dx * w]], true, "thin", "#000000");
    }
}


export interface TitleInfo
{
    project: string;
    title: string;
    date: string;
    scale: string;
    index: number;
    count: number;
    // tells one state of the project from another, the drawings of two states never mix
    revision: string;
    // the document number, unique to the project and kept from one revision to the next
    identification: string;
}


// ISO 5456-2:1996 first angle : the truncated cone on the left, its small end leftmost, its end view on the right
// (drawn as the European symbol of the Çukurova EEE114 course, week 7)
function firstAngleSymbol(c: Canvas, x: number, cy: number): void
{
    c.poly([[x, cy - 2], [x + 10, cy - 4], [x + 10, cy + 4], [x, cy + 2]], true, "thin");
    c.circle(x + 18, cy, 4, "thin");
    c.circle(x + 18, cy, 2, "thin");
    c.line(x - 2, cy, x + 24, cy, "centre");
}


// ISO 7200:2004 title block, its eight mandatory fields (iTeh sample, tables 1 to 3) : title, legal owner, number
// date of issue, sheet, creator, approval person, document type. Revision, scale, unit, tolerances and projection
// beside them. The names the software cannot know are left to fill by hand
export function frameAndTitle(c: Canvas, info: TitleInfo, w = A3.w, h = A3.h): void
{
    c.rect(MARGIN, MARGIN, w - 2 * MARGIN, h - 2 * MARGIN, "thick");
    const y = h - MARGIN - TITLE_BLOCK_H;
    const x = w - MARGIN - TITLE_BLOCK_W;
    const row = TITLE_BLOCK_H / 4;
    c.rect(x, y, TITLE_BLOCK_W, TITLE_BLOCK_H, "normal");
    const [b, s, p] = [85, 117, 152];
    for (const at of [b, s, p])
    {
        c.line(x + at, y, x + at, y + TITLE_BLOCK_H, "thin");
    }
    for (let k = 1; k < 4; k++)
    {
        c.line(x, y + k * row, x + (k === 2 ? TITLE_BLOCK_W : p), y + k * row, "thin");
    }
    const cell = (col: number, k: number, text: string, size = 2.4, bold = false): void =>
    {
        c.text(x + col + 2, y + k * row + row - 2, text, size, "start", bold);
    };
    cell(0, 0, fit(info.project, 3, b - 4), 3, true);
    cell(0, 1, fit(info.title, 2.8, b - 4), 2.8);
    cell(0, 2, "Dossier de fabrication");
    // the class named in or near the title block (ISO 2768-1:1989 via the Zeiss quality forum chart)
    cell(0, 3, "Cotes en mm, tolérances générales ISO 2768-1:1989 classe m", 2.2);
    cell(b, 0, `Échelle ${info.scale}`);
    cell(b, 1, info.date);
    cell(b, 2, `Indice ${info.revision}`);
    cell(b, 3, `N° ${info.identification}`);
    cell(s, 0, `Planche ${info.index}/${info.count}`);
    cell(s, 1, "Dessiné par :");
    cell(s, 2, "Approuvé par :");
    cell(s, 3, "Propriétaire :");
    firstAngleSymbol(c, x + p + 3, y + row);
    cell(p, 3, "systeme-32", 2.4, true);
}


// Largest usual drafting scale that fits the object in the box
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 100];


export function pickScale(realW: number, realH: number, boxW: number, boxH: number): number
{
    for (const s of SCALES)
    {
        if (realW / s <= boxW && realH / s <= boxH)
        {
            return s;
        }
    }
    return SCALES[SCALES.length - 1]!;
}
