// One sheet per 2 workpieces : outline, drilling, grooves, banded edges, grain and the hole cooridnate table

import type { Bom, CutRow } from "../bom";
import { edgeNotation } from "../bom";
import type { Fitted, Part } from "../parts";
import { tessellate, vDown, type Vec3 } from "../geometry";
import { fittedExtent } from "../fitted";
import { A3, Canvas, MARGIN, SCALES, SMALL_TEXT, TITLE_BLOCK_H, fit, inkBox, pickScale, scaleText, textWidth, wrap,
    type Prim, type Stroke }
    from "./display";
import type { Draft, PartView } from "./draft";
import { ROW, TABLE_BOTTOM, TABLE_COL_W, TABLE_W, drawTable, machiningTable, outlineArcs, printedRows,
    type MachiningTable, type PlacedColumn } from "./machining_table";
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
// scale than any other way of drawing it : a 80 x 420 cleat at 1:2 rather than 1:5
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
    return cols * Math.max(4, Math.floor((A3.h - MARGIN - TITLE_BLOCK_H - 6 - top - 3.6) / ROW));
}


// A part alone on its sheet : its table under it, or its header and table in a column on the right and the drawing
// the whole height on the left
function drawAlone(canvas: Canvas, row: CutRow, fitted: Fitted[], beside: boolean): ReturnType<typeof drawWorkpiece>
{
    return beside ? drawWorkpiece(canvas, row, MARGIN + 5, MARGIN + 5, WIDE_W, WIDE_H, fitted, 1, TABLE_BOTTOM,
                                  { x: A3.w - MARGIN - 5 - SIDE_W, w: SIDE_W })
        : drawWorkpiece(canvas, row, MARGIN + 5, MARGIN + 5, WIDE_W, WIDE_H, fitted, 2);
}


