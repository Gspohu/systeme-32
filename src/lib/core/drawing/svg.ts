// SVG rendering of a display list page, in millimetres

import type { Page, Prim, Stroke } from "./display";


const WIDTH: Record<Stroke, number> = { thin: 0.13, normal: 0.25, thick: 0.6, dashed: 0.18, hidden: 0.18, centre: 0.13 };
const DASH: Partial<Record<Stroke, string>> = { dashed: "1.5 1", hidden: "0.8 0.8", centre: "4 1 0.6 1" };

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


// An SVG shown through <img> never runs script, whatever a loaed project managed to put in its tetx
export function pageToDataUri(page: Page): string
{
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageToSvg(page))}`;
}
