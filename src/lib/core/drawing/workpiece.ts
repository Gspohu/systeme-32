// One sheet per two workpieces : outline, drilling, grooves, banded edges, grain, and the hole cooridnate table

import type { Bom, CutRow } from "../bom";
import { edgeNotation } from "../bom";
import type { Part } from "../parts";
import { tessellate } from "../geometry";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, fit, pickScale } from "./display";
import type { Draft } from "./draft";
import { DIAM } from "../text";


const ROLE_ORIGIN: Record<string, string> = {
    side: "u depuis le bas, v depuis le chant avant, face A = intérieur du caisson",
    vdivider: "u depuis le bas, v depuis le chant avant, face A = face gauche",
    top: "u depuis la gauche, v depuis le chant avant, face A = intérieur (dessous)",
    bottom: "u depuis la gauche, v depuis le chant avant, face A = intérieur (dessus)",
    hdivider: "u depuis la gauche, v depuis le chant avant, face A = dessus",
    shelf: "u depuis la gauche, v depuis le chant avant, face A = dessus",
    door: "u depuis le bas, v depuis la gauche vue de face, face A = face intérieure",
    drawerFront: "u depuis la gauche vue de face, v depuis le bas, face A = face intérieure",
    boxSide: "u depuis l'avant du tiroir, v depuis le bas, face A = intérieur du tiroir",
};
const DEFAULT_ORIGIN = "u selon la longueur, v selon la largeur, origine au coin bas gauche, face A vers soi";

const BOX_W = 185;
const BOX_H = 120;
const ROW = 3.4;


export function partSheets(bom: Bom): Draft[]
{
    const sheets: Draft[] = [];
    const rows = [...bom.cut, ...bom.offSheet];
    let i = 0;
    while (i < rows.length)
    {
        const canvas = new Canvas();
        const scales = new Set<number>();
        const codes: string[] = [];
        let k = 0;
        while (k < 2 && i + k < rows.length)
        {
            const row = rows[i + k]!;
            scales.add(drawWorkpiece(canvas, row, MARGIN + 5 + k * 200, MARGIN + 5));
            codes.push(row.code.split(",")[0]!);
            k++;
        }
        const scale = [...scales].map((s) =>
        {
            return `1:${s}`;
        }).join(", ");
        sheets.push({ title: `Pièces ${codes.join(" et ")}`, scale, canvas });
        i += k;
    }
    return sheets;
}


// A workpiece in a 195 x 255 box : header, drawing at a drafting scale, then the table of holes
function drawWorkpiece(canvas: Canvas, row: CutRow, x0: number, y0: number): number
{
    const part = row.parts[0]!;
    const details = `${row.items.join(", ")} : quantité ${row.quantity}, ${row.decorLabel}, ép. ${row.thickness} mm`;
    canvas.text(x0, y0 + 5, fit(`${row.code}  ${row.label}`, 3.5, 190), 3.5, "start", true);
    canvas.text(x0, y0 + 10, fit(`${details}, chants ${edgeNotation(row.edges)}`, 2.3, 190), 2.3);
    canvas.text(x0, y0 + 14, fit(`Origine : ${ROLE_ORIGIN[part.role] ?? DEFAULT_ORIGIN}`, 2.1, 190), 2.1);
    const outline = tessellate(part.outline);
    let maxU = 0;
    let maxV = 0;  
    for (const [u, v] of outline)
    {
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
    }
    const scale = pickScale(maxU, maxV, BOX_W - 20, BOX_H - 20);
    const ox = x0 + 12;
    const oy = y0 + 24 + maxV / scale;
    const pageU = (u: number): number =>
    {
        return ox + u / scale;
    };
    const pageV = (v: number): number =>
    {
        return oy - v / scale;
    };


    if (part.curve !== null && (part.role === "skin" || part.role === "batten"))
    {
        canvas.rect(pageU(0), pageV(part.width), part.length / scale, part.width / scale, "normal");
        const what = part.role === "batten" ? `${row.quantity} tasseaux` : "Peau développée";
        canvas.text(pageU(part.length / 2), pageV(part.width / 2), what, 2.5, "middle"); 
    }
    else
    {
        canvas.poly(outline.map(([u, v]) =>
        {
            return [pageU(u), pageV(v)];
        }), true, "normal");
        for (const c of part.cutouts)
        {
            canvas.poly(tessellate(c).map(([u, v]) =>
            {
                return [pageU(u), pageV(v)];
            }), true, "normal");
        }
    }
    for (const e of part.edges)
    {
        const vAt = e === "v1" ? part.width : 0;
        const uAt = e === "u1" ? part.length : 0;
        if (e === "v0" || e === "v1")
        {
            canvas.line(pageU(0), pageV(vAt), pageU(part.length), pageV(vAt), "thick");
        }
        else
        {
            canvas.line(pageU(uAt), pageV(0), pageU(uAt), pageV(part.width), "thick");
        }
    }
    for (const g of part.grooves)
    {
        const half = g.width / 2;
        for (const off of [-half, half])
        {
            if (g.along === "u")
            {
                canvas.line(pageU(g.from), pageV(g.at + off), pageU(g.to), pageV(g.at + off), "dashed");
            }
            else
            {
                canvas.line(pageU(g.at + off), pageV(g.from), pageU(g.at + off), pageV(g.to), "dashed");
            }
        }
    }
    for (const h of part.holes)
    {
        const x = pageU(h.u);
        const y = pageV(h.v);
        const depth = h.depth / scale;
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
            canvas.line(x, y, x + (h.face === "u0" ? depth : -depth), y, "centre");
        }
        else
        {
            canvas.line(x, y, x, y + (h.face === "v0" ? -depth : depth), "centre");
        }
    }
    if (part.grain)
    {
        const gy = pageV(part.width / 2) - 4;
        const gx0 = pageU(part.length * 0.35);
        const gx1 = pageU(part.length * 0.65); 
        canvas.line(gx0, gy, gx1, gy, "thin");
        canvas.arrowHead(gx0, gy, 1, 0);
        canvas.arrowHead(gx1, gy, -1, 0);
        canvas.text((gx0 + gx1) / 2, gy - 1, "fil", 2, "middle");
    }
    canvas.circle(pageU(0), pageV(0), 1, "thin"); 
    canvas.text(pageU(0) - 1.5, pageV(0) + 3, "0", 2, "end");
    canvas.dimH(pageU(0), pageU(maxU), pageV(0) + 1, pageV(0) + 7, `${Math.round(maxU * 10) / 10}`);
    canvas.dimV(pageV(maxV), pageV(0), pageU(0) - 1, pageU(0) - 7, `${Math.round(maxV * 10) / 10}`);
    canvas.text(x0 + BOX_W, y0 + 18, `1:${scale}`, 2.5, "end");
    holeTable(canvas, row, part, x0, oy + 18);
    return scale;
}


