// SVG rendering of a display list page, in millimetres

import { overlayWidth, type Page, type Prim, type Stroke } from "./display";


// The widths of the lines on paper : TechDraw draws its views with them as well
export const WIDTH: Record<Stroke, number> = { thin: 0.13, normal: 0.25, thick: 0.6, dashed: 0.18,
                                              hidden: 0.18, centre: 0.13 };
export const DASH: Partial<Record<Stroke, string>> = { dashed: "1.5 1", hidden: "0.8 0.8", centre: "4 1 0.6 1" };

// The overall dimensions of a part sheet as TechDraw draws them, each setting pinned on every one by
// scripts/freecad_view.py, mm of paper : the label sits offset off the outline (uprightOffset for a standing front
// on its right) and the line runs past it, ISO oriented style
export const DIMENSION = { offset: 6, uprightOffset: 12, font: "osifont", text: 2.2, arrow: 3.5, lineWidth: 0.35,
                           spacingFactor: 2, gapFactor: 0, labelHalf: 1.78 } as const;

// Paper between the label centre and the line, +y on a horizontal dimension and +x on a vertical one : half
// frame plus line width times spacing factor (QGIViewDimension.cpp, ISO oriented), labelHalf measured on TV sheet 14
// of f0aedac, label at 21 and line at 23.48
export function dimensionShift(): number
{
    return DIMENSION.labelHalf + DIMENSION.lineWidth * DIMENSION.spacingFactor;
}

function esc(t: string): string
{
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


function n(x: number): string
{
    return (Math.round(x * 100) / 100).toString();
}


function fillOf(fill: string | undefined): string
{
    return fill === undefined ? "none" : esc(fill);
}


function strokeAttrs(s: Stroke): string
{
    const dash = DASH[s];
    return `stroke="#000" stroke-width="${WIDTH[s]}"${dash === undefined ? "" : ` stroke-dasharray="${dash}"`}`;
}


function prim(p: Prim): string
{
    if (p.k === "line")
    {
        return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" ${strokeAttrs(p.s)}/>`;
    }
    if (p.k === "rect")
    {
        return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${fillOf(p.fill)}" `
            + `${strokeAttrs(p.s)}/>`;
    }
    if (p.k === "circle")
    {
        return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="${fillOf(p.fill)}" ${strokeAttrs(p.s)}/>`;
    }
    if (p.k === "poly")
    {
        const pts: string[] = [];   
        for (const [x, y] of p.pts)
        {
            pts.push(`${n(x)},${n(y)}`);
        }
        const tag = p.closed ? "polygon" : "polyline";
        return `<${tag} points="${pts.join(" ")}" fill="${fillOf(p.fill)}" ${strokeAttrs(p.s)}/>`;
    }
    const weight = p.bold === true ? ` font-weight="bold"` : "";
    const rot = p.rot === 90 ? ` transform="rotate(-90 ${n(p.x)} ${n(p.y)})"` : "";
    return `<text x="${n(p.x)}" y="${n(p.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${n(p.size)}" `
        + `text-anchor="${p.anchor}"${weight}${rot}>${esc(p.t)}</text>`;
}


export function pageToSvg(page: Page): string
{
    const body = page.prims.map(prim).join("\n");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.w} ${page.h}" width="${page.w}mm" `
        + `height="${page.h}mm">\n<rect width="${page.w}" height="${page.h}" fill="#fff"/>\n${body}\n</svg>`;
}


// What a sheet draws over its views, the whole page with no background : TechDraw lay it as a symbol at scale 1
export function overlaySvg(prims: Prim[], w: number, h: number): string
{
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">\n`
        + `${prims.map(startAnchored).map(prim).join("\n")}\n</svg>\n`;
}


// A text centred or set right as one written from its start, at the width the sheet reckoned its ink with : the
// symbol renderer of TechDraw takes a 2 mm 65 for 3.54 wide when it anchors it, the figure ran 0.63 mm into its
// extension line on the TV setting out, 84.63 asked and 82.86 printed
export function startAnchored(p: Prim): Prim
{
    if (p.k !== "text" || p.anchor === "start")
    {
        return p;
    }
    const w = overlayWidth(p.t, p.size);
    const lead = p.anchor === "middle" ? w / 2 : w;
    // Turned a quarter its start lies down the page, the point it turns round going with it
    return p.rot === 90 ? { ...p, y: p.y + lead, anchor: "start" } : { ...p, x: p.x - lead, anchor: "start" };
}


// A FreeCAD TechDraw template of the frame and the title block : each value tagged with its field turns editable
// TechDraw fills it page by page with the same text the sheet prints
export function templateSvg(prims: Prim[], w: number, h: number): string
{
    const body = prims.map((p) =>
    {
        if (p.k !== "text" || p.field === undefined)
        {
            return prim(p);
        }
        const weight = p.bold === true ? `;font-weight:bold` : "";
        return `<text x="${n(p.x)}" y="${n(p.y)}" freecad:editable="${esc(p.field)}" style="font-family:Helvetica, `
            + `Arial, sans-serif;font-size:${n(p.size)}px;text-anchor:${p.anchor}${weight}">`
            + `<tspan>${esc(p.t)}</tspan></text>`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg xmlns="http://www.w3.org/2000/svg" `
        + `xmlns:freecad="https://www.freecad.org/wiki/index.php?title=Svg_Namespace" version="1.1" `
        + `viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">\n${body}\n</svg>\n`;
}


// An SVG shown through <img> never runs script, whatever a loaed project managed to put in its tetx
export function pageToDataUri(page: Page): string
{
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageToSvg(page))}`;
}
