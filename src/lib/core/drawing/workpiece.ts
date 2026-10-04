// One sheet per two workpieces : outline, drilling, grooves, banded edges, grain, and the hole cooridnate table

import type { Bom, CutRow } from "../bom";
import { edgeNotation } from "../bom";
import type { Fitted, Part } from "../parts";
import { tessellate, type Vec3 } from "../geometry";
import { fittedExtent } from "../fitted";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, fit, pickScale, textWidth, type Stroke } from "./display";
import type { Draft } from "./draft";
import { ROW, TABLE_COL_W, drawTable, outlineArcs, round1, tableLines } from "./machining_table";


const ROLE_ORIGIN: Record<string, string> = {
    side: "u depuis le bas, v depuis le chant avant, face A = intérieur du caisson",
    vdivider: "u depuis le bas, v depuis le chant avant, face A = face gauche",
    top: "u depuis la gauche, v depuis le chant avant, face A = intérieur (dessous)",
    bottom: "u depuis la gauche, v depuis le chant avant, face A = intérieur (dessus)",
    hdivider: "u depuis la gauche, v depuis le chant avant, face A = dessus",
    shelf: "u depuis la gauche, v depuis le chant avant, face A = dessus",
    drawerFront: "u depuis la gauche vue de face, v depuis le bas, face A = face intérieure",
    boxSide: "u depuis l'avant du tiroir, v depuis le bas, face A = intérieur du tiroir",
};
const DEFAULT_ORIGIN = "u selon la longueur, v selon la largeur, origine au coin bas gauche, face A vers soi";

const BOX_W = 185;
const BOX_H = 120;
// a part alone on its sheet
const WIDE_W = 390;
const WIDE_H = 150;


// Fronts read standing, the way they hang : their u, the height, runs up the sheet
const UPRIGHT = new Set(["door", "leaf", "panel"]);


// Width and height the part takes on the sheet before scaling
function spans(part: Part): [number, number]
{
    return UPRIGHT.has(part.role) ? [part.width, part.length] : [part.length, part.width];
}


function originText(part: Part): string
{
    if (UPRIGHT.has(part.role))
    {
        // the quarter turn keeps the view from face A : v then runs from right to left
        return "u depuis le bas, v depuis la gauche vue de face, dessin vu de l'intérieur (face A) : v de droite à gauche";
    }
    return ROLE_ORIGIN[part.role] ?? DEFAULT_ORIGIN;
}


// Lines of the table a box of that size has room for, under a drawing at the scale it picks
function tableRoom(part: Part, boxH: number, boxW: number, cols: number): number
{
    const [sx, sy] = spans(part);
    const scale = pickScale(sx, sy, boxW - 20, boxH - 20);
    const top = MARGIN + 5 + 24 + sy / scale + 18;
    return cols * Math.max(4, Math.floor((A3.h - MARGIN - TITLE_BLOCK_H - 6 - top - 3.6) / ROW));
}


// A long or much drilled part reads better alone on its sheet than in half of it, and a table that would not fit
// half a sheet takes the whole of it
function wantsWholeSheet(row: CutRow): boolean
{
    const part = row.parts[0]!;
    if (part.holes.length > 36 || tableLines(row, part).length > tableRoom(part, BOX_H, BOX_W, 1))
    {
        return true;
    }
    const [sx, sy] = spans(part);
    return pickScale(sx, sy, WIDE_W - 20, WIDE_H - 20) < pickScale(sx, sy, BOX_W - 20, BOX_H - 20);
}


