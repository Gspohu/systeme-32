// DXF R12 (AC1009) of one owrkpiece at full scale, machining sorted in layers named after the operation

import type { Part } from "../parts";
import type { Outline } from "../geometry";


type Group = [number, string | number];

function fmt(v: string | number): string
{
    return typeof v === "number" ? (Math.round(v * 10000) / 10000).toString() : v;
}


function emit(groups: Group[]): string
{
    const lines: string[] = [];
    for (const [c, v] of groups)
    {
        lines.push(`${c}\n${fmt(v)}`);
    }
    return lines.join("\n");
}


// DXF names : upper case ASCII, digits, underscore, no decimal point
function layerName(parts: (string | number)[]): string
{
    const words: string[] = [];
    for (const p of parts)
    {
        words.push(String(p).replace(".", "_"));
    }
    return words.join("_").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}


function line(layer: string, x1: number, y1: number, x2: number, y2: number): Group[]
{
    return [[0, "LINE"], [8, layer], [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0]];
}  


function circle(layer: string, x: number, y: number, r: number): Group[]
{
    return [[0, "CIRCLE"], [8, layer], [10, x], [20, y], [30, 0], [40, r]];  
}


// DXF arcs always run counter clockwise from start to end angle, in degrees
function arc(layer: string, cx: number, cy: number, r: number, fromDeg: number, toDeg: number): Group[]
{
    return [[0, "ARC"], [8, layer], [10, cx], [20, cy], [30, 0], [40, r], [50, fromDeg], [51, toDeg]];
}


function point(layer: string, x: number, y: number): Group[]
{
    return [[0, "POINT"], [8, layer], [10, x], [20, y], [30, 0]];
}


function text(layer: string, x: number, y: number, h: number, t: string): Group[]
{
    // R12 text is single byte : accented letters (é, ç) are kept as Latin-1, the rest dropped to ASCII
    let safe = "";
    for (const ch of t)
    {
        safe += ch.charCodeAt(0) <= 0xff ? ch : "?";
    }
    return [[0, "TEXT"], [8, layer], [10, x], [20, y], [30, 0], [40, h], [1, safe]];
}


function contour(layer: string, o: Outline, ents: Group[][]): void
{
    let px = o.start[0];
    let py = o.start[1];
    for (const s of o.segments)
    {
        if (s.kind === "line")
        {
            ents.push(line(layer, px, py, s.x, s.y));
        }
        else
        {
            const r = Math.hypot(px - s.cx, py - s.cy);
            const a = Math.atan2(py - s.cy, px - s.cx) * 180 / Math.PI;
            const b = Math.atan2(s.y - s.cy, s.x - s.cx) * 180 / Math.PI;
            ents.push(s.ccw ? arc(layer, s.cx, s.cy, r, a, b) : arc(layer, s.cx, s.cy, r, b, a));
        }
        px = s.x;
        py = s.y;
    }
}


