// One sheet per 2 workpieces : outline, drilling, grooves, banded edges, grain and the hole cooridnate table

import type { Bom, CutRow } from "../bom";
import { edgeNotation } from "../bom";
import type { Fitted, Part } from "../parts";
import { tessellate, vDown, type Vec3 } from "../geometry";
import { fittedExtent } from "../fitted";
import { A3, Canvas, MARGIN, OVERLAY_EM, SCALES, SMALL_TEXT, TITLE_BLOCK_H, TITLE_BLOCK_W, fit, inkBox, inkedBoxes,
    overlayWidth, pickScale, scaleText, textWidth, wrap, type Prim, type Stroke } from "./display";
import { DIMENSION, dimensionShift } from "./svg";
import { MARK_AIR, writeNear, type Box, type TextPrim } from "./clear";
import type { Draft, PartView } from "./draft";
import { ROW, TABLE_BOTTOM, TABLE_COL_W, TABLE_TEXT, TABLE_W, drawTable, faceRadius, machiningTable, outlineArcs,
    printedRows,
    type MachiningTable, type MarkSpot, type PlacedColumn } from "./machining_table";
import { round1 } from "../text";


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
// The u and v of the origin, read at a glance : twice the 2 mm floor, a whole millimetre TechDraw keeps
const AXIS_TEXT = 4;
// A part sheet may enlarge a very small board to 2:1 : the views of a carcass never do
const PART_SCALES = [0.5, ...SCALES];
const BOX_H = 120;
// A part alone on its sheet
const WIDE_W = 390;
const WIDE_H = 150;


// Fronts read standing, the way they hang : their u, the height, runs up the sheet
const UPRIGHT = new Set(["door", "leaf", "panel"]);


// A narrow board laid a quarter turn round, its long side along the sheet, when that alone reads at a larger
// scale than any other way of drawing it : a 80 x 420 cleat at 1:2, not 1:5
export function isTurned(part: Part): boolean
{
    if (UPRIGHT.has(part.role))
    {
        return false;
    }
    const [u, v] = [part.length, part.width];
    const best = Math.min(pickScale(u, v, BOX_W - 20, BOX_H - 20), pickScale(u, v, WIDE_W - 20, WIDE_H - 20));
    return pickScale(v, u, WIDE_W - 20, WIDE_H - 20) < best;
}


// Which way +u and +v run on the paper (y down the sheet) seen from face A for real : lying u to the right
// and standing u up, v the way the frame makes it (geometry.ts, vDown). Standing is a quarter turn of lying
// never a mirror
export function paperAxes(part: Part, turned = isTurned(part)): { su: [number, number]; sv: [number, number] }
{
    const down = vDown(part.frame);
    if (UPRIGHT.has(part.role) || turned)
    {
        return { su: [0, -1], sv: [down ? 1 : -1, 0] };
    }
    return { su: [1, 0], sv: [0, down ? 1 : -1] };
}


// Width and height the part takes on the sheet before scaling
function spans(part: Part): [number, number]
{
    return UPRIGHT.has(part.role) || isTurned(part) ? [part.width, part.length] : [part.length, part.width];
}


function originText(part: Part): string
{
    if (UPRIGHT.has(part.role))
    {
        // The quarter turn keeps the view from face A : v then runs one way or the other with the frame
        return "u depuis le bas, v depuis la gauche vue de face, dessin vu de l'intérieur (face A) : v de "
            + (vDown(part.frame) ? "gauche à droite" : "droite à gauche");
    }
    // The corner the origin lands on : both axes run into the board from it
    const { su, sv } = paperAxes(part);
    const across = su[0] !== 0 ? su[0] : sv[0];
    const up = su[1] !== 0 ? su[1] : sv[1];
    const corner = `coin ${up < 0 ? "bas" : "haut"} ${across > 0 ? "gauche" : "droit"}`;
    const text = (ROLE_ORIGIN[part.role] ?? DEFAULT_ORIGIN).replace("coin bas gauche", corner);
    return isTurned(part) ? `${text}, pièce tournée d'un quart de tour : u vers le haut` : text;
}


// Lines of the table a box of that size has room for, under a drawing at the scale it picks
function tableRoom(part: Part, boxH: number, boxW: number, cols: number): number
{
    const [sx, sy] = spans(part);
    const scale = pickScale(sx, sy, boxW - 20, boxH - 20);
    const top = MARGIN + 5 + 24 + sy / scale + 18;
    return cols * Math.max(4, Math.floor((A3.h - MARGIN - TITLE_BLOCK_H - 6 - top - ROW) / ROW));
}