// Whichever of the two draws it the larger, both tried for real : the column only when its table holds in it
function aloneBeside(row: CutRow, fitted: Fitted[]): boolean
{
    const trial = drawAlone(new Canvas(), row, fitted, true);
    return trial.scale < drawAlone(new Canvas(), row, fitted, false).scale && printedRows(trial.rest) === 0;
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
    const alone = drawAlone(new Canvas(), row, fitted, aloneBeside(row, fitted)).scale;
    const half = drawWorkpiece(new Canvas(), row, MARGIN + 5, MARGIN + 5, BOX_W, BOX_H, fitted, 1,
                               A3.h - MARGIN - 4).scale;
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
            for (const line of wrap(t, size, side.w))
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
    if (part.grain)
    {
        // The arrow along u, set off 4 mm of paper towards v
        const [nx, ny] = D(0, 1);
        const [g0x, g0y] = P(part.length * 0.35, part.width / 2);
        const [g1x, g1y] = P(part.length * 0.65, part.width / 2);
        const [ax, ay] = D(1, 0);
        canvas.line(g0x + 4 * nx, g0y + 4 * ny, g1x + 4 * nx, g1y + 4 * ny, "thin");
        canvas.arrowHead(g0x + 4 * nx, g0y + 4 * ny, ax, ay);
        canvas.arrowHead(g1x + 4 * nx, g1y + 4 * ny, -ax, -ay);
        canvas.text((g0x + g1x) / 2 + 5 * nx + 1, (g0y + g1y) / 2 + 5 * ny, "fil", 2, "middle");
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
        seg(a.cu, a.cv, tipU, tipV, "thin");
        canvas.arrowHead(...P(tipU, tipV), ...D(-Math.cos(a.mid), -Math.sin(a.mid)));
        const [tx, ty] = P(a.cu + a.r * 0.55 * Math.cos(a.mid), a.cv + a.r * 0.55 * Math.sin(a.mid));
        canvas.text(tx, ty - 1, `R${round1(a.r)}`, 2.5, "middle");
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
    const originFrom = canvas.prims.length;
    const [zx, zy] = P(0, 0);
    canvas.circle(zx, zy, 1, "thin");
    // Its 0 outside the part, whichever corner it took
    const zeroRight = upright && !down;
    canvas.text(zx + (zeroRight ? 1.5 : -1.5), zy + (down && !upright ? -1.5 : 3), "0", 2, zeroRight ? "start" : "end");
    for (const [du, dv, name] of [[1, 0, "u"], [0, 1, "v"]] as const)
    {
        const [dx, dy] = D(du, dv);
        canvas.line(zx, zy, zx + 8 * dx, zy + 8 * dy, "thin");
        canvas.arrowHead(zx + 8 * dx, zy + 8 * dy, -dx, -dy);
        // Clear of the edge and its arrow : u outside the part, v inside it, the overall dimension of the height
        // running down the outer side of v and hiding a letter there
        const [awayX, awayY] = name === "u" ? D(0, -1) : D(1, 0);
        canvas.text(zx + 6 * dx + 3.5 * awayX, zy + 6 * dy + 3.5 * awayY + AXIS_TEXT * 0.35, name, AXIS_TEXT,
                    "middle", true);
    }
    // Each machining named by the mark of its line in the table, on the first corner around it that covers no
    // hole, no other mark and nothing of the origin
    const table = machiningTable(row, part, side === undefined ? TABLE_W : side.w);
    const busy = part.holes.filter((h) => { return h.face === "A" || h.face === "B"; }).map((h) =>
    {
        const [hx, hy] = P(h.u, h.v);
        const r = Math.max(0.5, h.diameter / 2 / scale);
        return { x: hx - r, y: hy - r, w: 2 * r, h: 2 * r };
    });
    busy.push(...canvas.prims.slice(originFrom).flatMap((q) =>
    {
        const b = inkBox([q]);
        return b === null ? [] : [b];
    }));
    const overlaps = (a: typeof busy[number], b: typeof busy[number]): boolean =>
    {
        return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    };
    for (const s of table.spots)
    {
        const [sx, sy] = P(s.u, s.v);
        const gap = s.r / scale + 0.6;
        const w = textWidth(s.tag, SMALL_TEXT);
        const corners = ([[1, -1], [1, 1], [-1, -1], [-1, 1]] as const).map(([dx, dy]) =>
        {
            return { x: dx > 0 ? sx + gap : sx - gap - w, y: dy < 0 ? sy - gap - SMALL_TEXT : sy + gap, w,
                     h: SMALL_TEXT };
        });
        const spot = corners.find((c) => { return !busy.some((o) => { return overlaps(c, o); }); }) ?? corners[0]!;
        canvas.text(spot.x, spot.y + SMALL_TEXT, s.tag, SMALL_TEXT, "start");
        busy.push(spot);
    }
    keep();
    const left = ox;
    const right = ox + spanX / scale;
    canvas.dimH(left, right, oy + 1, oy + 7, round1(spanX));
    // Standing, the height is dimensioned on the right, clear of the u arrow at the origin
    const dimAt = upright ? right : left;
    const away = upright ? 1 : -1;
    canvas.dimV(oy - spanY / scale, oy, dimAt + away, dimAt + (upright ? 12 : 6) * away,
                round1(spanY));
    // The dimensions are TechDraw's own, measured on the solid
    from = canvas.prims.length;
    drawFootprints(canvas, part, fitted, P);
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
        canvas.rect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b), "dashed");
        // The reference reads along the long side of the footprint, or above it when even that's too short
        const tall = Math.abs(d - b) > Math.abs(c - a);
        if (textWidth(f.ref, SMALL_TEXT) > Math.max(Math.abs(d - b), Math.abs(c - a)) - 1)
        {
            canvas.text((a + c) / 2, Math.min(b, d) - 0.8, f.ref, SMALL_TEXT, "middle");
        }
        else
        {
            canvas.text((a + c) / 2 + (tall ? 0.7 : 0), (b + d) / 2 + (tall ? 0 : 0.7), f.ref, SMALL_TEXT, "middle",
                        false,
                        tall ? 90 : 0);
        }
    }
}


