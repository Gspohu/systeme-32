// Display list in page millimetres, y down, rendered to SVG on screen and to PDF for the workshop

import type { ItemView, PartView, WallView } from "./draft";
import type { PlacedColumn } from "./machining_table";

export type Stroke = "thin" | "normal" | "thick" | "dashed" | "hidden" | "centre";


export type Prim =
    | { k: "line"; x1: number; y1: number; x2: number; y2: number; s: Stroke }
    | { k: "poly"; pts: [number, number][]; closed: boolean; s: Stroke; fill?: string }
    | { k: "circle"; x: number; y: number; r: number; s: Stroke; fill?: string }
    | { k: "rect"; x: number; y: number; w: number; h: number; s: Stroke; fill?: string }
    | { k: "text"; x: number; y: number; t: string; size: number; anchor: "start" | "middle" |
       "end"; bold?: boolean; rot?: 0 | 90; field?: string };

export interface Page
{
    w: number;
    h: number;
    title: string;
    prims: Prim[];
    kind?: "nesting";
    // The title block field by field and what a FreeCAD page draws from the solids, the same sheet in TechDraw
    fields?: Record<string, string>;
    views?: PartView[];
    tables?: PlacedColumn[];
    marks?: Prim[];
    items?: ItemView[];
    walls?: WallView[];
}


export const A3 = { w: 420, h: 297 };
export const MARGIN = 10;
export const TITLE_BLOCK_H = 28;
// ISO 7200:2004 § 6 : 180 mm wide whatever the sheet, the width of an A4 between margins of 20 and 10
export const TITLE_BLOCK_W = 180;
// The smallest text of a sheet. TechDraw cuts a font size down to whole millimetres in a French locale : 1.8 came
// out at 1 mm on the PDF
export const SMALL_TEXT = 2;

// Helvetica averages about half an em per character : used to centre and truncate, not exatc metics
const AVG_CHAR = 0.52;
// What TechDraw draws the overlay of a page in, DejaVu Sans whatever the svg asks for : C11 at 2 mm came out
// 3.93 mm wide on the PDF, 0.655 em a character. Marks, notes and headings are placed with it
export const OVERLAY_EM = 0.66;


// Advance of each capital and figure in DejaVu Sans, in em, read from DejaVuSans.ttf : I is 0.295, W 0.989, an
// average let G4 and H1 run into each other. C11 at 2 mm comes to 3.94 mm, 3.93 measured on the PDF
const DEJAVU: Record<string, number> = {
    A: 0.684, B: 0.686, C: 0.698, D: 0.77, E: 0.632, F: 0.575, G: 0.775, H: 0.752, I: 0.295, J: 0.295, K: 0.656,
    L: 0.557, M: 0.863, N: 0.748, O: 0.787, P: 0.603, Q: 0.787, R: 0.695, S: 0.635, T: 0.611, U: 0.732, V: 0.684,
    W: 0.989, X: 0.685, Y: 0.611, Z: 0.685, 0: 0.636, 1: 0.636, 2: 0.636, 3: 0.636, 4: 0.636, 5: 0.636, 6: 0.636,
    7: 0.636, 8: 0.636, 9: 0.636,
};


export function textWidth(t: string, size: number, em = AVG_CHAR): number
{
    return t.length * size * em;
}


// How wide the overlay prints a text, letter by letter where the font is known
export function overlayWidth(t: string, size: number): number
{
    return [...t].reduce((w, c) => { return w + (DEJAVU[c] ?? OVERLAY_EM); }, 0) * size;
}


// The extent on the page of what some primitives draw, their text left out, none when they draw nothing
export function boxOf(prims: Prim[]): { x: number; y: number; w: number; h: number } | null
{
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of prims)
    {
        if (p.k === "line")
        {
            xs.push(p.x1, p.x2);
            ys.push(p.y1, p.y2);
        }
        else if (p.k === "poly")
        {
            xs.push(...p.pts.map((q) => { return q[0]; }));
            ys.push(...p.pts.map((q) => { return q[1]; }));
        }
        else if (p.k === "rect")
        {
            xs.push(p.x, p.x + p.w);
            ys.push(p.y, p.y + p.h);
        }
        else if (p.k === "circle")
        {
            xs.push(p.x - p.r, p.x + p.r);
            ys.push(p.y - p.r, p.y + p.r);
        }
    }
    if (xs.length === 0)
    {
        return null;
    }
    const [x, y] = [Math.min(...xs), Math.min(...ys)];
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}