export function partSheets(bom: Bom, fitted: Fitted[]): Draft[]
{
    const sheets: Draft[] = [];
    const rows = [...bom.cut, ...bom.offSheet];
    let i = 0;
    while (i < rows.length)
    {
        const canvas = new Canvas();
        const scales = new Set<number>();
        const codes: string[] = [];
        const overflow: { row: CutRow; rest: string[][] }[] = [];
        const wide = wantsWholeSheet(rows[i]!);
        let k = 0;
        while (k < (wide ? 1 : 2) && i + k < rows.length && (wide || !wantsWholeSheet(rows[i + k]!)))
        {
            const row = rows[i + k]!;
            const drawn = wide ? drawWorkpiece(canvas, row, MARGIN + 5, MARGIN + 5, WIDE_W, WIDE_H, fitted, 2)
                : drawWorkpiece(canvas, row, MARGIN + 5 + k * 200, MARGIN + 5, BOX_W, BOX_H, fitted, 1);
            scales.add(drawn.scale);
            codes.push(row.code.split(",")[0]!);
            if (drawn.rest.length > 0)
            {
                overflow.push({ row, rest: drawn.rest });
            }
            k++;
        }
        const scale = [...scales].map((s) =>
        {
            return `1:${s}`;
        }).join(", ");
        sheets.push({ title: `Pièces ${codes.join(" et ")}`, scale, canvas });
        // what a table could not hold runs on over sheets of its own, never left to the DXF alone
        for (const o of overflow)
        {
            let rest = o.rest;
            while (rest.length > 0)
            {
                const more = new Canvas();
                const code = o.row.code.split(",")[0]!;
                more.text(MARGIN + 5, MARGIN + 10, `${code}  ${o.row.label} (suite)`, 3.5, "start", true);
                rest = drawTable(more, rest, MARGIN + 5, MARGIN + 24, 2, "Usinages (suite)");
                sheets.push({ title: `Pièces ${code} (suite)`, scale: "-", canvas: more });
            }
        }
        i += k;
    }
    return sheets;
}


