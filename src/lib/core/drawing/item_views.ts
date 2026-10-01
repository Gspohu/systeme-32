// One sheet of views per carcass : front, cut without the fronts, side and plan, with the fronts and the hardware
// of the item in tables

import type { Carcass } from "../model";
import type { Analysis } from "../analysis";
import { PLINTH_FOOT_GAP, baseHeight } from "../parts";
import { endReach, usableDepth } from "../extent";
import { sideHeights, topAngle } from "../slope";
import { fittedExtent } from "../fitted";
import { A3, Canvas, MARGIN, SCALES, TITLE_BLOCK_H } from "./display";
import { heading, table, type Draft } from "./draft";
import { drawFront } from "./views";
import { decorById } from "../../data/materials";
import { hardware } from "../../data/hardware";

type ToPage = (value: number) => number;

// page millimetres between two views, room for their titles and dimensions
const VIEW_GAP = 28;


export function itemViews(k: Carcass, a: Analysis): Draft
{
    const canvas = new Canvas();
    heading(canvas, `${k.name} : vues`);
    const bh = baseHeight(k);
    const reachLeft = endReach(k, "left");
    const reachRight = endReach(k, "right");
    const fullHeight = k.height + bh;
    // a tall item lines front, cut and side up on one row with the plan under the front, a wide and low one stacks
    // the cut under the front with the side beside it : whichever reads at the larger scale
    const wide = k.width + reachLeft + reachRight;
    const availW = A3.w - 2 * MARGIN - 20;
    const availH = A3.h - 2 * MARGIN - TITLE_BLOCK_H - 20;
    const fits = (s: number, stacked: boolean): boolean =>
    {
        if (stacked)
        {
            const tall = (2 * fullHeight + k.depth) / s + 3 * VIEW_GAP;
            return (wide + k.depth) / s + 2 * VIEW_GAP <= availW && tall <= availH;
        }
        const long = (2 * wide + k.depth) / s + 3 * VIEW_GAP;
        return long <= availW && (fullHeight + k.depth) / s + 2 * VIEW_GAP <= availH;
    };
    const last = SCALES[SCALES.length - 1]!;
    const inRow = SCALES.find((s) =>
    {
        return fits(s, false);
    }) ?? last;
    const inStack = SCALES.find((s) =>
    {
        return fits(s, true);
    }) ?? last;
    const stacked = inStack < inRow;
    const scale = stacked ? inStack : inRow;
    // page point of the left face of the box and of the floor under it, the item kept in its own coordinates
    const fx = MARGIN + 20 + reachLeft / scale;
    const fy = MARGIN + 38 + fullHeight / scale;
    const topY = fy - fullHeight / scale;
    drawFront(canvas, k, scale, fx - k.x / scale, fy + (k.y - bh) / scale, a);
    canvas.text(fx + k.width / scale / 2, topY - 12, "Vue de face", 3, "middle", true);
    canvas.dimH(fx, fx + k.width / scale, fy + 1, fy + 8, `${k.width}`);
    if (k.slope === null)
    {
        canvas.dimV(topY, fy, fx - reachLeft / scale - 1, fx - reachLeft / scale - 8, `${fullHeight}`);
    }
    else
    {
        // each side dimensioned on its own, the low one would read as the full height otherwise
        const sides = sideHeights(k);
        const xr = fx + (k.width + reachRight) / scale;
        canvas.dimV(fy - (sides.left + bh) / scale, fy, fx - reachLeft / scale - 1, fx - reachLeft / scale - 8,
                    `${sides.left + bh}`);
        canvas.dimV(fy - (sides.right + bh) / scale, fy, xr + 1, xr + 8, `${sides.right + bh}`);
    }
    const lay = a.build.layouts.get(k.id);
    if (lay !== undefined && k.root.kind === "split" && k.root.axis === "v")
    {
        // chain of the inner widths of the first level of columns
        const edges = [k.thickness];
        for (const d of lay.dividers)
        {
            if (d.split === k.root.id)
            {
                edges.push(d.x, d.x + d.w);
            }
        }
        edges.push(k.width - k.thickness);
        let i = 0;
        while (i + 1 < edges.length)
        {
            const width = Math.round(edges[i + 1]! - edges[i]!);
            canvas.dimH(fx + edges[i]! / scale, fx + edges[i + 1]! / scale, topY - 1, topY - 6, `${width}`, 1.8);
            i += 2;
        }
    }
    // the inside the fronts hide : panels, runner spaces, and the height of every cell
    // TODO the hinges are drawn nowhere on these views, their arm and plate are not modelled yet
    const cutX = stacked ? fx : fx + (k.width + reachRight) / scale + VIEW_GAP + reachLeft / scale;
    const cutY = stacked ? fy + VIEW_GAP + fullHeight / scale : fy;
    drawFront(canvas, k, scale, cutX - k.x / scale, cutY + (k.y - bh) / scale, a, false);
    canvas.text(cutX + k.width / scale / 2, topY - 12 + cutY - fy, "Coupe, façades déposées", 3, "middle", true);
    for (const cell of lay?.nodes.values() ?? [])
    {
        if (cell.kind === "cell" && cell.h / scale >= 6)
        {
            const xc = cutX + (cell.x + cell.w / 2) / scale;
            canvas.dimV(cutY - (bh + cell.y + cell.h) / scale, cutY - (bh + cell.y) / scale, xc, xc,
                        `${Math.round(cell.h)}`, 1.8);
        }
    }

    const planTop = (stacked ? cutY : fy) + 18;
    canvas.text(fx + k.width / scale / 2, planTop - 2, "Vue de dessus", 3, "middle", true);
    drawPlan(canvas, k, scale, fx, planTop, reachRight);

    const sideX = (stacked ? fx : cutX) + (k.width + reachRight) / scale + VIEW_GAP;
    canvas.text(sideX + k.depth / scale / 2, topY - 12, "Vue de côté", 3, "middle", true);
    canvas.rect(sideX, topY, k.depth / scale, k.height / scale, "normal");
    if (k.base.type === "plinth")
    {
        const front = sideX + (k.depth - k.base.setback) / scale;
        canvas.rect(front - k.thickness / scale, fy - (bh - PLINTH_FOOT_GAP) / scale, k.thickness / scale,
                    (bh - PLINTH_FOOT_GAP) / scale, "thin");
    }
    // seen from the side the feet stand in the open, the runner spaces behind the side panel
    for (const f of a.build.fitted)
    {
        if (f.item !== k.id || f.host !== null)
        {
            continue;
        }
        const e = fittedExtent(f);
        canvas.rect(sideX + (e.min[2] - k.z) / scale, fy - (e.max[1] - k.y + bh) / scale,
                    (e.max[2] - e.min[2]) / scale, (e.max[1] - e.min[1]) / scale, f.hidden ? "dashed" : "thin");
    }
    canvas.dimH(sideX, sideX + k.depth / scale, fy + 1, fy + 8, `${k.depth}`);

    // the tables take the free column on the right, else the space under the cut
    const rightX = sideX + k.depth / scale + VIEW_GAP;
    const onRight = A3.w - MARGIN - rightX >= 150;
    let listX = cutX;
    let listY = planTop + 4;
    if (onRight)
    {
        listX = rightX;
        listY = MARGIN + 26;
    }
    else if (stacked)
    {
        listX = sideX;
        listY = fy + 22;
    }
    itemTables(canvas, k, a, listX, listY);
    return { title: `${k.name}, vues`, scale: `1:${scale}`, canvas };
}