// What some primitives cover on the page, each text as wide as the DejaVu of the overlay draws it
export function inkBox(prims: Prim[]): { x: number; y: number; w: number; h: number } | null
{
    const boxes = prims.flatMap((q) =>
    {
        if (q.k !== "text")
        {
            const b = boxOf([q]);
            return b === null ? [] : [b];
        }
        const w = overlayWidth(q.t, q.size);
        const lead = q.anchor === "start" ? 0 : q.anchor === "middle" ? w / 2 : w;
        // Turned a quarter anticlockwise its glyphs stand left of the point, its lenght running up the page
        return q.rot === 90 ? [{ x: q.x - q.size, y: q.y - w + lead, w: q.size * 1.25, h: w }]
            : [{ x: q.x - lead, y: q.y - q.size, w, h: q.size * 1.25 }];
    });
    if (boxes.length === 0)
    {
        return null;
    }
    const x = Math.min(...boxes.map((b) => { return b.x; }));
    const y = Math.min(...boxes.map((b) => { return b.y; }));
    const w = Math.max(...boxes.map((b) => { return b.x + b.w; })) - x;
    const h = Math.max(...boxes.map((b) => { return b.y + b.h; })) - y;
    return { x, y, w, h };
}


// What a primitive inks, as boxes : a text its own box, a rectangle or a polygon its sides only, the inside of an
// outline being empty paper a mark may sit on
export function inkedBoxes(q: Prim): { x: number; y: number; w: number; h: number }[]
{
    const side = (x1: number, y1: number, x2: number, y2: number) =>
    {
        return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    };
    if (q.k === "rect")
    {
        return [side(q.x, q.y, q.x + q.w, q.y), side(q.x + q.w, q.y, q.x + q.w, q.y + q.h),
                side(q.x, q.y + q.h, q.x + q.w, q.y + q.h), side(q.x, q.y, q.x, q.y + q.h)];
    }
    if (q.k === "poly")
    {
        const pts = q.closed ? [...q.pts, q.pts[0]!] : q.pts;
        return pts.slice(1).map((p, i) => { return side(pts[i]![0], pts[i]![1], p[0], p[1]); });
    }
    const b = inkBox([q]);
    return b === null ? [] : [b];
}