// A workpiece in a 195 x 255 box : header, drawing at a drafting scale, then the table of holes
function drawWorkpiece(canvas: Canvas, row: CutRow, x0: number, y0: number, boxW: number, boxH: number,
                       fitted: Fitted[], tableCols: number): { scale: number; rest: string[][] }
{
    const part = row.parts[0]!;
    const details = `${row.items.join(", ")} : quantité ${row.quantity}, ${row.decorLabel}, ép. ${row.thickness} mm`;
    canvas.text(x0, y0 + 5, fit(`${row.code}  ${row.label}`, 3.5, boxW + 5), 3.5, "start", true);
    canvas.text(x0, y0 + 10, fit(`${details}, chants ${edgeNotation(row.edges)}`, 2.5, boxW + 5), 2.5);
    canvas.text(x0, y0 + 14, fit(`Origine : ${originText(part)}`, 2.5, boxW + 5), 2.5);
    const outline = tessellate(part.outline);
    let maxU = 0;
    let maxV = 0;
    for (const [u, v] of outline)
    {
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
    }
    const upright = UPRIGHT.has(part.role);
    const [spanX, spanY] = upright ? [maxV, maxU] : [maxU, maxV];
    const scale = pickScale(spanX, spanY, boxW - 20, boxH - 20);
    const ox = x0 + 12;
    const oy = y0 + 24 + spanY / scale;
    // lying, u to the right and v up. Standing, u up and v to the left. Both seen from face A
    const P = (u: number, v: number): [number, number] =>
    {
        return upright ? [ox + (maxV - v) / scale, oy - u / scale] : [ox + u / scale, oy - v / scale];
    };
    const D = (du: number, dv: number): [number, number] =>
    {
        return upright ? [-dv, -du] : [du, -dv];
    };
    const seg = (u1: number, v1: number, u2: number, v2: number, s: Stroke): void =>
    {
        canvas.line(...P(u1, v1), ...P(u2, v2), s);
    };
    const box = (u1: number, v1: number, u2: number, v2: number, s: Stroke): void =>
    {
        const [a, b] = P(u1, v1);
        const [c, d] = P(u2, v2);
        canvas.rect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b), s);
    };

    if (part.curve !== null && (part.role === "skin" || part.role === "batten"))
    {
        box(0, 0, part.length, part.width, "normal");
        const what = part.role === "batten" ? `${row.quantity} tasseaux` : "Peau développée";
        canvas.text(...P(part.length / 2, part.width / 2), what, 2.5, "middle");
    }
    else
    {
        for (const o of [part.outline, ...part.cutouts])
        {
            canvas.poly(tessellate(o).map(([u, v]) =>
            {
                return P(u, v);
            }), true, "normal");
        }
    }
    for (const e of part.edges)
    {
        const vAt = e === "v1" ? part.width : 0;
        const uAt = e === "u1" ? part.length : 0;
        if (e === "v0" || e === "v1")
        {
            seg(0, vAt, part.length, vAt, "thick");
        }
        else
        {
            seg(uAt, 0, uAt, part.width, "thick");
        }
    }
    for (const g of part.grooves)
    {
        const half = g.width / 2;
        for (const off of [-half, half])
        {
            if (g.along === "u")
            {
                seg(g.from, g.at + off, g.to, g.at + off, "dashed");
            }
            else
            {
                seg(g.at + off, g.from, g.at + off, g.to, "dashed");
            }
        }
    }
    for (const h of part.holes)
    {
        const [x, y] = P(h.u, h.v);
        if (h.face === "A" || h.face === "B")
        {
            if (h.diameter === 0)
            {
                canvas.cross(x, y, 1);
            }
            else
            {
                canvas.circle(x, y, Math.max(0.5, h.diameter / 2 / scale), h.face === "A" ? "normal" : "dashed");
            }
        }
        // an edge hole is a short stroke going into the part as deep as the hole
        else if (h.face === "u0" || h.face === "u1")
        {
            seg(h.u, h.v, h.u + (h.face === "u0" ? h.depth : -h.depth), h.v, "centre");
        }
        else
        {
            seg(h.u, h.v, h.u, h.v + (h.face === "v0" ? h.depth : -h.depth), "centre");
        }
    }
    if (part.grain)
    {
        // the arrow along u, set off 4 mm of paper towards v
        const [nx, ny] = D(0, 1);
        const [g0x, g0y] = P(part.length * 0.35, part.width / 2);
        const [g1x, g1y] = P(part.length * 0.65, part.width / 2);
        const [ax, ay] = D(1, 0);
        canvas.line(g0x + 4 * nx, g0y + 4 * ny, g1x + 4 * nx, g1y + 4 * ny, "thin");
        canvas.arrowHead(g0x + 4 * nx, g0y + 4 * ny, ax, ay);
        canvas.arrowHead(g1x + 4 * nx, g1y + 4 * ny, -ax, -ay);
        canvas.text((g0x + g1x) / 2 + 5 * nx + 1, (g0y + g1y) / 2 + 5 * ny, "fil", 2, "middle");
    }
    // a pocket in an edge is hidden from the face : its outline dashed, as deep as it goes in
    for (const k of part.pockets ?? [])
    {
        const half = k.length / 2;
        if (k.edge === "v0" || k.edge === "v1")
        {
            const v0 = k.edge === "v0" ? 0 : part.width - k.depth;
            box(k.at - half, v0, k.at + half, v0 + k.depth, "dashed");
        }
        else
        {
            const u0 = k.edge === "u0" ? 0 : part.length - k.depth;
            box(u0, k.at - half, u0 + k.depth, k.at + half, "dashed");
        }
    }
    // every arc of the outline gets its radius, a leader from its centre to the middle of the arc
    for (const a of outlineArcs(part))
    {
        const tipU = a.cu + a.r * Math.cos(a.mid);
        const tipV = a.cv + a.r * Math.sin(a.mid);
        seg(a.cu, a.cv, tipU, tipV, "thin");
        canvas.arrowHead(...P(tipU, tipV), ...D(-Math.cos(a.mid), -Math.sin(a.mid)));
        const [tx, ty] = P(a.cu + a.r * 0.55 * Math.cos(a.mid), a.cv + a.r * 0.55 * Math.sin(a.mid));
        canvas.text(tx, ty - 1, `R${round1(a.r)}`, 2.5, "middle");
    }
    // the origin, then which way u and v run from it
    const [zx, zy] = P(0, 0);
    canvas.circle(zx, zy, 1, "thin");
    canvas.text(zx + (upright ? 1.5 : -1.5), zy + 3, "0", 2, upright ? "start" : "end");
    for (const [du, dv, name] of [[1, 0, "u"], [0, 1, "v"]] as const)
    {
        const [dx, dy] = D(du, dv);
        canvas.line(zx, zy, zx + 8 * dx, zy + 8 * dy, "thin");
        canvas.arrowHead(zx + 8 * dx, zy + 8 * dy, -dx, -dy);
        canvas.text(zx + 10 * dx + (dx === 0 ? 1.5 : 0), zy + 10 * dy + (dy === 0 ? 1 : 0), name, 2.2, "middle", true);
    }
    const left = ox;
    const right = ox + spanX / scale;
    canvas.dimH(left, right, oy + 1, oy + 7, `${Math.round(spanX * 10) / 10}`);
    // standing, the height is dimensioned on the right, clear of the u arrow at the origin
    const dimAt = upright ? right : left;
    const away = upright ? 1 : -1;
    canvas.dimV(oy - spanY / scale, oy, dimAt + away, dimAt + (upright ? 12 : 6) * away,
                `${Math.round(spanY * 10) / 10}`);
    drawFootprints(canvas, part, fitted, P);
    canvas.text(x0 + boxW, y0 + 18, `1:${scale}`, 2.5, "end");
    const lines = tableLines(row, part);
    const counts = [`Perçages (${part.holes.length})`];
    for (const [n, what] of [[part.cutouts.length, "découpes"], [outlineArcs(part).length, "arcs"],
                             [(part.pockets ?? []).length, "entailles"], [part.grooves.length, "rainures"]] as const)
    {
        if (n > 0)
        {
            counts.push(`${what} (${n})`);
        }
    }
    const rest = drawTable(canvas, lines, x0, oy + 18, tableCols, counts.join(", "));
    return { scale, rest };
}