function round1(v: number): string
{
    return (Math.round(v * 10) / 10).toString();
}


function holeTable(canvas: Canvas, row: CutRow, part: Part, x0: number, top: number): void
{
    let ty = top;
    const bottom = A3.h - MARGIN - TITLE_BLOCK_H - 6;
    const rowsMax = Math.max(4, Math.floor((bottom - ty - 4 - ROW * Math.min(4, row.notes.length)) / ROW));
    const cols = [16, 16, 10, 11, 24, 111];
    const holes = [...part.holes].sort((a, b) =>
    {
        return a.face.localeCompare(b.face) || a.u - b.u || a.v - b.v;
    });
    const grooves = part.grooves.length > 0 ? `, rainures (${part.grooves.length})` : "";
    canvas.text(x0, ty - 5, `Perçages (${holes.length})${grooves}`, 2.8, "start", true);
    let cx = x0;
    let c = 0;
    for (const title of ["u", "v", DIAM, "prof.", "face", "usage"])
    {
        canvas.text(cx, ty, title, 2.2, "start", true);
        cx += cols[c]!;
        c++;
    }
    ty += 3.6;
    let n = 0;
    for (const h of holes)
    {
        if (n >= rowsMax)
        {
            canvas.text(x0, ty, `... ${holes.length - n} autres perçages : voir le DXF de la pièce`, 2.2);
            break;
        }
        let face: string = h.face;
        if (h.face !== "A" && h.face !== "B")
        {
            face = h.w === undefined ? `chant ${h.face}` : `chant ${h.face} w${round1(h.w)}`;
        }
        const cells = [round1(h.u), round1(h.v), h.diameter === 0 ? "vis" : `${h.diameter}`,
                       h.depth === 0 ? "-" : `${h.depth}`, face, h.label];
        cx = x0;
        c = 0;
        for (const text of cells)
        {
            canvas.text(cx, ty, fit(text, 2.1, cols[c]! - 1), 2.1);
            cx += cols[c]!;
            c++;
        }
        ty += ROW;
        n++;
    }
    if (n < rowsMax)
    {
        for (const g of part.grooves)
        {
            const where = `le long de ${g.along} à ${round1(g.at)}, de ${Math.round(g.from)} à ${Math.round(g.to)}`;
            canvas.text(x0, ty, fit(`Rainure ${g.width} x ${g.depth} face ${g.face}, ${where} : ${g.label}`, 2.1,
                                    190), 2.1);
            ty += ROW;
        }
    }
    for (const note of row.notes.slice(0, 4))
    {
        canvas.text(x0, ty, fit(`Note : ${note}`, 2.1, 190), 2.1);
        ty += ROW;
    }
}