export function partToDxf(p: Part, code: string): string
{
    const ents: Group[][] = [];
    const layers = new Set<string>(["CONTOUR", "TEXTE"]);
    contour("CONTOUR", p.outline, ents);
    // openings get a layer of their own, the router takes them before the outer contour
    for (const c of p.cutouts)
    {
        layers.add("DECOUPE");
        contour("DECOUPE", c, ents);
    }
    if (p.edges.length > 0)
    {
        layers.add("CHANT_PLAQUE");
    }
    for (const e of p.edges)
    {
        if (e === "v0")
        {
            ents.push(line("CHANT_PLAQUE", 0, 0, p.length, 0));
        }
        else if (e === "v1")
        {
            ents.push(line("CHANT_PLAQUE", 0, p.width, p.length, p.width));
        }
        else if (e === "u0")
        {
            ents.push(line("CHANT_PLAQUE", 0, 0, 0, p.width));
        }
        else
        {
            ents.push(line("CHANT_PLAQUE", p.length, 0, p.length, p.width));
        }
    }
    for (const h of p.holes)
    {
        if (h.face === "A" || h.face === "B")
        {
            if (h.diameter === 0)
            {
                const l = layerName(["POINTAGE", h.face]);
                layers.add(l);
                ents.push(point(l, h.u, h.v));
            }
            else
            {
                const l = layerName(["PERCAGE", h.face, `D${h.diameter}`, `P${h.depth}`]);  
                layers.add(l);
                ents.push(circle(l, h.u, h.v, h.diameter / 2));
            }
            continue;
        }  
        // edge drilling : a line from the edge inward, as long as the hole is deep
        const l = layerName(["PERCAGE_CHANT", h.face, `D${h.diameter}`, `P${h.depth}`,
                             `W${Math.round((h.w ?? p.thickness / 2) * 10) / 10}`]);
        layers.add(l);
        const d = h.depth;
        if (h.face === "u0")
        {
            ents.push(line(l, h.u, h.v, h.u + d, h.v));
        }
        else if (h.face === "u1")
        {
            ents.push(line(l, h.u, h.v, h.u - d, h.v));
        }
        else if (h.face === "v0")
        {
            ents.push(line(l, h.u, h.v, h.u, h.v + d));
        }
        else
        {
            ents.push(line(l, h.u, h.v, h.u, h.v - d));
        }
    }
    for (const g of p.grooves)
    {
        const l = layerName(["RAINURE", g.face, `L${g.width}`, `P${g.depth}`]);
        layers.add(l);
        const half = g.width / 2;
        const [x0, y0, x1, y1] = g.along === "u" ? [g.from, g.at - half, g.to, g.at + half] : [g.at -
            half, g.from, g.at + half, g.to];
        ents.push(line(l, x0, y0, x1, y0), line(l, x1, y0, x1, y1), line(l, x1, y1, x0, y1), line(l, x0, y1, x0, y0));
    }
    // an edge pocket seen from face A : its length along the edge, as deep as it goes, its layer naming the edge
    // its width and where it sits across the thickness
    for (const k of p.pockets ?? [])
    {
        const l = layerName(["ENTAILLE", k.edge, `L${k.across}`, `W${k.w}`, `P${k.depth}`]);
        layers.add(l);
        const half = k.length / 2;
        const [x0, y0, x1, y1] = k.edge === "v0" ? [k.at - half, 0, k.at + half, k.depth]
            : k.edge === "v1" ? [k.at - half, p.width - k.depth, k.at + half, p.width]
                : k.edge === "u0" ? [0, k.at - half, k.depth, k.at + half] : [p.length - k.depth, k.at - half, p.length,
                    k.at + half];
        ents.push(line(l, x0, y0, x1, y0), line(l, x1, y0, x1, y1), line(l, x1, y1, x0, y1), line(l, x0, y1, x0, y0));
    }
    ents.push(text("TEXTE", 0, -12, 6, `${code} ${p.label} ep. ${p.thickness} face A vers soi`));

    const layerTable: Group[] = [[0, "TABLE"], [2, "LAYER"], [70, layers.size]];
    let colour = 1;
    for (const name of layers)
    {
        layerTable.push([0, "LAYER"], [2, name], [70, 0], [62, name === "CONTOUR" ? 7 : colour], [6, "CONTINUOUS"]);
        colour = colour % 6 + 1;
    }
    layerTable.push([0, "ENDTAB"]);
    const out: Group[] = [
        [0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1009"], [9, "$DWGCODEPAGE"], [3, "ANSI_1252"], [9,
            "$INSUNITS"], [70, 4], [0, "ENDSEC"],
        [0, "SECTION"], [2, "TABLES"],
        [0, "TABLE"], [2, "LTYPE"], [70, 1], [0, "LTYPE"], [2, "CONTINUOUS"], [70, 0], [3, "Solid line"], [72, 65], [73,
            0], [40, 0], [0, "ENDTAB"],
        ...layerTable,
        [0, "ENDSEC"],
        [0, "SECTION"], [2, "ENTITIES"],
        ...ents.flat(),
        [0, "ENDSEC"],
        [0, "EOF"],
    ];
    return emit(out) + "\n";
}


// Single byte file matching the ANSI_1252 code page declared in the header
export function dxfBytes(dxf: string): Uint8Array
{
    const bytes = new Uint8Array(dxf.length);
    let i = 0;
    while (i < dxf.length)
    {
        const c = dxf.charCodeAt(i);
        bytes[i] = c <= 0xff ? c : 0x3f;
        i++;
    }
    return bytes;
}