// A part alone on its sheet : its table under it, or its header and table in a column on the right and the drawing
// the whole height on the left
function drawAlone(canvas: Canvas, row: CutRow, fitted: Fitted[], beside: boolean): ReturnType<typeof drawWorkpiece>
{
    return beside ? drawWorkpiece(canvas, row, MARGIN + 5, MARGIN + 5, WIDE_W, WIDE_H, fitted, 1, TABLE_BOTTOM,
                                  { x: A3.w - MARGIN - 5 - SIDE_W, w: SIDE_W })
        : drawWorkpiece(canvas, row, MARGIN + 5, MARGIN + 5, WIDE_W, WIDE_H, fitted, 2);
}


// The scale a layout draws a part at, tried on a sheet of its own, and none when that layout can't hold its marks
// or its table : a trial that fails rules its layout out, only the layout kept may stop the sheets
function trialScale(draw: () => ReturnType<typeof drawWorkpiece>): number
{
    try
    {
        const t = draw();
        return printedRows(t.rest) === 0 ? t.scale : Infinity;
    }
    catch
    {
        return Infinity;
    }
}


// Whichever of the two draws it the larger, both tried for real : the column only when its table holds in it
function aloneBeside(row: CutRow, fitted: Fitted[]): boolean
{
    const beside = trialScale(() => { return drawAlone(new Canvas(), row, fitted, true); });
    return beside < trialScale(() => { return drawAlone(new Canvas(), row, fitted, false); });
}


// A long or much drilled part reads better alone on its sheet than in half of it, and a table that wouldn't fit
// half a sheet takes the whole of it. Half a sheet and the whole are both drawn to compare
function wantsWholeSheet(row: CutRow, fitted: Fitted[]): boolean
{
    const part = row.parts[0]!;
    if (part.holes.length > 36 || printedRows(machiningTable(row, part)) > tableRoom(part, BOX_H, BOX_W, 1))
    {
        return true;
    }
    const alone = trialScale(() => { return drawAlone(new Canvas(), row, fitted, aloneBeside(row, fitted)); });
    const half = trialScale(() =>
    {
        return drawWorkpiece(new Canvas(), row, MARGIN + 5, MARGIN + 5, BOX_W, BOX_H, fitted, 1, A3.h - MARGIN - 4);
    });
    return alone < half;
}


// The column a large board alone on its sheet may put its header and table in, the drawing on its left
const SIDE_W = 125;

// Half the height a sheet gives its parts : 2 long and narrow ones drawn across its whole width share it
const HALF = (TABLE_BOTTOM - (MARGIN + 5)) / 2;


// Whether a part, drawn across the whole width at the scale that width gives it, holds in half the height with
// its table under it in 2 columns
function fitsHalfSheet(row: CutRow): boolean
{
    const part = row.parts[0]!;
    const [sx, sy] = spans(part);
    const scale = pickScale(sx, sy, WIDE_W - 20, WIDE_H - 20);
    const table = machiningTable(row, part);
    // Lines and notes share the 2 columns, each column under its own head
    const lines = Math.ceil((table.lines.length + table.notes.length) / 2) + 1;
    return part.holes.length <= 36 && 24 + sy / scale + 18 + lines * ROW + 4 <= HALF;
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
        const stuff = new Set<string>(); 
        const overflow: { row: CutRow; rest: MachiningTable }[] = [];
        const views: PartView[] = [];
        const tables: PlacedColumn[] = [];
        const marks: Prim[] = [];
        const wide = wantsWholeSheet(rows[i]!, fitted);
        // 2 parts that both want the whole width and each hold in half the height : one above the other
        const stacked = wide && i + 1 < rows.length && wantsWholeSheet(rows[i + 1]!, fitted)
            && fitsHalfSheet(rows[i]!) && fitsHalfSheet(rows[i + 1]!);
        let k = 0;
        while (k < (wide && !stacked ? 1 : 2) && i + k < rows.length
            && (wide || !wantsWholeSheet(rows[i + k]!, fitted)))
        {
            const row = rows[i + k]!;
            const top = MARGIN + 5 + k * HALF;
            let drawn;
            if (stacked)
            {
                drawn = drawWorkpiece(canvas, row, MARGIN + 5, top, WIDE_W, HALF, fitted, 2, top + HALF - 4);
            }
            else if (wide)
            {
                drawn = drawAlone(canvas, row, fitted, aloneBeside(row, fitted));
            }
            else
            {
                // The left half is clear of the title block : its table may run down to the frame
                drawn = drawWorkpiece(canvas, row, MARGIN + 5 + k * 200, MARGIN + 5, BOX_W, BOX_H, fitted, 1,
                                      k === 0 ? A3.h - MARGIN - 4 : TABLE_BOTTOM);
            }
            scales.add(drawn.scale);
            views.push(drawn.view);
            tables.push(...drawn.columns);
            marks.push(...drawn.marks);
            codes.push(row.code.split(",")[0]!);
            stuff.add(`${row.decorLabel} ${row.thickness} mm, chants ${edgeNotation(row.edges)}`); 
            if (printedRows(drawn.rest) > 0)
            {
                overflow.push({ row, rest: drawn.rest });
            }
            k++;
        }
        const scale = [...scales].map((s) =>
        {
            return scaleText(s);
        }).join(", ");
        sheets.push({ title: `Pièces ${codes.join(" et ")}`, supplement: [...stuff].join(" / "), scale, canvas, views,
                      tables, marks });
        // what a table could not hold runs on over sheets of its own, never left to the DXF alone
        for (const o of overflow)
        {
            let rest = o.rest;
            while (printedRows(rest) > 0)
            {
                const more = new Canvas();
                const code = o.row.code.split(",")[0]!;
                more.text(MARGIN + 5, MARGIN + 10, `${code}  ${o.row.label} (suite)`, 3.5, "start", true);
                const title = more.prims.slice(0, 1);
                const columns: PlacedColumn[] = [];
                const drawnTable = drawTable(more, rest, MARGIN + 5, MARGIN + 24, 2, "Usinages (suite)", columns);
                rest = drawnTable.rest;
                // Its title, the table heading and the notes : the cells are left to the TechDraw table
                sheets.push({ title: `Pièces ${code} (suite)`, scale: "-", canvas: more, tables: columns,
                              marks: [...title, ...drawnTable.marks] });
            }
        }
        i += k;
    }
    return sheets;
}


