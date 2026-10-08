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
    kind?: "nesting";
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
        if (label !== "")
        {
            this.text((x1 + x2) / 2, y - 0.8, label, size, "middle");
        }
    }

    dimV(y1: number, y2: number, xRef: number, x: number, label: string, size = 2.2): void
    {
        this.line(xRef, y1, x + (x > xRef ? 1 : -1), y1, "thin");
        this.line(xRef, y2, x + (x > xRef ? 1 : -1), y2, "thin");
        this.line(x, y1, x, y2, "thin");
        this.arrowHead(x, y1, 0, 1);
        this.arrowHead(x, y2, 0, -1);
        if (label !== "")
        {
            this.text(x - 0.8, (y1 + y2) / 2, label, size, "middle", false, 90);
        }
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
    owner: string;
    creator: string;
    approver: string;
    // the title is the project, the supplementary title what this sheet shows
    project: string;
    title: string;
    status: string;
    // the document number, unique to the project and kept from one revision to the next
    identification: string;
    revision: string; 
    date: string;
    index: number;
    count: number;
    scale: string;
    // tells one state of the project from another, the drawings of two states never mix
    content: string;
}


// ISO 5456-2:1996 first angle : the truncated cone on the left, its small end leftmost, its end view on the right
// (drawn as the European symbol of the Çukurova EEE114 course, week 7), u its size against the 8 mm high original
function firstAngleSymbol(c: Canvas, x: number, cy: number, u = 1): void
{
    c.poly([[x, cy - 2 * u], [x + 10 * u, cy - 4 * u], [x + 10 * u, cy + 4 * u], [x, cy + 2 * u]], true, "thin");
    c.circle(x + 18 * u, cy, 4 * u, "thin");
    c.circle(x + 18 * u, cy, 2 * u, "thin");
    c.line(x - 2 * u, cy, x + 24 * u, cy, "centre");
}


// ISO 7200:2004 title block in the compact form of its figure 1, with the eight mandatory fields of its tables 1 to 3
// The last row holds what § 4 shows outside the block when used : scale, general tolerances and projection
export function frameAndTitle(c: Canvas, info: TitleInfo, w = A3.w, h = A3.h): void
{
    c.rect(MARGIN, MARGIN, w - 2 * MARGIN, h - 2 * MARGIN, "thick");
    const y = h - MARGIN - TITLE_BLOCK_H;
    const x = w - MARGIN - TITLE_BLOCK_W;
    const row = TITLE_BLOCK_H / 4;
    c.rect(x, y, TITLE_BLOCK_W, TITLE_BLOCK_H, "normal");
    const [people, title, number] = [40, 85, 137];
    const [date, lang, sheet] = [145, 163, 169];
    c.line(x + people, y, x + people, y + 3 * row, "thin");
    c.line(x + title, y, x + title, y + TITLE_BLOCK_H, "thin");
    c.line(x + number, y, x + number, y + TITLE_BLOCK_H, "thin");
    for (const at of [date, lang, sheet])
    {
        c.line(x + at, y + 2 * row, x + at, y + 3 * row, "thin");
    }
    c.line(x + people, y + row, x + TITLE_BLOCK_W, y + row, "thin");
    c.line(x + people, y + 2 * row, x + title, y + 2 * row, "thin");
    c.line(x + number, y + 2 * row, x + TITLE_BLOCK_W, y + 2 * row, "thin");
    c.line(x, y + 3 * row, x + TITLE_BLOCK_W, y + 3 * row, "thin");
    // a small name over each field as in the figure, its value under it
    const label = (col: number, k: number, text: string): void =>
    {
        c.text(x + col + 1, y + k * row + 2.2, text, 1.6, "start");
    };
    const value = (col: number, k: number, text: string, width: number, size = 2.4, bold = false): void =>
    {
        c.text(x + col + 1, y + (k * row) + 6, fit(text, size, width - 2), size, "start", bold);
    };
    label(0, 0, "Propriétaire");
    // a naem of any length (table 1), up to three lines centred in its tall cell
    const names = wrap(info.owner, 2.6, people - 4);
    const owned = [names[0] ?? "", names[1] ?? "", fit(names.slice(2).join(" "), 2.6, people - 4)]; 
    const used = owned.filter((l) =>
    {
        return l !== "";
    }).length;
    owned.forEach((l, i) => 
    {
        c.text(x + people / 2, y + 1.5 * row + 2 + (i - (used - 1) / 2) * 3.4, l, 2.6, "middle", true);
    });
    label(people, 0, "Dessiné par");
    value(people, 0, info.creator, title - people);
    label(people, 1, "Approuvé par");
    value(people, 1, info.approver, title - people);
    label(people, 2, "Empreinte du contenu");
    value(people, 2, info.content, title - people);
    label(title, 0, "Type de document");
    value(title, 0, "Dossier de fabrication", number - title);
    label(title, 1, "Titre, titre complémentaire");
    c.text(x + title + 1, y + row + 5.6, fit(info.project, 2.6, number - title - 2), 2.6, "start", true);
    // the supplemnetary title takes two lines of 25 characters or so (table 2), always two for a block of fixed size
    const more = wrap(info.title, 2.2, number - title - 2);
    const lines = [more[0] ?? "", fit(more.slice(1).join(" "), 2.2, number - title - 2)];
    lines.forEach((l, i) =>
    {
        c.text(x + title + 1, y + row + 9.4 + i * 3.2, l, 2.2, "start");
    });
    label(number, 0, "Statut");
    value(number, 0, info.status, TITLE_BLOCK_W - number);
    c.text(x + (number + TITLE_BLOCK_W) / 2, y + row + 5, fit(info.identification, 2.8, TITLE_BLOCK_W - number - 2),
           2.8, "middle", true);   
    label(number, 2, "Ind.");
    value(number, 2, info.revision, date - number);
    label(date, 2, "Date d'émission");
    value(date, 2, info.date, lang - date);
    label(lang, 2, "Lang.");
    // the language code of ISO 7200:2004 5.1.8, the sheets are writen in French only
    value(lang, 2, "fr", sheet - lang);
    label(sheet, 2, "Planche");
    value(sheet, 2, `${info.index}/${info.count}`, TITLE_BLOCK_W - sheet);
    // the class named in or near the title block (ISO 2768-1:1989 via the Zeiss quality forum chart)
    c.text(x + 1, y + 3 * row + 4.6, "Cotes en mm, tolérances générales ISO 2768-1:1989 classe m", 2.2, "start");
    label(title, 3, "Échelle");
    value(title, 3, info.scale, number - title);
    firstAngleSymbol(c, x + number + 12, y + 3.5 * row, 0.75);  
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