// The outline of the hardware this part carries the screws of, dashed, with its reference
function drawFootprints(canvas: Canvas, part: Part, fitted: Fitted[],
                        P: (u: number, v: number) => [number, number]): void
{
    const fr = part.frame;
    if (fr === null)
    {
        return;
    }
    for (const f of fitted)
    {
        if (f.host !== null || !part.holes.some((h) =>
        {
            return h.fixes === f.ref;
        }))
        {
            continue;
        }
        const e = fittedExtent(f);
        let u0 = Infinity;
        let u1 = -Infinity;
        let v0 = Infinity;
        let v1 = -Infinity;
        let w0 = Infinity;
        let w1 = -Infinity;
        for (const x of [e.min[0], e.max[0]])
        {
            for (const y of [e.min[1], e.max[1]])
            {
                for (const z of [e.min[2], e.max[2]])
                {
                    const d: Vec3 = [x - fr.o[0], y - fr.o[1], z - fr.o[2]];
                    const u = d[0] * fr.u[0] + d[1] * fr.u[1] + d[2] * fr.u[2];
                    const v = d[0] * fr.v[0] + d[1] * fr.v[1] + d[2] * fr.v[2];
                    const w = d[0] * fr.n[0] + d[1] * fr.n[1] + d[2] * fr.n[2];
                    u0 = Math.min(u0, u);
                    u1 = Math.max(u1, u);
                    v0 = Math.min(v0, v);
                    v1 = Math.max(v1, v);
                    w0 = Math.min(w0, w);
                    w1 = Math.max(w1, w);
                }
            }
        }
        // the hardware lies against one face of the part, never away from it
        if (w1 < -1 || w0 > part.thickness + 1)
        {
            continue;
        }
        u0 = Math.max(0, u0);
        u1 = Math.min(part.length, u1);
        v0 = Math.max(0, v0);
        v1 = Math.min(part.width, v1);
        if (u1 <= u0 || v1 <= v0)
        {
            continue;
        }
        const [a, b] = P(u0, v0);
        const [c, d] = P(u1, v1);
        canvas.rect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b), "dashed");
        // the reference reads along the long side of the footprint, or above it when even that is too short
        const tall = Math.abs(d - b) > Math.abs(c - a);
        if (textWidth(f.ref, 1.8) > Math.max(Math.abs(d - b), Math.abs(c - a)) - 1)
        {
            canvas.text((a + c) / 2, Math.min(b, d) - 0.8, f.ref, 1.8, "middle");
        }
        else
        {
            canvas.text((a + c) / 2 + (tall ? 0.7 : 0), (b + d) / 2 + (tall ? 0 : 0.7), f.ref, 1.8, "middle", false,
                        tall ? 90 : 0);
        }
    }
}


