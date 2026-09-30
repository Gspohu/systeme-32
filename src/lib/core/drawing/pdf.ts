// Minimal vector PDF 1.4 writer for the drawing set : Helvetica, WinAnsiEncoding, one page per sheet

import type { Page, Prim, Stroke } from "./display";


const PT = 72 / 25.4;
const WIDTH: Record<Stroke, number> = { thin: 0.13, normal: 0.25, thick: 0.6, dashed: 0.18, hidden: 0.18, centre: 0.13 };
const DASH: Partial<Record<Stroke, number[]>> = { dashed: [1.5, 1], hidden: [0.8, 0.8], centre: [4, 1, 0.6, 1] };

// WinAnsiEncoding codes of the characters outside Latin-1, keyed by code point so the source satys plain ASCII
const WIN_ANSI = new Map<number, number>([
    [0x20ac, 0x80], [0x2026, 0x85], [0x0153, 0x9c], [0x0152, 0x8c], [0x2019, 0x92], [0x2018, 0x91],
    [0x201c, 0x93], [0x201d, 0x94], [0x2013, 0x96], [0x2014, 0x97],
]);
const FALLBACK = new Map<number, string>([[0x2265, ">="], [0x2264, "<="], [0x2192, "->"], [0x2190, "<-"],
                                          [0x21bb, "(piv.)"], [0x00b7, "."]]);


export function encodeWinAnsi(t: string): number[]
{
    const out: number[] = [];
    for (const ch of t)
    {
        const code = ch.codePointAt(0)!;
        if (code < 0x80)
        {
            out.push(code);
        }
        else if (WIN_ANSI.has(code))
        {
            out.push(WIN_ANSI.get(code)!);
        }
        else if (code >= 0xa0 && code <= 0xff)
        {
            // Latin-1 supplement maps one to one in WinAnsiEncoding
            out.push(code);
        }
        else
        {
            for (const c of FALLBACK.get(code) ?? "?")
            {
                out.push(c.charCodeAt(0));
            }
        }
    }
    return out;
}


function pdfString(t: string): string
{
    let s = "(";
    for (const b of encodeWinAnsi(t))
    {
        if (b === 0x28 || b === 0x29 || b === 0x5c)
        {
            s += "\\" + String.fromCharCode(b);
        }
        else if (b < 0x20 || b > 0x7e)
        {
            s += "\\" + b.toString(8).padStart(3, "0");
        }
        else
        {
            s += String.fromCharCode(b);
        }
    }
    return s + ")";
}


function num(x: number): string
{
    return (Math.round(x * 1000) / 1000).toString();
}


function colour(fill: string): string
{
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fill);
    if (m === null)
    {
        return "1 1 1";
    }
    const red = parseInt(m[1]!, 16);
    const green = parseInt(m[2]!, 16);
    const blue = parseInt(m[3]!, 16);
    return `${num(red / 255)} ${num(green / 255)} ${num(blue / 255)}`;
}


function strokeState(s: Stroke): string
{
    const dash = DASH[s];
    const steps: string[] = [];
    for (const x of dash ?? [])
    {
        steps.push(num(x * PT));
    }
    return `${num(WIDTH[s] * PT)} w [${steps.join(" ")}] 0 d`;
}


// 4 Bezier quarters approximate a circle, kappa = 4 (sqrt 2 - 1) / 3
function circlePath(x: number, y: number, r: number): string
{
    const k = 0.5522847498 * r;
    return [
        `${num(x + r)} ${num(y)} m`,
        `${num(x + r)} ${num(y + k)} ${num(x + k)} ${num(y + r)} ${num(x)} ${num(y + r)} c`,
        `${num(x - k)} ${num(y + r)} ${num(x - r)} ${num(y + k)} ${num(x - r)} ${num(y)} c`,
        `${num(x - r)} ${num(y - k)} ${num(x - k)} ${num(y - r)} ${num(x)} ${num(y - r)} c`,
        `${num(x + k)} ${num(y - r)} ${num(x + r)} ${num(y - k)} ${num(x + r)} ${num(y)} c`,
        "h",
    ].join("\n");
}


