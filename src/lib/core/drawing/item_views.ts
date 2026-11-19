// One sheet of views per carcass : front, cut without the fronts, side and plan, with the fronts and the hardware
// of the item in tables

import type { Carcass } from "../model";
import type { Analysis } from "../analysis";
import { PLINTH_TOP_GAP, baseHeight } from "../part_base";
import { endReach, usableDepth } from "../extent";
import { sideHeights, topAngle } from "../slope";
import { fittedExtent } from "../fitted";
import { endPost, endToe, floorOutline, openEndLevels, plinthFootGap } from "../curves";
import { tessellate } from "../geometry";
import { A3, Canvas, MARGIN, SCALES, TITLE_BLOCK_H, boxOf } from "./display";
import { heading, paginateTable, table, type Draft, type ItemView } from "./draft";
import { drawFront } from "./views";
import { round1 } from "../text";
import { decorById } from "../../data/materials";
import { hardware } from "../../data/hardware";

type ToPage = (value: number) => number;



// Page millimetres betwen two views, room for their titles and dimensions
const VIEW_GAP = 28;


export function itemViews(k: Carcass, a: Analysis): Draft
{
    const canvas = new Canvas();
    heading(canvas, `${k.name} : vues`);
    // What a TechDraw view projects of the solids is left out of the marks laid over it
    const drawn: [number, number][] = [];
    const geometry = (draw: () => void): [number, number] =>
    {
        const start = canvas.prims.length;
        draw();
        drawn.push([start, canvas.prims.length]);
        return drawn[drawn.length - 1]!;
    };
    // What the plinth or the feet add under the box
    const standHeight = baseHeight(k);
    const reachLeft = endReach(k, "left");
    const reachRight = endReach(k, "right");
    const fullHeight = k.height + standHeight;
    // A tall item lines front, cut and side up on one row with the plan under the front, a wide and low one stacks
    // the cut under the front with the side beside it : whichever reads at the larger scale
    const fullWidth = k.width + reachLeft + reachRight;
    const availW = A3.w - 2 * MARGIN - 20;
    const availH = A3.h - 2 * MARGIN - TITLE_BLOCK_H - 20;
    const fits = (s: number, asStack: boolean): boolean =>
    {
        if (asStack)
        {
            const tall = (2 * fullHeight + k.depth) / s + 3 * VIEW_GAP;
            return (fullWidth + k.depth) / s + 2 * VIEW_GAP <= availW && tall <= availH;
        }
        const long = (2 * fullWidth + k.depth) / s + 3 * VIEW_GAP;
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
    // Page point of the left face of the box and of the floor under it, the item kept in its own coordinates
    const boxLeftX = MARGIN + 20 + reachLeft / scale;
    const floorY = MARGIN + 38 + fullHeight / scale;
    const topY = floorY - fullHeight / scale;
    const frontDrawn = geometry(() =>
    {
        drawFront(canvas, k, scale, boxLeftX - k.x / scale, floorY + (k.y - standHeight) / scale, a);
    });
    canvas.text(boxLeftX + k.width / scale / 2, topY - 12, "Vue de face", 3, "middle", true);
    canvas.dimH(boxLeftX, boxLeftX + k.width / scale, floorY + 1, floorY + 8, `${k.width}`);
    if (k.slope === null)
    {
        canvas.dimV(topY, floorY, boxLeftX - reachLeft / scale - 1, boxLeftX - reachLeft / scale - 8, `${fullHeight}`);
    }
    else
    {
        // Each side dimensioned on its own, the low one would read as the full height otherwise
        const sides = sideHeights(k);
        const rightDimX = boxLeftX + (k.width + reachRight) / scale;
        canvas.dimV(floorY - (sides.left + standHeight) / scale, floorY, boxLeftX - reachLeft / scale - 1,
                    boxLeftX - reachLeft / scale - 8, `${sides.left + standHeight}`);
        canvas.dimV(floorY - (sides.right + standHeight) / scale, floorY, rightDimX + 1, rightDimX + 8,
                    `${sides.right + standHeight}`);
    }
    // clear heights between the shaped boards of an open rounded end, down its middle
    for (const side of ["left", "right"] as const)
    {
        const end = k.ends[side];
        if (end.type !== "rounded" || end.open !== true)
        {
            continue;
        }
        const reach = side === "left" ? reachLeft : reachRight;
        const endMidX = side === "right" ? boxLeftX + (k.width + reach / 2) / scale : boxLeftX - reach / 2 / scale;
        const levels = openEndLevels(k, end).sort((lower, upper) =>
        {
            return lower - upper;
        });
        for (let i = 0; i + 1 < levels.length; i++)
        {
            const clear = levels[i + 1]! - levels[i]! - k.thickness;
            canvas.dimV(floorY - (standHeight + levels[i + 1]!) / scale,
                        floorY - (standHeight + levels[i]! + k.thickness) / scale, endMidX, endMidX, round1(clear), 1.8);
        }
    }
    const lay = a.build.layouts.get(k.id);
    if (lay !== undefined && k.root.kind === "split" && k.root.axis === "v")
    {
        // Chain of the inner widths of the first level of columns
        const edges = [k.thickness];
        for (const divider of lay.dividers)
        {
            if (divider.split === k.root.id)
            {
                edges.push(divider.x, divider.x + divider.w);
            }
        }
        edges.push(k.width - k.thickness);
        let i = 0;
        while (i + 1 < edges.length)
        {
            canvas.dimH(boxLeftX + edges[i]! / scale, boxLeftX + edges[i + 1]! / scale, topY - 1, topY - 6,
                        round1(edges[i + 1]! - edges[i]!), 1.8);
            i += 2;
        }
    }
    // The inside the fronts hide : panels, runner spaces and the height of every cell
    // TODO the hinges are drawn nowhere on these views, their arm and plate aren't modelled yet
    const cutX = stacked ? boxLeftX : boxLeftX + (k.width + reachRight) / scale + VIEW_GAP + reachLeft / scale;
    const cutY = stacked ? floorY + VIEW_GAP + fullHeight / scale : floorY;
    const bareDrawn = geometry(() =>
    {
        drawFront(canvas, k, scale, cutX - k.x / scale, cutY + (k.y - standHeight) / scale, a, false);
    });
    canvas.text(cutX + k.width / scale / 2, topY - 12 + cutY - floorY, "Vue de face, façades déposées", 3, "middle",
                true);
    for (const cell of lay?.nodes.values() ?? [])
    {
        if (cell.kind === "cell" && cell.h / scale >= 6)
        {
            const cellMidX = cutX + (cell.x + cell.w / 2) / scale;
            canvas.dimV(cutY - (standHeight + cell.y + cell.h) / scale, cutY - (standHeight + cell.y) / scale,
                        cellMidX, cellMidX, round1(cell.h), 1.8);
        }
    }

    const planTop = (stacked ? cutY : floorY) + 18;
    canvas.text(boxLeftX + k.width / scale / 2, planTop - 2, "Vue de dessus", 3, "middle", true);
    const planDrawn: [number, number][] = [];
    drawPlan(canvas, k, scale, boxLeftX, planTop, reachRight, (draw) => { planDrawn.push(geometry(draw)); });

    const sideX = (stacked ? boxLeftX : cutX) + (k.width + reachRight) / scale + VIEW_GAP;
    // set on the right of the front view with the front of the item on its right : seen from the left, first angle
    canvas.text(sideX + k.depth / scale / 2, topY - 12, "Vue de gauche", 3, "middle", true);
    const sideDrawn = geometry(() =>
    {
        canvas.rect(sideX, topY, k.depth / scale, k.height / scale, "normal");
        if (k.base.type === "plinth")
        {
            const front = sideX + (k.depth - k.base.setback) / scale;
            canvas.rect(front - k.thickness / scale, floorY - (standHeight - PLINTH_TOP_GAP) / scale, k.thickness /
                        scale,
                        (standHeight - plinthFootGap(k) - PLINTH_TOP_GAP) / scale, "thin");
        }
        // Seen from the side the feet stand in the open, the runner spaces behind the side panel
        for (const fitting of a.build.fitted)
        {
            if (fitting.item !== k.id || fitting.host !== null)
            {
                continue;
            }
            const extent = fittedExtent(fitting);
            canvas.rect(sideX + (extent.min[2] - k.z) / scale, floorY - (extent.max[1] - k.y + standHeight) / scale,
                        (extent.max[2] - extent.min[2]) / scale, (extent.max[1] - extent.min[1]) / scale,
                        fitting.hidden ? "dashed" : "thin");
        }
    });
    canvas.dimH(sideX, sideX + k.depth / scale, floorY + 1, floorY + 8, `${k.depth}`);
    // The base : its height on the front edge, and how far a plinth stands back from the front
    const sideFront = sideX + k.depth / scale;
    if (standHeight > 0)
    {
        canvas.dimV(floorY - standHeight / scale, floorY, sideFront + 1, sideFront + 6, `${standHeight}`, 1.8);
    }
    if (k.base.type === "plinth" && k.base.setback > 0)
    {
        canvas.dimH(sideFront - k.base.setback / scale, sideFront, floorY + 1, floorY + 14, `${k.base.setback}`, 1.8);
    }

    // The tables take the free column on the right, else the space under the cut
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
        listY = floorY + 22;
    }
    itemTables(canvas, k, a, listX, listY);
    const marks = canvas.prims.filter((_, i) => { return !drawn.some(([s, e]) => { return i >= s && i < e; }); });
    // Each view's box as the sheet lays it out : the item with its ends, the base under it
    const wide = fullWidth / scale;
    const high = fullHeight / scale;
    const left = boxLeftX - reachLeft / scale;
    // A projection is centred on its own extent, fillers and plinth included : the box of what this sheet draws
    // of each view puts both on the same centre
    const extentOf = (ranges: [number, number][], fallback: ItemView["box"]): ItemView["box"] =>
    {
        return boxOf(ranges.flatMap(([s, e]) => { return canvas.prims.slice(s, e); })) ?? fallback;
    };
    const items: ItemView[] = [
        { item: k.id, whole: true, view: "front", scale,
          box: extentOf([frontDrawn], { x: left, y: topY, w: wide, h: high }) },
        { item: k.id, whole: false, view: "front", scale,
          box: extentOf([bareDrawn], { x: cutX - reachLeft / scale, y: cutY - high, w: wide, h: high }) },
        { item: k.id, whole: true, view: "top", scale,
          box: extentOf(planDrawn, { x: left, y: planTop, w: wide, h: k.depth / scale }) },
        { item: k.id, whole: true, view: "left", scale, box: extentOf([sideDrawn], { x: sideX, y: topY,
            w: k.depth / scale, h: high }) },
    ];
    return { title: `${k.name}, vues`, scale: `1:${scale}`, canvas, marks, items };
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
        else if (fp.role === "drop")
        {
            kind = "abattant tombant, charnières en bas";
        }
        else if (fp.role === "panel")
        {
            kind = "façade fixe";
        }
        if (listY + 4.5 > bottom)
        {
            canvas.text(listX + 3, listY, "... la suite des façades est dans la fiche de débit", 2.5);
            return;
        }
        const size = `${round1(fp.rect.w)} x ${round1(fp.rect.h)} x ${fp.thickness}`;
        canvas.text(listX + 3, listY, `${size}, ${kind}, ${decorById(fp.decor).label}`, 2.5);
        listY += 4.5;
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
    const rows = [...qty].map(([ref, count]) =>
    {
        const h = hardware(ref);
        return [`${h.brand} ${h.ref}`.trim(), `${count}`, h.label];
    });
    const cols = [34, 10, Math.max(60, A3.w - MARGIN - 50 - listX)];
    // What the room left doesn't hold is named, never dropped
    const pages = paginateTable(rows, cols, 2.5, 4.5, bottom - listY - 12);
    const end = table(canvas, listX + 3, listY + 6, cols, ["Référence", "Qté", "Article"], pages[0]!, 2.5, 4.5);
    if (pages.length > 1)
    {
        canvas.text(listX + 3, end, `... ${rows.length - pages[0]!.length} autres articles dans la quincaillerie`, 2.5);
    }
}


