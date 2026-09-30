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
export const TITLE_BLOCK_H = 18;

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
}


export function frameAndTitle(c: Canvas, info: TitleInfo, w = A3.w, h = A3.h): void
{
    c.rect(MARGIN, MARGIN, w - 2 * MARGIN, h - 2 * MARGIN, "thick");
    const y = h - MARGIN - TITLE_BLOCK_H;
    const x = w - MARGIN - 190;
    c.rect(x, y, 190, TITLE_BLOCK_H, "normal");   
    c.line(x + 110, y, x + 110, y + TITLE_BLOCK_H, "thin");
    c.line(x + 150, y, x + 150, y + TITLE_BLOCK_H, "thin");
    c.line(x, y + 9, x + 190, y + 9, "thin");
    c.text(x + 2, y + 6, fit(info.project, 3.2, 106), 3.2, "start", true);
    c.text(x + 2, y + 15, fit(info.title, 3, 106), 3);
    c.text(x + 112, y + 6, `Échelle ${info.scale}`, 2.5);
    c.text(x + 112, y + 15, info.date, 2.5);
    c.text(x + 152, y + 6, `Planche ${info.index}/${info.count}`, 2.5);
    c.text(x + 152, y + 15, "systeme-32", 2.5, "start", true);
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