// A workpiece in a 195 x 255 box : header, drawing at a drafting scale, then the table of holes
// With a side column the header and the table go there, the drawing taking the whole height on its left
function drawWorkpiece(canvas: Canvas, row: CutRow, x0: number, y0: number, boxW: number, boxH: number,
                       fitted: Fitted[], tableCols: number, bottom = TABLE_BOTTOM, side?: { x: number; w: number }):
    { scale: number; rest: MachiningTable; view: PartView; columns: PlacedColumn[]; marks: Prim[] }
{
    // What is drawn from here on goes on the TechDraw page as it is : all but the board, its dimensions and the table
    const marks: Prim[] = [];
    const partFrom = canvas.prims.length;
    let from = canvas.prims.length;
    const keep = (): void =>
    {
        marks.push(...canvas.prims.slice(from));
        from = canvas.prims.length;
    };
    const part = row.parts[0]!;
    const details = `${row.items.join(", ")} : quantité ${row.quantity}, ${row.decorLabel}, ép. ${row.thickness} mm`;
    const heads: [string, number, boolean][] = [[`${row.code}  ${row.label}`, 3.5, true],
        [`${details}, chants ${edgeNotation(row.edges)}`, 2.5, false], [`Origine : ${originText(part)}`, 2.5, false]];
    // How far down the side column its header runs, the table starting under it
    let headBottom = y0;
    if (side === undefined)
    {
        heads.forEach(([t, size, bold], k) =>
        {
            canvas.text(x0, y0 + [5, 10, 14][k]!, fit(t, size, boxW + 5), size, "start", bold);
        });
    }
    else
    {
        for (const [t, size, bold] of heads)
        {
            for (const line of wrap(t, size, side.w, OVERLAY_EM))
            {
                headBottom += size + 1.5;
                canvas.text(side.x, headBottom, line, size, "start", bold);
            }
        }
    }
    keep();
    const outline = tessellate(part.outline);
    let maxU = 0;
    let maxV = 0;
    for (const [u, v] of outline)
    {
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
    }
    // A turned board stands like a front : its spans, its dimensions and its origin follow
    const upright = UPRIGHT.has(part.role) || isTurned(part);
    const [spanX, spanY] = upright ? [maxV, maxU] : [maxU, maxV];
    // As large as the box is wide and the whole table still fits under the drawing, never smaller than the box allows
    const own = machiningTable(row, part);
    // Lines and notes share the columns, each column under its own head
    const tableRows = Math.ceil((own.lines.length + own.notes.length) / tableCols) + 1;
    const tallest = bottom - (y0 + 24 + 18) - tableRows * ROW;
    // Beside its column the drawing runs from the top of the sheet to just over the title block, its dimensions
    // under it included
    const drawTop = side === undefined ? y0 + 24 : y0 + 4;
    const scale = (side === undefined ? PART_SCALES.find((s) =>
    {
        return spanX / s <= boxW - 20 && spanY / s <= Math.max(boxH - 20, tallest);
    }) : PART_SCALES.find((s) =>
    {
        return x0 + 12 + spanX / s <= side.x - 8 && drawTop + spanY / s <= A3.h - MARGIN - TITLE_BLOCK_H - 9;
    })) ?? pickScale(spanX, spanY, boxW - 20, boxH - 20);
    const ox = x0 + 12;
    const oy = drawTop + spanY / scale;
    const down = vDown(part.frame);
    const { su, sv } = paperAxes(part);
    // The board's box set left on ox and down on oy, whichever corner its origin lands on
    const minX = Math.min(0, maxU * su[0]) + Math.min(0, maxV * sv[0]);
    const maxY = Math.max(0, maxU * su[1]) + Math.max(0, maxV * sv[1]);
    const P = (u: number, v: number): [number, number] =>
    {
        return [ox + (u * su[0] + v * sv[0] - minX) / scale, oy + (u * su[1] + v * sv[1] - maxY) / scale];
    };
    const D = (du: number, dv: number): [number, number] =>
    {
        return [du * su[0] + dv * sv[0], du * su[1] + dv * sv[1]];
    };
    // The overall dimensions where TechDraw draws them : the label on its offset, the line past it by the shift, the
    // extension lines from the outline itself, its gap factor being 0
    const overallDimensions = (c: Canvas): void =>
    {
        const [left, right] = [ox, ox + spanX / scale];
        const shift = dimensionShift();
        const labelY = oy + DIMENSION.offset;
        c.dimH(left, right, oy, labelY + shift, "");
        c.text((left + right) / 2, labelY + DIMENSION.text * 0.35, round1(spanX), DIMENSION.text, "middle");
        // Standing, the height is dimensioned on the right, clear of the u arrow at the origin
        const labelX = upright ? right + DIMENSION.uprightOffset : left - DIMENSION.offset;
        c.dimV(oy - spanY / scale, oy, upright ? right : left, labelX + shift, "");
        c.text(labelX + DIMENSION.text * 0.35, oy - spanY / scale / 2, round1(spanY), DIMENSION.text, "middle", false,
               90);
    };
    // Drawn aside first : every text written before them keeps clear of what TechDraw will print there
    const ahead = new Canvas();
    overallDimensions(ahead);
    const around = (): Prim[] =>
    {
        return [...canvas.prims.slice(partFrom), ...ahead.prims];
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
        // Laid flat here, bent in the solid : no projection draw it this way
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
        // The outline is the projection's own
        from = canvas.prims.length;
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
                // The rim of its countersink, the circle TechDraw prints round the hole
                if (faceRadius(h) > h.diameter / 2)
                {
                    canvas.circle(x, y, faceRadius(h) / scale, h.face === "A" ? "normal" : "dashed");
                }
            }
        }
        // An edge hole is a short stroke going into the part as deep as the hole
        else if (h.face === "u0" || h.face === "u1")
        {
            seg(h.u, h.v, h.u + (h.face === "u0" ? h.depth : -h.depth), h.v, "centre");
        }
        else
        {
            seg(h.u, h.v, h.u, h.v + (h.face === "v0" ? h.depth : -h.depth), "centre");
        }
    }
    // The bought parts outlined before any word is written : the grain and the axes came out on their dashes
    const footprints = drawFootprints(canvas, part, fitted, P);
    let grainLeft = false;
    if (part.grain)
    {
        // The arrow along u, set off towards v by 4 mm of paper, less on a narrow board : a plinth 9.5 mm wide on
        // paper had it on its edge
        const off = Math.min(4, part.width / scale / 4);
        const [nx, ny] = D(0, 1);
        const [g0x, g0y] = P(part.length * 0.35, part.width / 2);
        const [g1x, g1y] = P(part.length * 0.65, part.width / 2);
        const [ax, ay] = D(1, 0);
        const [x1, y1, x2, y2] = [g0x + off * nx, g0y + off * ny, g1x + off * nx, g1y + off * ny];
        canvas.line(x1, y1, x2, y2, "thin");
        canvas.arrowHead(x1, y1, ax, ay);
        canvas.arrowHead(x2, y2, -ax, -ay);
        // Its word beside it, never on it : which side v runs decided before whether the letters stood on the line
        const arrow = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
        grainLeft = !writeNear(canvas, "fil", 2, arrow, around());
    }
    // A pocket in an edge is hidden from the face : its outline dashed, as deep as it goes in
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
    // Every arc of the outline gets its radius, a leader from its centre to the middle of the arc
    for (const a of outlineArcs(part))
    {
        const tipU = a.cu + a.r * Math.cos(a.mid);
        const tipV = a.cv + a.r * Math.sin(a.mid);
        if (a.cu < 0 || a.cu > maxU || a.cv < 0 || a.cv > maxV)
        {
            // A centre off the board may lie off the sheet : a short leader on the arc, its centre in the table
            const [tipX, tipY] = P(tipU, tipV);
            const [dx, dy] = D(-Math.cos(a.mid), -Math.sin(a.mid));
            canvas.line(tipX, tipY, tipX + 10 * dx, tipY + 10 * dy, "thin");
            canvas.arrowHead(tipX, tipY, dx, dy);
            const end = { x: tipX + 10 * dx, y: tipY + 10 * dy, w: 0, h: 0 };
            writeNear(canvas, `R${round1(a.r)}`, 2.5, end, around(),
                      [{ k: "text", x: tipX + 12 * dx, y: tipY + 12 * dy - 1, t: `R${round1(a.r)}`, size: 2.5,
                         anchor: "middle" }]);
            continue;
        }
        seg(a.cu, a.cv, tipU, tipV, "thin");
        canvas.arrowHead(...P(tipU, tipV), ...D(-Math.cos(a.mid), -Math.sin(a.mid)));
        const [tx, ty] = P(a.cu + a.r * 0.55 * Math.cos(a.mid), a.cv + a.r * 0.55 * Math.sin(a.mid));
        // By its leader, off the arc and every line : the table lists each arc, a radius with no room stays there
        writeNear(canvas, `R${round1(a.r)}`, 2.5, { x: tx, y: ty, w: 0, h: 0 }, around(),
                  [{ k: "text", x: tx, y: ty - 1, t: `R${round1(a.r)}`, size: 2.5, anchor: "middle" }]);
        // Its centre crossed and set from the two nearest edges of the board, where the compass goes in
        const [cx, cy] = P(a.cu, a.cv);
        canvas.cross(cx, cy, 1.5);
        const edgeU = a.cu > maxU / 2 ? maxU : 0;
        const edgeV = a.cv > maxV / 2 ? maxV : 0;
        const toEdges: { at: [number, number]; gap: number }[] = [
            { at: P(edgeU, a.cv), gap: Math.abs(edgeU - a.cu) },
            { at: P(a.cu, edgeV), gap: Math.abs(edgeV - a.cv) },
        ];
        for (const { at: [ex, ey], gap } of toEdges)
        {
            if (gap < 0.05)
            {
                continue;
            }
            if (Math.abs(ey - cy) < 1e-6)
            {
                canvas.dimH(Math.min(cx, ex), Math.max(cx, ex), cy, cy, round1(gap), SMALL_TEXT);
            }
            else
            {
                canvas.dimV(Math.min(cy, ey), Math.max(cy, ey), cx, cx, round1(gap), SMALL_TEXT);
            }
        }
    }
    // The origin, then which way u and v run from it
    const [zx, zy] = P(0, 0);
    canvas.circle(zx, zy, 1, "thin");
    // Its 0 outside the part, whichever corner it took
    const zeroRight = upright && !down;
    canvas.text(zx + (zeroRight ? 1.5 : -1.5), zy + (down && !upright ? -1.5 : 3), "0", 2, zeroRight ? "start" : "end");
    const axes = [[1, 0, "u"], [0, 1, "v"]] as const;
    for (const [du, dv] of axes)
    {
        const [dx, dy] = D(du, dv);
        canvas.line(zx, zy, zx + 8 * dx, zy + 8 * dy, "thin");
        canvas.arrowHead(zx + 8 * dx, zy + 8 * dy, -dx, -dy);
    }
    // Both arrows drawn, then their letters : the arrow of v crossed a u moved off its place
    for (const [du, dv, name] of axes)
    {
        const [dx, dy] = D(du, dv);
        // Clear of the edge and its arrow : u outside the part, v inside it, the overall dimension of the height
        // running down the outer side of v and hiding a letter there
        const [awayX, awayY] = name === "u" ? D(0, -1) : D(1, 0);
        const [lx, ly] = [zx + 6 * dx + 3.5 * awayX, zy + 6 * dy + 3.5 * awayY];
        // There when the paper is free, else the nearest free place : the origin line of the sheet says it too
        writeNear(canvas, name, AXIS_TEXT, { x: lx, y: ly, w: 0, h: 0 }, around(),
                  [{ k: "text", x: lx, y: ly + AXIS_TEXT * 0.35, t: name, size: AXIS_TEXT, anchor: "middle",
                    bold: true }],
                  true);
    }
    keep();
    // A mark keeps clear of what TechDraw prints
    overallDimensions(canvas);
    // The dimensions are TechDraw's own, measured on the solid
    from = canvas.prims.length;
    const table = machiningTable(row, part, side === undefined ? TABLE_W : side.w);
    // Everything of the part, its own outline included : a mark on a cut edge would be struck through by it
    const unplaced = placeMarks(canvas, table.spots, P, scale, canvas.prims.slice(partFrom), P(maxU / 2, maxV / 2));
    // The marks first, they name the machining : the references of the bought parts take the paper left
    placeReferences(canvas, footprints, canvas.prims.slice(partFrom));
    if (unplaced.length > 0)
    {
        // Said on the sheet, never dropped : the maker finds those holes by their line of the table
        table.notes.push(...wrap(`Note : repères ${unplaced.join(", ")} non écrits sur la vue faute de place, `
            + "positions au tableau", TABLE_TEXT, side === undefined ? TABLE_W : side.w, OVERLAY_EM));
    }
    if (grainLeft)
    {
        // The arrow alone could be read as a dimension : the grain is said in words
        table.notes.push(...wrap("Note : fil le long de u, flèche sans légende faute de place", TABLE_TEXT,
            side === undefined ? TABLE_W : side.w, OVERLAY_EM));
    }
    if (side === undefined)
    {
        canvas.text(x0 + boxW, y0 + 18, scaleText(scale), 2.5, "end");
    }
    else
    {
        headBottom += 4;
        canvas.text(side.x + side.w, headBottom, scaleText(scale), 2.5, "end");
    }
    keep();
    const counts = [`Perçages (${part.holes.length})`];
    for (const [n, what] of [[part.cutouts.length, "découpes"], [outlineArcs(part).length, "arcs"],
                             [(part.pockets ?? []).length, "entailles"], [part.grooves.length, "rainures"]] as const)
    {
        if (n > 0)
        {
            counts.push(`${what} (${n})`);
        }
    }
    const columns: PlacedColumn[] = [];
    const drawnTable = side === undefined
        ? drawTable(canvas, table, x0, oy + 18, tableCols, counts.join(", "), columns, bottom)
        : drawTable(canvas, table, side.x, headBottom + 12, 1, counts.join(", "), columns, bottom);
    const rest = drawnTable.rest;
    // Its heading and its notes, the cells left to the TechDraw table
    marks.push(...drawnTable.marks);
    const view: PartView = { part: part.id, scale, su, sv,
                             box: { x: ox, y: oy - spanY / scale, w: spanX / scale, h: spanY / scale } };
    return { scale, rest, view, columns, marks };
}