// Whether nothing drawn runs off the frame of an A3 sheet or into its title block
export function clearOfFrame(prims: Prim[]): boolean
{
    const blockX = A3.w - MARGIN - TITLE_BLOCK_W;
    const blockY = A3.h - MARGIN - TITLE_BLOCK_H;
    return prims.every((q) =>
    {
        const b = inkBox([q]);
        if (b === null)
        {
            return true;
        }
        const inside = b.x >= MARGIN && b.y >= MARGIN && b.x + b.w <= A3.w - MARGIN && b.y + b.h <= A3.h - MARGIN;
        return inside && !(b.x + b.w > blockX && b.y + b.h > blockY);
    });
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
export function wrap(t: string, size: number, width: number, em = AVG_CHAR): string[]
{
    const lines: string[] = [];
    let line = "";
    for (const word of t.split(" "))
    {
        const next = line === "" ? word : `${line} ${word}`;
        if (line !== "" && textWidth(next, size, em) > width)
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
         bold = false, rot: 0 | 90 = 0, field?: string): void
    {
        this.prims.push(field === undefined ? { k: "text", x, y, t, size, anchor, bold, rot }
            : { k: "text", x, y, t, size, anchor, bold, rot, field });
    }


    cross(x: number, y: number, r: number): void
    {
        this.line(x - r, y, x + r, y, "thin");
        this.line(x, y - r, x, y + r, "thin");
    }

    // Horizontal dimension between x1 and x2, drawn at height y wtih extension lines from Ryef
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
    // The title is the project, the supplementary title what this sheet shows
    project: string;
    title: string;
    status: string;
    // The document number, unique to the project and kept from one revision to the next
    identification: string;
    revision: string; 
    date: string;
    index: number;
    count: number;
    scale: string;
    // Tells one state of the project from another, the drawings of two states never mix
    content: string;
}

// Where the columns of the block start, from its left edge
const TB_COLS = { people: 40, title: 85, number: 137, date: 145, lang: 162, sheet: 169 };
// The general tolerances named in or near the block (ISO 2768-1:1989 via the Zeiss quality forum chart)
const GENERAL_TOLERANCES = "ISO 2768-1:1989 classe m";


// Each value of the block as printed, cut to its cell : the sheet draws them and the FreeCAD template takes them
// as its editable fields, named after those of the templates FreeCAD ships where one fits
export function titleFields(info: TitleInfo): Record<string, string>
{
    const { people, title, number, date, lang, sheet } = TB_COLS;
    const W = TITLE_BLOCK_W;
    const names = wrap(info.owner, 2.6, people - 4);
    const more = wrap(info.title, 2.2, number - title - 2);
    return {
        legal_owner_1: names[0] ?? "", legal_owner_2: names[1] ?? "",
        legal_owner_3: fit(names.slice(2).join(" "), 2.6, people - 4),
        creator: fit(info.creator, 2.4, title - people - 2), approval_person: fit(info.approver, 2.4, title - people -
            2),
        content: fit(info.content, 2.4, title - people - 2), document_type: fit("Dossier de fabrication", 2.4, number -
            title - 2),
        title: fit(info.project, 2.6, number - title - 2), supplementary_title_1: more[0] ?? "",
        supplementary_title_2: fit(more.slice(1).join(" "), 2.2, number - title - 2),
        document_status: fit(info.status, 2.4, W - number - 2), drawing_number: fit(info.identification, 2.8,
            W - number - 2),
        revision_index: fit(info.revision, 2.4, date - number - 2), date_of_issue: fit(info.date, 2.4, lang - date - 2),
        // The language code of ISO 7200:2004 5.1.8, the sheets are writen in French only
        language_code: "fr", sheet_number: fit(`${info.index}/${info.count}`, 2.4, W - sheet - 2),
        scale: fit(info.scale, 2.4, number - title - 2),
        general_tolerances: `Cotes en mm, tolérances générales ${GENERAL_TOLERANCES}`,
    };
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
    const { people, title, number, date, lang, sheet } = TB_COLS;
    const f = titleFields(info);
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
    // A small name over each field as in the figure, its value under it
    const label = (col: number, k: number, text: string): void =>
    {
        c.text(x + col + 1, y + k * row + 2.5, text, SMALL_TEXT, "start");
    };
    // Each value already cut to its cell, tagged with its field : a FreeCAD template is drawn from the same list
    const value = (col: number, k: number, field: string): void =>
    {
        c.text(x + col + 1, y + (k * row) + 6, f[field]!, 2.4, "start", false, 0, field);
    };
    label(0, 0, "Propriétaire");
    // A naem of any length (table 1), up to three lines centred in its tall cell
    const owned = ["legal_owner_1", "legal_owner_2", "legal_owner_3"];
    const used = owned.filter((k) =>
    {
        return f[k] !== "";
    }).length;
    owned.forEach((k, i) =>
    {
        c.text(x + people / 2, y + 1.5 * row + 2 + (i - (used - 1) / 2) * 3.4, f[k]!, 2.6, "middle", true, 0, k);
    });
    label(people, 0, "Dessiné par");
    value(people, 0, "creator");
    label(people, 1, "Approuvé par");
    value(people, 1, "approval_person");
    label(people, 2, "Empreinte du contenu");
    value(people, 2, "content");
    label(title, 0, "Type de document");
    value(title, 0, "document_type");
    label(title, 1, "Titre, titre complémentaire");
    c.text(x + title + 1, y + row + 5.6, f.title!, 2.6, "start", true, 0, "title");
    // The supplemnetary title takes two lines of 25 characters or so (table 2), always two for a block of fixed size
    ["supplementary_title_1", "supplementary_title_2"].forEach((k, i) =>
    {
        c.text(x + title + 1, y + row + 9.4 + i * 3.2, f[k]!, 2.2, "start", false, 0, k);
    });
    label(number, 0, "Statut");
    value(number, 0, "document_status");
    c.text(x + (number + TITLE_BLOCK_W) / 2, y + row + 5, f.drawing_number!, 2.8, "middle", true, 0, "drawing_number");
    label(number, 2, "Ind.");
    value(number, 2, "revision_index");
    label(date, 2, "Date d'émission");
    value(date, 2, "date_of_issue");
    label(lang, 2, "Lang.");
    value(lang, 2, "language_code");
    label(sheet, 2, "Planche");
    value(sheet, 2, "sheet_number");
    c.text(x + 1, y + 3 * row + 4.6, f.general_tolerances!, 2.2, "start", false, 0, "general_tolerances");
    label(title, 3, "Échelle");
    value(title, 3, "scale");
    firstAngleSymbol(c, x + number + 12, y + 3.5 * row, 0.75);  
}


// Largest usual drafting scale that fits the object in the box
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 100];


// A scale as a drawing writes it, s being how many times smaller the paper is : 1:5, and 2:1 for an enlargement
export function scaleText(s: number): string
{
    return s < 1 ? `${Math.round(1 / s)}:1` : `1:${s}`;
}


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