// What the views leave out : the slope, the fronts one by one, the hardware of the item by reference
function itemTables(canvas: Canvas, k: Carcass, a: Analysis, listX: number, top: number): void
{
    let listY = top;
    const bottom = A3.h - MARGIN - TITLE_BLOCK_H - 4;
    if (k.slope !== null)
    {
        const deg = (topAngle(k) * 180 / Math.PI).toFixed(1).replace(".", ",");
        const where = k.slope.low === "left" ? "gauche" : "droite";
        canvas.text(listX, listY, `Dessus en pente à ${deg}°, joue basse de ${k.slope.height} mm à ${where}`, 2.6);
        listY += 8;
    }
    canvas.text(listX, listY, "Façades", 3, "start", true);
    listY += 5;
    for (const fp of a.build.fronts.get(k.id) ?? [])
    {
        let kind = "vantail coulissant";
        if (fp.role === "door")
        {
            kind = `porte, charnières à ${fp.hinge === "left" ? "gauche" : "droite"}`;
        }
        else if (fp.role === "drawer")
        {
            kind = "façade de tiroir";
        }
        else if (fp.role === "flap")
        {
            kind = "abattant relevant";
        }
        else if (fp.role === "panel")
        {
            kind = "façade fixe";
        }
        const size = `${Math.round(fp.rect.w)} x ${Math.round(fp.rect.h)} x ${fp.thickness}`;
        canvas.text(listX + 3, listY, `${size}, ${kind}, ${decorById(fp.decor).label}`, 2.5);
        listY += 4.5;
        if (listY > bottom)
        {
            return;
        }
    }
    const qty = new Map<string, number>();
    for (const h of a.build.hardware)
    {
        if (h.item === k.id)
        {
            qty.set(h.ref, (qty.get(h.ref) ?? 0) + h.qty);
        }
    }
    if (qty.size === 0 || listY + 12 >= bottom)
    {
        return;
    }
    listY += 5;
    canvas.text(listX, listY, "Quincaillerie", 3, "start", true);
    const room = Math.max(4, Math.floor((bottom - listY - 6) / 4.5));
    const rows = [...qty].slice(0, room).map(([ref, count]) =>
    {
        const h = hardware(ref);
        return [`${h.brand} ${h.ref}`.trim(), `${count}`, h.label];
    });
    const labelW = Math.max(60, A3.w - MARGIN - 50 - listX);
    table(canvas, listX + 3, listY + 6, [34, 10, labelW], ["Référence", "Qté", "Article"], rows, 2.5, 4.5);
}