// Plan view, rounded ends as real arcs, the back against the front ivew as on the settig out. Outline and arcs
// go through shape : radii, dimensions and the hidden floor curve stay laid over the projection
function drawPlan(canvas: Canvas, k: Carcass, scale: number, fx: number, planTop: number, reachRight: number,
                  shape: (draw: () => void) => void): void
{
    const planX: ToPage = (x) =>
    {
        return fx + x / scale;
    };
    const planY: ToPage = (z) =>
    {
        return planTop + z / scale; 
    };
    shape(() => { canvas.rect(planX(0), planY(0), k.width / scale, k.depth / scale, "normal"); });
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
        // The straight run of a quarter round stops against the applied back, like the skin that gets built
        if (end.sweep === 90 && usable > r)
        {
            arc.unshift([planX(xFace + dir * r), planY(k.depth - usable)]);
        }
        // A quarter round closes on the side along its back, a half round comes back to the side by itself
        if (end.sweep === 90)   
        {
            arc.unshift([planX(xFace), arc[0]![1]]);
        } 
        shape(() => { canvas.poly(arc, false, "normal"); });
        canvas.text(planX(xFace + dir * r / 2), planY(k.depth / 2), `R ${Math.round(r)}`, 2, "middle");
        // The floor board under the others, from the plinth line : only its curve, the rest runs on the lines drawn
        const floor = floorOutline(k, side);
        if (floor !== null)
        {
            const first = floor.segments.findIndex((s) =>
            {
                return s.kind === "arc";
            });
            const before = first === 0 ? floor.start : floor.segments[first - 1]!;
            const from: [number, number] = Array.isArray(before) ? before : [before.x, before.y];
            const curve = tessellate({ start: from, segments: floor.segments.filter((s) =>
            {
                return s.kind === "arc";
            }) }, 3);
            canvas.poly(curve.map(([u, v]): [number, number] =>
            {
                return [planX(xFace + dir * u), planY(k.depth - v)];
            }), false, "hidden");
            // Over the radius, towards the back : under it the two curves close in on the front
            canvas.text(planX(xFace + dir * r / 2), planY(k.depth / 2) - 6, end.sweep === 180
                ? `R ${Math.round(r - endToe(k, end))} au sol` : "au sol", 1.8, "middle");
        }
        // The upright of a seat end, its centre from the side face and from the front
        const post = endPost(k, side);
        if (post !== null)
        {
            const px = planX(xFace + dir * post.u);
            const py = planY(k.depth - post.v);
            canvas.cross(px, py, 1.2);
            canvas.dimH(planX(xFace), px, planY(k.depth) + 1, planY(k.depth) + 5, `${Math.round(post.u)}`, 1.8);
            canvas.dimV(py, planY(k.depth), px + dir * 1.5, px + dir * 5, `${Math.round(post.v)}`, 1.8); 
        }
    }
    const dimX = planX(k.width) + reachRight / scale;
    canvas.dimV(planY(0), planY(k.depth), dimX + 1, dimX + 8, `${k.depth}`);  
}