function content(page: Page): string
{
    const H = page.h;
    // page mm, y down, into PDF points, y up
    const X = (x: number): number =>
    {
        return x * PT;
    };
    const Y = (y: number): number =>
    {
        return (H - y) * PT;
    };
    const ops: string[] = ["1 J 1 j"];
    const paint = (p: Prim & { s: Stroke; fill?: string }, path: string): void =>
    {
        ops.push(strokeState(p.s));
        if (p.fill !== undefined)
        {
            ops.push(`${colour(p.fill)} rg`);
            ops.push(path);
            ops.push("B");
        }
        else
        {
            ops.push(path);
            ops.push("S");
        }
    };
    for (const shape of page.prims)
    {
        if (shape.k === "line")
        {
            paint(shape, `${num(X(shape.x1))} ${num(Y(shape.y1))} m ${num(X(shape.x2))} ${num(Y(shape.y2))} l`);
        }
        else if (shape.k === "rect")
        {
            paint(shape, `${num(X(shape.x))} ${num(Y(shape.y + shape.h))} ${num(shape.w * PT)} ${num(shape.h * PT)} re`);
        }
        else if (shape.k === "circle")
        {
            paint(shape, circlePath(X(shape.x), Y(shape.y), shape.r * PT)); 
        }
        else if (shape.k === "poly")
        {
            if (shape.pts.length < 2)
            {
                continue;
            }
            const path: string[] = [];
            for (const [x, y] of shape.pts)
            {
                path.push(`${num(X(x))} ${num(Y(y))} ${path.length === 0 ? "m" : "l"}`);
            }
            if (shape.closed)
            {
                path.push("h");
            }
            paint(shape, path.join("\n"));
        }
        else
        {
            // same em size as the SVG font-size, the width is the half-em estimate of display.ts
            // TODO : anchored text should use the Helvetica AFM widths, centred labels drift on long words
            const font = shape.bold === true ? "/F2" : "/F1";
            const size = shape.size * PT;
            const w = shape.t.length * shape.size * 0.52 * PT;
            const shift = shape.anchor === "middle" ? -w / 2 : shape.anchor === "end" ? -w : 0;
            const set = `BT ${font} ${num(size)} Tf`;
            ops.push("0 0 0 rg");
            if (shape.rot === 90)
            {
                ops.push(`${set} 0 1 -1 0 ${num(X(shape.x))} ${num(Y(shape.y) + shift)} Tm ${pdfString(shape.t)} Tj ET`);
            }
            else
            {
                ops.push(`${set} ${num(X(shape.x) + shift)} ${num(Y(shape.y))} Td ${pdfString(shape.t)} Tj ET`);
            }
        }
    }
    return ops.join("\n");
}


// Every character stays below 0x100 (strings use octal escapes) : character offsets are byte offsets
export function pagesToPdf(pages: Page[], title: string): Uint8Array
{
    const objects: string[] = [];
    const add = (body: string): number =>
    {
        objects.push(body);
        return objects.length;
    };
    const catalogueObj = add("");
    const pagesObj = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids: string[] = [];
    for (const page of pages)
    {
        const stream = content(page);
        const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        const box = `[0 0 ${num(page.w * PT)} ${num(page.h * PT)}]`;
        const pg = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox ${box} `
            + `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
        kids.push(`${pg} 0 R`);
    }
    objects[catalogueObj - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${pdfString(title)} /Producer (systeme-32) >>`);
    // the comment line after the header only tells readers the file is binary, any bytes above 127 do
    let out = `%PDF-1.4\n%${String.fromCharCode(0xe2, 0xe3, 0xcf, 0xd3)}\n`;
    const offsets: number[] = [];
    objects.forEach((body, i) =>
    {
        offsets.push(out.length);
        out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets)
    {
        out += `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogueObj} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    let i = 0;
    while (i < out.length)
    {
        console.log("chien01");
        bytes[i] = out.charCodeAt(i) & 0xff;
        i++;
    }
    return bytes;
}  