// Plan view with the rounded ends drawn as their real arcs
function drawPlan(canvas: Canvas, k: Carcass, scale: number, fx: number, planTop: number, reachRight: number): void
{
    const planX: ToPage = (x) =>
    {
        return fx + x / scale;
    };
    const planY: ToPage = (z) =>
    {
        return planTop + (k.depth - z) / scale;
    };
    canvas.rect(planX(0), planY(k.depth), k.width / scale, k.depth / scale, "normal");
    for (const side of ["left", "right"] as const)
    {
        const end = k.ends[side];
        if (end.type !== "rounded")
        {
            continue;
        }
        const r = endReach(k, side);
        const usable = usableDepth(k);
        const dir = side === "right" ? 1 : -1;
        const xFace = side === "right" ? k.width : 0;
        const arc: [number, number][] = [];
        const start = end.sweep === 180 ? -Math.PI / 2 : 0;
        let j = 0;
        while (j <= 24)
        {
            const ang = start + (Math.PI / 2 - start) * j / 24;
            arc.push([planX(xFace + dir * r * Math.cos(ang)), planY(k.depth - r + r * Math.sin(ang))]);
            j++;
        }
        // the straight run of a quarter round stops against the applied back, like the skin that gets built
        if (end.sweep === 90 && usable > r)
        {
            arc.unshift([planX(xFace + dir * r), planY(k.depth - usable)]);
        }
        canvas.poly(arc, false, "normal");
        canvas.text(planX(xFace + dir * r / 2), planY(k.depth / 2), `R ${Math.round(r)}`, 2, "middle");
    }
    const dimX = planX(k.width) + reachRight / scale;
    canvas.dimV(planY(k.depth), planY(0), dimX + 1, dimX + 8, `${k.depth}`);
}