// Centred over the hole, under it, beside it, then on its corners : a row of holes closer than a mark is wide
// alternates over and under by itself
const AROUND = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1]] as const;
// Past this much paper between a hole's edge and its mark, mm, the mark takes a leader : D3 at 5 mm from its hole
// with C11 at 2.5 named C11's
const NEAR = 2;


// Paper between a point and the nearest ink of a box, mm
export function paperGap(p: [number, number], b: Box): number
{
    const dx = Math.max(b.x - p[0], 0, p[0] - b.x - b.w);
    const dy = Math.max(b.y - p[1], 0, p[1] - b.y - b.h);
    return Math.hypot(dx, dy);
}


// Each machining named by its mark : clear of all drawn, on the sheet, nearest its own hole, else led to it
// Returns the marks it found no room for
export function placeMarks(canvas: Canvas, spots: MarkSpot[], P: (u: number, v: number) => [number, number],
                    scale: number, drawn: Prim[], middle: [number, number]): string[]
{
    // Everything already on the part, and its texts alone : a mark keeps clear of the first, a leader of the second
    const boxes = (prims: Prim[]): Box[] =>
    {
        return prims.flatMap((q) => { return inkedBoxes(q); });
    };
    const busy = boxes(drawn);
    const words = boxes(drawn.filter((q) => { return q.k === "text"; }));
    const overlaps = (a: Box, b: Box): boolean =>
    {
        return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    };
    // Leaders already drawn, as the segments they are : their box would close a whole corner of empty paper
    const leaders: [number, number, number, number][] = [];
    const unplaced: string[] = [];
    // Some air round a mark : B2 touching D11 read B2D11
    const crowded = (b: Box): boolean =>
    {
        const room = { x: b.x - MARK_AIR, y: b.y - MARK_AIR, w: b.w + 2 * MARK_AIR, h: b.h + 2 * MARK_AIR };
        return busy.some((o) => { return overlaps(room, o); })
            || leaders.some(([x1, y1, x2, y2]) => { return segmentHits([x1, y1], [x2, y2], room); });
    };
    const blockX = A3.w - MARGIN - TITLE_BLOCK_W;
    const blockY = A3.h - MARGIN - TITLE_BLOCK_H;
    const onSheet = (b: Box): boolean =>
    {
        return b.x >= MARGIN && b.y >= MARGIN && b.x + b.w <= A3.w - MARGIN && b.y + b.h <= A3.h - MARGIN
            && !(b.x + b.w > blockX && b.y + b.h > blockY);
    };
    const points = spots.map((s) => { return P(s.u, s.v); });
    const h = SMALL_TEXT;
    // The marks written so far, those standing with no leader kept : a later one may not come nearer their hole
    const written: { k: number; box: Box; alone: boolean }[] = [];
    spots.forEach((s, k) =>
    {
        const [sx, sy] = points[k]!;
        const w = overlayWidth(s.tag, h);
        // A pocket centred on its hole shares its point : no position tells them apart, both are left to the table
        const apart = (j: number, i: number): boolean =>
        {
            return j !== i && Math.hypot(points[j]![0] - points[i]![0], points[j]![1] - points[i]![1]) > 1e-6;
        };
        const elsewhere = points.map((_, j) => { return apart(j, k); });
        // Read alone, a mark sits by its hole, the machining nearest it's its own and no other mark is nearer
        // the hole : anywhere else it takes a leader
        const standsAlone = (b: Box): boolean =>
        {
            const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
            const own = Math.hypot(cx - sx, cy - sy);
            const near = paperGap([sx, sy], b);
            return near <= s.r / scale + NEAR
                && points.every(([px, py], j) => { return !elsewhere[j] || Math.hypot(cx - px, cy - py) > own; })
                && written.every((m) => { return !elsewhere[m.k] || paperGap([sx, sy], m.box) > near; });
        };
        // Nearer the hole of a mark standing alone than that mark : the reader would take one for the other
        const steals = (b: Box): boolean =>
        {
            return written.some((m) =>
            {
                return m.alone && apart(m.k, k) && paperGap(points[m.k]!, b) <= paperGap(points[m.k]!, m.box);
            });
        };
        // Off the first ring a leader ties the mark to its hole : the nearest machining no longer says which, and
        // the leader may cross a line but strikes no text, save one written over the hole it starts from, and never
        // runs through another machining, which it would seem to name
        const leaderClear = (b: Box): boolean =>
        {
            const ex = Math.min(Math.max(sx, b.x), b.x + b.w);
            const ey = Math.min(Math.max(sy, b.y), b.y + b.h);
            const struck = words.some((o) =>
            {
                const aired = { x: o.x - MARK_AIR, y: o.y - MARK_AIR, w: o.w + 2 * MARK_AIR, h: o.h + 2 * MARK_AIR };
                const overHole = sx >= aired.x && sx <= aired.x + aired.w && sy >= aired.y && sy <= aired.y + aired.h;
                return !overHole && segmentHits([sx, sy], [ex, ey], aired);
            });
            const [lx, ly] = [ex - sx, ey - sy];
            const length2 = lx * lx + ly * ly;
            const through = points.some(([px, py], j) =>
            {
                const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - sx) * lx + (py - sy) * ly) / length2));
                const reach = Math.max(0.8, spots[j]!.r / scale + 0.4);
                return elsewhere[j] && Math.hypot(sx + t * lx - px, sy + t * ly - py) < reach;
            });
            return !struck && !through;
        };
        // A point on the outline, a hole in an edge or the middle of an arc, looks for room inside the board first
        const inwardFirst = (tries: Box[]): Box[] =>
        {
            const away = (b: Box): number =>
            {
                return Math.hypot(b.x + b.w / 2 - middle[0], b.y + b.h / 2 - middle[1]);
            };
            return s.r === 0 ? [...tries].sort((a, b) => { return away(a) - away(b); }) : tries;
        };
        const usable = (b: Box): boolean =>
        {
            return onSheet(b) && !crowded(b) && !steals(b) && (standsAlone(b) || leaderClear(b));
        };
        let chosen: Box | null = null;
        for (let ring = 0; chosen === null && ring < 20; ring++)
        {
            const gap = s.r / scale + 0.6 + ring * 1.25;
            // Each try measured as the text it would write, descenders included : what keeps clear is what prints
            const tries = AROUND.map(([dx, dy]) =>
            {
                const x = dx > 0 ? sx + gap : dx < 0 ? sx - gap - w : sx - w / 2;
                const top = dy < 0 ? sy - gap - 1.25 * h : dy > 0 ? sy + gap : sy - 0.625 * h;
                return inkBox([{ k: "text", x, y: top + h, t: s.tag, size: h, anchor: "start" }])!;
            });
            chosen = inwardFirst(tries).find(usable) ?? null;
        }
        // A crowded corner : any free place within 40 mm, square by square outwards
        for (let d = 1; chosen === null && d <= 40; d++)
        {
            for (let i = -d; chosen === null && i <= d; i++)
            {
                for (const [ax, ay] of [[i, -d], [i, d], [-d, i], [d, i]] as const)
                {
                    const b = inkBox([{ k: "text", x: sx + ax - w / 2, y: sy + ay + h / 2, t: s.tag, size: h,
                                        anchor: "start" }])!;
                    if (usable(b))
                    {
                        chosen = b;
                        break;
                    }
                }
            }
        }
        // No room at all : the sheet still comes out, the mark sent to the table by a note the maker reads
        if (chosen === null)
        {
            unplaced.push(s.tag);
            return;
        }
        const alone = standsAlone(chosen);
        written.push({ k, box: chosen, alone });
        if (!alone)
        {
            // Stopped short of the mark by the same air kept round it : the glyphs print a little wider than their
            // estimate, and E1 came out with the leader in its 1
            const ex = Math.min(Math.max(sx, chosen.x - MARK_AIR), chosen.x + chosen.w + MARK_AIR);
            const ey = Math.min(Math.max(sy, chosen.y - MARK_AIR), chosen.y + chosen.h + MARK_AIR);
            canvas.line(sx, sy, ex, ey, "thin");
            leaders.push([sx, sy, ex, ey]);
        }
        canvas.text(chosen.x, chosen.y + h, s.tag, h, "start");
        busy.push(chosen);
        words.push(chosen);
    });
    return unplaced;
}


// Whether the segment from a to b runs through a box : clipped against its 4 sides in turn (Liang and Barsky)
export function segmentHits(a: [number, number], b: [number, number], box: Box): boolean
{
    let [t0, t1] = [0, 1];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    for (const [p, q] of [[-dx, a[0] - box.x], [dx, box.x + box.w - a[0]], [-dy, a[1] - box.y],
                          [dy, box.y + box.h - a[1]]] as const)
    {
        if (p === 0)
        {
            if (q < 0)
            {
                return false;
            }
            continue;
        }
        const r = q / p;
        if (p < 0)
        {
            t0 = Math.max(t0, r);
        }
        else
        {
            t1 = Math.min(t1, r);
        }
        if (t0 > t1)
        {
            return false;
        }
    }
    return true;
}


// The outline of the hardware this part carries the screws of, dashed, with its reference
// The dashed outline of each bought part on the board, and its reference left to place once the marks are written
function drawFootprints(canvas: Canvas, part: Part, fitted: Fitted[],
                        P: (u: number, v: number) => [number, number]): Footprint[]
{
    const fr = part.frame;
    const pending: Footprint[] = [];
    if (fr === null)
    {
        return pending;
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
        // The hardware lies against one face of the part, never away from it
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
        const box = { x: Math.min(a, c), y: Math.min(b, d), w: Math.abs(c - a), h: Math.abs(d - b) };
        canvas.rect(box.x, box.y, box.w, box.h, "dashed");
        pending.push({ ref: f.ref, box });
    }
    return pending;
}


type Footprint = { ref: string; box: Box };


// Each reference of a footprint along its long side inside it, else round it. Its table names the part in full : a
// reference with no room is left to it, never written over the outline, a dimension or a mark
export function placeReferences(canvas: Canvas, footprints: Footprint[], drawn: Prim[]): string[]
{
    const left: string[] = [];
    for (const { ref, box } of footprints)
    {
        const h = SMALL_TEXT;
        const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
        const tall = box.h > box.w;
        const inside: TextPrim[] = textWidth(ref, h) < Math.max(box.w, box.h) - 1
            ? [tall ? { k: "text", x: cx + 0.7, y: cy, t: ref, size: h, anchor: "middle", rot: 90 }
                : { k: "text", x: cx, y: cy + 0.7, t: ref, size: h, anchor: "middle" }]
            : [];
        if (writeNear(canvas, ref, h, box, drawn, inside))
        {
            // What this one wrote, a later reference keeps clear of it
            drawn = [...drawn, canvas.prims[canvas.prims.length - 1]!];
        }
        else
        {
            left.push(ref);
        }
    }
    return left;
}


