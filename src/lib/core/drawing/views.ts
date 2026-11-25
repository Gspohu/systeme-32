// Front views of the items and the composition sheet of each wall

import type { Carcass, Item, Project, Wall } from "../model";
import { WALL_LABELS } from "../room";
import { openingPoints } from "../cutouts";
import type { Analysis } from "../analysis";
import { PLINTH_TOP_GAP, baseHeight } from "../part_base";
import { endReach, itemExtent, projectExtent, screenSize, sideFiller } from "../extent";
import { screenSpots, spotSpan } from "../tv_arm";
import { slatLayout } from "../slats";
import { ceilingAt, frontOutline } from "../slope";
import { FIT_PLAY, RAIL_D, railPlan } from "../wardrobe";
import { SPOT_RIM, lightLevel, spotCentres } from "../lights";
import { A3, Canvas, MARGIN, SMALL_TEXT, TITLE_BLOCK_H, boxOf, inkBox, textWidth, wrap } from "./display";
import { BODY, heading, type Draft } from "./draft";
import { fittedExtent } from "../fitted";
import { topDoubling } from "../layout";
import { endDrop, endPost, floorOutline, openEndLevels, plinthFootGap } from "../curves";
import { bounds, tessellate } from "../geometry";
import { chain } from "./plan";
import { insideFirst, writeNear, type Box, type TextPrim } from "./clear";
import { OBSTACLE_LABELS } from "../obstacles";
import { sectionPlanes } from "./sections";
import { round1 } from "../text";


type ToPage = (value: number) => number;


// Front view of one item, world x and y mapped at 1:scale with the world origin on page point (ox, oy)
export function drawFront(canvas: Canvas, it: Item, scale: number, ox: number, oy: number, a: Analysis,
                          withFronts = true): void
{
    const pageX: ToPage = (x) =>
    {
        return ox + x / scale;
    };
    const pageY: ToPage = (y) =>
    {
        return oy - y / scale;
    };
    if (it.kind === "carcass")
    {
        drawCarcass(canvas, it, scale, pageX, pageY, a, withFronts);
        return;
    }
    if (it.kind === "corner")
    {
        const sx = it.quadrant.endsWith("Right") ? 1 : -1;
        const sy = it.quadrant.startsWith("top") ? 1 : -1;
        const outline: [number, number][] = [];
        let k = 0;
        while (k <= 24)
        {
            const ang = Math.PI / 2 * k / 24;   
            outline.push([pageX(it.cx + sx * it.outerRadius * Math.cos(ang)), pageY(it.cy + sy * it.outerRadius *
                Math.sin(ang))]);
            k++;
        }
        if (it.innerRadius > 0)
        {
            k = 24;
            while (k >= 0)
            {
                const ang = Math.PI / 2 * k / 24;
                outline.push([pageX(it.cx + sx * it.innerRadius * Math.cos(ang)), pageY(it.cy + sy *
                    it.innerRadius * Math.sin(ang))]);
                k--;
            }
        }
        else
        {
            outline.push([pageX(it.cx), pageY(it.cy)]);
        }
        canvas.poly(outline, true, "normal");
        return;
    }
    const box = itemExtent(it);
    // An appliance isn't made : dashed, behind a door or out in the open
    canvas.rect(pageX(box.x0), pageY(box.y1), (box.x1 - box.x0) / scale, (box.y1 - box.y0) / scale,
                it.kind === "device" ? "dashed" : "normal");
    if (it.kind === "box")
    {
        const t = it.thickness;
        canvas.rect(pageX(it.x + t), pageY(it.y + it.height - t), (it.width - 2 * t) / scale, (it.height -
            2 * t) / scale, "thin");
    }
    if (it.kind === "ladder")
    {
        canvas.rect(pageX(it.x + it.ladderAt), pageY(it.y), it.ladderWidth / scale, it.y / scale, "thin");
    }
    if (it.kind === "slats")
    {
        for (const x of slatLayout(it).xs)
        {
            canvas.rect(pageX(it.x + x), pageY(it.y + it.height), it.slatWidth / scale, it.height / scale, "thin");
        }
    }
}


// What drawing a carcass on a sheet reads : the canvas, its scale and page mapping, the analysis
interface CarcassView
{
    canvas: Canvas;
    k: Carcass;
    scale: number;
    pageX: ToPage;
    pageY: ToPage;
    a: Analysis;
    withFronts: boolean;
}


// Layers drawn in this order, each later one over the ones before
function drawCarcass(canvas: Canvas, k: Carcass, scale: number, pageX: ToPage, pageY: ToPage, a: Analysis,
                     withFronts: boolean): void
{
    const v: CarcassView = { canvas, k, scale, pageX, pageY, a, withFronts };
    drawShell(v);
    drawHardware(v);
    drawEnds(v);
    drawInside(v);
    drawFronts(v);
    drawOutlets(v);
}


function onPage(v: CarcassView, pts: [number, number][]): [number, number][]
{
    return pts.map(([x, y]): [number, number] => { return [v.pageX(v.k.x + x), v.pageY(v.k.y + y)]; });
}


// The outline, the fillers to the ceiling and beside the sides, the seat and the plinth
function drawShell(v: CarcassView): void
{
    const { canvas, k, scale, pageX, pageY, a } = v;
    const bh = baseHeight(k);
    const at = (pts: [number, number][]): [number, number][] =>
    {
        return onPage(v, pts);
    };
    if (k.slope === null)
    {
        canvas.rect(pageX(k.x), pageY(k.y + k.height), k.width / scale, k.height / scale, "normal");
    }
    else
    {
        canvas.poly(at(frontOutline(k)), true, "normal");
    }
    // The filler as the analysis built it, up to the ceiling of the room
    const filler = a.build.parts.find((q) =>
    {
        return q.id === `${k.id}/filler`;
    });
    if (filler !== undefined)
    {
        canvas.rect(pageX(k.x), pageY(k.y + k.height + filler.width), k.width / scale, filler.width / scale, "normal");
    }
    for (const side of ["left", "right"] as const)
    {
        const w = sideFiller(k, side);
        if (w > 0)
        {
            const x = side === "left" ? k.x - w : k.x + k.width;
            canvas.rect(pageX(x), pageY(k.y + k.height), w / scale, k.height / scale, "normal");
        }
    }
    if (k.seat !== null)
    {
        const top = k.y + k.height;
        if (k.seat.cushion > 0)
        {
            canvas.rect(pageX(k.x), pageY(top + k.seat.cushion), k.width / scale, k.seat.cushion / scale, "dashed");
        }
        canvas.text(pageX(k.x + k.width / 2), pageY(top + k.seat.cushion) - 1, "ASSISE", 2, "middle", true);
    }
    if (k.base.type === "plinth")
    {
        canvas.rect(pageX(k.x), pageY(k.y - PLINTH_TOP_GAP), k.width / scale, (bh - plinthFootGap(k) -
            PLINTH_TOP_GAP) / scale,
                    "thin");
    }
}


// The feet behind a plinth are hidden lines, the runner spaces only show where no front covers them
function drawHardware(v: CarcassView): void
{
    const { canvas, k, scale, pageX, pageY, a, withFronts } = v;
    for (const f of a.build.fitted)
    {
        if (f.item !== k.id || f.host !== null || (f.hidden && withFronts))
        {
            continue;
        }
        const e = fittedExtent(f);
        canvas.rect(pageX(e.min[0]), pageY(e.max[1]), (e.max[0] - e.min[0]) / scale, (e.max[1] - e.min[1]) / scale,
                    f.hidden || k.base.type === "plinth" ? "dashed" : "thin");
    }
}


// Rounded ends : their reach and drop, the shelves and upright of an open one, the battens of a closed one
function drawEnds(v: CarcassView): void
{
    const { canvas, k, scale, pageX, pageY } = v;
    const t = k.thickness;
    for (const side of ["left", "right"] as const)
    {
        const end = k.ends[side];
        if (end.type !== "rounded")
        {
            continue;
        }
        const reach = endReach(k, side);
        const x = side === "right" ? k.x + k.width : k.x - reach;
        const drop = endDrop(k, end);
        canvas.rect(pageX(x), pageY(k.y + k.height), reach / scale, (k.height + drop) / scale, "normal");
        if (end.open === true)
        {
            const floor = floorOutline(k, side);
            const floorReach = floor === null ? reach : bounds(tessellate(floor)).maxX;
            for (const lv of openEndLevels(k, end))
            {
                // The floor board as far out as its own outline goes, the side it butts never moving
                const w = lv < 0 ? floorReach : reach;
                const left = side === "right" ? x : k.x - w;
                canvas.rect(pageX(left), pageY(k.y + lv + t), w / scale, t / scale, "thin");
            }
            const post = endPost(k, side);  
            if (post !== null) 
            {
                const px = side === "right" ? x + post.u - post.w / 2 : x + reach - post.u - post.w / 2; 
                canvas.rect(pageX(px), pageY(k.y + k.height), post.w / scale, (k.height + drop) / scale, "thin");
            }
        }
        else if (end.technique === "battens")
        {
            const pitch = end.battens.width + end.battens.gap;
            let along = pitch;
            while (along < reach)
            {
                canvas.line(pageX(x + along), pageY(k.y + k.height), pageX(x + along), pageY(k.y), "thin");
                along += pitch;
            }
        }
    }
}


// Inner panels show where no front covers them, with the rails and the lights of their cells
function drawInside(v: CarcassView): void
{
    const { canvas, k, scale, pageX, pageY, a } = v;
    const t = k.thickness;
    const toPage = (pts: [number, number][]): [number, number][] =>
    {
        return onPage(v, pts);
    };
    const width = k.width;
    if (k.slope === null)
    {
        canvas.rect(pageX(k.x + t), pageY(k.y + k.height - t), (k.width - 2 * t) / scale, (k.height - 2 * t) / scale,
                    "thin");
    }
    else
    {
        canvas.poly(toPage([[t, t], [width - t, t], [width - t, ceilingAt(k, width - t)], [t, ceilingAt(k, t)]]), true,
                    "thin");
    }
    const doubling = topDoubling(k);
    if (doubling > 0)
    {
        canvas.rect(pageX(k.x + t), pageY(k.y + k.height - t), (k.width - 2 * t) / scale, doubling / scale, "thin");
    }
    for (const stiffener of k.stiffeners ?? [])
    {
        const nb = a.build.layouts.get(k.id)?.nodes.get(stiffener.cell);
        if (nb !== undefined)
        {
            // Hidden by the fronts, in plain sight with them taken off as the projection shows it
            canvas.rect(pageX(k.x + nb.x), pageY(k.y + nb.y + nb.h), nb.w / scale, stiffener.height / scale,
                        v.withFronts ? "dashed" : "thin");
        }
    }
    for (const divider of a.build.layouts.get(k.id)?.dividers ?? [])
    {
        // An upright reaching a sloped top ends in its bevel
        if (k.slope !== null && divider.axis === "v" && divider.y + divider.h >= k.height - 2 * t)
        {
            const x1 = divider.x + divider.w;
            canvas.poly(toPage([[divider.x, divider.y], [x1, divider.y], [x1, ceilingAt(k, x1)],
                                [divider.x, ceilingAt(k, divider.x)]]), true, "thin");
            continue;
        }
        canvas.rect(pageX(k.x + divider.x), pageY(k.y + divider.y + divider.h), divider.w / scale, divider.h / scale,
                    divider.kind === "adjustable" ? "dashed" : "thin");
    }
    const lay = a.build.layouts.get(k.id);
    for (const rail of lay === undefined ? [] : k.rails)
    {
        const railSpan = railPlan(k, lay!, rail);
        if (railSpan !== null)
        {
            canvas.rect(pageX(k.x + railSpan.cell.x), pageY(k.y + railSpan.axisY + RAIL_D / 2), railSpan.cell.w / scale,
                        RAIL_D / scale, "thin");
        }
    }
    for (const light of k.lights)  
    {
        const nb = lay?.nodes.get(light.cell);
        if (nb === undefined)
        {
            continue;
        }
        const y = pageY(k.y + lightLevel(nb, light)) + 0.6;
        if (light.kind === "spots")
        {
            for (const x of spotCentres(nb, light))
            {
                canvas.line(pageX(k.x + x - SPOT_RIM / 2), y, pageX(k.x + x + SPOT_RIM / 2), y, "thick");
            }
        }
        else
        {
            canvas.line(pageX(k.x + nb.x + FIT_PLAY), y, pageX(k.x + nb.x + nb.w - FIT_PLAY), y, "dashed");
        }
    }
}


// The fronts in white over the inside : the opening sign of a door, a flap or a leaf, a panel's cut-out
function drawFronts(v: CarcassView): void
{
    const { canvas, k, pageX, pageY, a, withFronts } = v;
    for (const fp of withFronts ? a.build.fronts.get(k.id) ?? [] : [])
    {
        const x0 = pageX(k.x + fp.rect.x);
        const x1 = pageX(k.x + fp.rect.x + fp.rect.w);
        const y0 = pageY(k.y + fp.rect.y + fp.rect.h);
        const y1 = pageY(k.y + fp.rect.y);
        const midY = (y0 + y1) / 2;
        canvas.rect(x0, y0, x1 - x0, y1 - y0, "thick", "#ffffff");
        if (fp.role === "door")
        {
            // The lines leave the opening side corners and meet in the middle of the hinge side
            const hingeX = fp.hinge === "left" ? x0 : x1;
            const openX = fp.hinge === "left" ? x1 : x0;
            canvas.poly([[openX, y0], [hingeX, midY], [openX, y1]], false, "thin");
        }
        else if (fp.role === "flap")
        {
            canvas.poly([[x0, y1], [(x0 + x1) / 2, y0], [x1, y1]], false, "thin");
        }
        else if (fp.role === "drop")
        {
            // Hinged along its bottom edge : the lines meet in the middle of it
            canvas.poly([[x0, y0], [(x0 + x1) / 2, y1], [x1, y0]], false, "thin");
        }
        else if (fp.role === "panel")
        {
            // A fixed panel has no handle, only its opening when it has one
            const spec = k.fronts.find((f) =>
            {
                return f.id === fp.front;
            })?.spec;
            const pts = spec?.type === "panel" ? openingPoints(fp, spec) : null;
            if (pts !== null)
            {
                canvas.poly(pts.map(([x, y]): [number, number] =>
                {
                    return [pageX(k.x + x), pageY(k.y + y)];
                }), true, "normal");
            }
        }
        else if (fp.role === "leaf")
        {
            canvas.line(x0 + 2, midY, x1 - 2, midY, "thin");
            canvas.arrowHead(x0 + 2, midY, 1, 0);
            canvas.arrowHead(x1 - 2, midY, -1, 0);
        }
        else
        {
            canvas.line((x0 + x1) / 2 - 3, midY, (x0 + x1) / 2 + 3, midY, "normal");
        }
    }
}


// Socket holes, as hidden lines behind a façade drawn on this sheet or inside a shelf
function drawOutlets(v: CarcassView): void
{
    const { canvas, k, scale, pageX, pageY, a, withFronts } = v;
    for (const o of a.build.outlets)
    {
        if (o.item !== k.id)
        {
            continue;
        }
        const s = o.edgeOn || (o.hidden && withFronts) ? "hidden" : "normal";
        if (o.shape === "round")
        {
            canvas.circle(pageX(k.x + o.x + o.w / 2), pageY(k.y + o.y + o.h / 2), o.w / 2 / scale, s);
        }
        else
        {
            canvas.rect(pageX(k.x + o.x), pageY(k.y + o.y + o.h), o.w / scale, o.h / scale, s);
        }
    }
}


// What the FreeCAD file builds an assembly for, projected there : the rest has no solid to project
const PROJECTED = new Set<Item["kind"]>(["carcass", "wallShelf"]);

// Room of a composition on the sheet, under its heading
const FREE = { left: MARGIN + 3, right: A3.w - MARGIN - 3, top: MARGIN + 14 };
const MAX_REDUCTION = 100;


// Baseline of line i of a legend of n lines, the last one just over the title block
function legendBaseline(n: number, i: number): number
{
    return A3.h - MARGIN - TITLE_BLOCK_H - 2 - (n - 1 - i) * 4;
}


export function composition(p: Project, a: Analysis, wall: Wall = "back"): Draft
{
    const items: Item[] = [];
    for (const it of p.items)
    {
        if (it.wall === wall)
        {
            items.push(it);
        }
    }
    const where = wall === "back" ? "vue de face" : WALL_LABELS[wall].toLowerCase();
    const all = projectExtent(items);
    // In an alcove the back wall shows its returns and its ceiling raound the items
    const room = p.room;
    const niche = wall === "back" && room.returns !== undefined;
    // The radiators, boxes and skirtings of this wall widen the view to show them
    const obstacles = room.obstacles.filter((obstacle) =>
    {
        return obstacle.wall === wall;
    });
    const frame = obstacles.reduce((extent, obstacle) =>
    {
        return { x0: Math.min(extent.x0, obstacle.x), x1: Math.max(extent.x1, obstacle.x + obstacle.width),
                 y0: Math.min(extent.y0, obstacle.y), y1: Math.max(extent.y1, obstacle.y + obstacle.height) };
    }, niche ? { x0: Math.min(all.x0, 0), x1: Math.max(all.x1, room.width), y0: Math.min(all.y0, 0),
                 y1: Math.max(all.y1, room.height) } : all);

    // The whole wall at 1:scale, the top left corner of its frame at (left, top) on the page. Heading and legend
    // stay where the sheet puts them, everything else moves with the corner
    const lay = (scale: number, left: number, top: number) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Composition, ${where}`);
        const from = canvas.prims.length;
        const originX = left - frame.x0 / scale;
        const originY = top + frame.y1 / scale;
        // On the back wall what has an assembly is TechDraw's to project : left out of the marks laid over it. A
        // device has no solid, still drawn by the sheet
        const drawn: [number, number][] = [];
        const projected: string[] = [];
        for (const it of items)
        {
            const start = canvas.prims.length;
            drawFront(canvas, it, scale, originX, originY, a);
            if (wall === "back" && PROJECTED.has(it.kind))
            {
                drawn.push([start, canvas.prims.length]);
                projected.push(it.id);
            }
        }
        // Every word of the view waits for the last line : written as it went, a later section line or chain ran
        // through it
        const pending: { t: string; size: number; bold: boolean; around: Box; first: TextPrim[] }[] = [];
        for (const obstacle of obstacles)
        {
            const box = { x: originX + obstacle.x / scale, y: originY - (obstacle.y + obstacle.height) / scale,
                          w: obstacle.width / scale, h: obstacle.height / scale };
            canvas.rect(box.x, box.y, box.w, box.h, "dashed");
            const named = `${OBSTACLE_LABELS[obstacle.kind]} ${obstacle.name}`;
            pending.push({ t: named, size: SMALL_TEXT, bold: false, around: box,
                           first: insideFirst(named, SMALL_TEXT, box) });
        }
        if (niche)
        {
            const [x0, x1, ceiling] = [originX, originX + room.width / scale, originY - room.height / scale];
            canvas.poly([[x0, originY], [x0, ceiling], [x1, ceiling], [x1, originY]], false, "thick");
            canvas.dimH(x0, x1, ceiling - 2, ceiling - 10, `${room.width}`);
        }
        const floorY = originY - all.y0 / scale;
        canvas.line(originX + frame.x0 / scale - 5, floorY, originX + frame.x1 / scale + 5, floorY, "thin");
        canvas.dimH(originX + all.x0 / scale, originX + all.x1 / scale, floorY + 2, floorY + 16,
                    round1(all.x1 - all.x0));
        canvas.dimV(originY - all.y1 / scale, floorY, originX + (frame.x0 / scale) - 2,
                    originX + (frame.x0 / scale) - 10, round1(all.y1 - all.y0));
        // What each item takes along the wall, a filler apart from the side it closes
        chain(canvas, items.filter((it) =>
        {
            return it.kind !== "device" && !(it.kind === "carcass" && it.freeStanding === true);
        }).flatMap((it) =>
        {
            const box = itemExtent(it);
            return it.kind === "carcass" ? [box.x0, box.x1, it.x, it.x + it.width] : [box.x0, box.x1];
        }), (along) =>
        {
            return originX + along / scale;
        }, floorY + 2, floorY + 8, "h");
        // Where the sections of this set are cut, a long line with its letter at each end
        for (const plane of sectionPlanes(p, a, wall))
        {
            if (plane.axis === "x")
            {
                const cutX = originX + plane.at / scale;
                const top = originY - (all.y1 / scale) - 4;
                canvas.line(cutX, top, cutX, floorY + 1, "centre");
                pending.push({ t: plane.letter, size: 3, bold: true, around: { x: cutX, y: top, w: 0, h: 0 },
                               first: [{ k: "text", x: cutX, y: top - 1, t: plane.letter, size: 3, anchor: "middle",
                                         bold: true, rot: 0 }] });
            }
            else
            {
                const cutY = originY - plane.at / scale;
                const start = originX + all.x0 / scale - 4;
                canvas.line(start, cutY, originX + (all.x1 / scale) + 1, cutY, "centre");
                pending.push({ t: plane.letter, size: 3, bold: true, around: { x: start, y: cutY, w: 0, h: 0 },
                               first: [{ k: "text", x: start - 2, y: cutY + 1, t: plane.letter, size: 3,
                                         anchor: "middle", bold: true, rot: 0 }] });
            }
        }
        // The levels on the right : floor, underside and top of each item, and the ceiling of an alcove
        const right = originX + frame.x1 / scale;
        chain(canvas, [0, ...items.flatMap((it) =>
        {
            const box = itemExtent(it);
            return [box.y0, box.y1];
        }), ...niche ? [room.height] : []], (level) =>
        {
            return originY - level / scale;
        }, right + 2, right + 9, "v");
        if (p.screen !== null && wall === "back")
        {
            const screen = p.screen;
            const { w, h } = screenSize(screen);
            if (screen.arm !== null && screen.arm.plateW > 0 && screen.arm.plateH > 0)
            {
                const arm = screen.arm;
                canvas.rect(originX + (arm.x - arm.plateW / 2) / scale, originY - (arm.y + arm.plateH / 2) / scale,
                            arm.plateW / scale, arm.plateH / scale, "thin");
            }
            // Put away in dashes, swung out on its arm in hidden line, named so the 2 are never mistaken
            for (const spot of screenSpots(screen))
            {
                const out = spot.label === "sorti";
                // A turned set covers its own width and part of its thickness along the wall
                const [x0, x1] = spotSpan(screen, spot);
                const box = { x: originX + x0 / scale, y: originY - (spot.bottom + h) / scale, w: (x1 - x0) / scale,
                              h: h / scale };
                canvas.rect(box.x, box.y, box.w, box.h, out ? "hidden" : "dashed");
                // On an arm the two outlines and the plate overlap : short names over the outlines, the swung one a
                // line higher, both centred on their own outline
                const cx = originX + spot.cx / scale;
                const caption = spot.label === ""
                    ? `Écran ${screen.diagonalInch}" (${Math.round(w)} x ${Math.round(h)})`
                    : out ? "sorti" : `Écran ${screen.diagonalInch}" rangé`;
                const captionY = spot.label === "" ? originY - (spot.bottom + h / 2) / scale
                    : originY - (spot.bottom + h) / scale - (out ? 5.5 : 1.5);
                pending.push({ t: caption, size: BODY, bold: false, around: box,
                               first: [{ k: "text", x: cx, y: captionY, t: caption, size: BODY, anchor: "middle",
                                         bold: false, rot: 0 }] });
            }
        }
        // A name wider htan its item becomes a numbered mark, read in the legend over the title block
        const marks: string[] = [];
        for (const it of items)
        {
            const box = itemExtent(it);
            const name = textWidth(it.name, 2.2) <= (box.x1 - box.x0) / scale ? it.name : `${marks.push(it.name)}`;
            const paper = { x: originX + box.x0 / scale, y: originY - box.y1 / scale, w: (box.x1 - box.x0) / scale,
                            h: (box.y1 - box.y0) / scale };
            // A wall shelf is too thin to hold a name : above it, where it always went
            const first = it.kind === "wallShelf"
                ? [{ k: "text" as const, x: paper.x + paper.w / 2, y: originY - (box.y1 + 40) / scale, t: name,
                     size: 2.2, anchor: "middle" as const, bold: true, rot: 0 as const }]
                : insideFirst(name, 2.2, paper, true);
            pending.push({ t: name, size: 2.2, bold: true, around: paper, first });
        }
        // Then all at once, each on the first free paper by its own item, the last line drawn
        const missing: string[] = [];
        for (const word of pending)
        {
            if (!writeNear(canvas, word.t, word.size, word.around, canvas.prims, word.first, word.bold))
            {
                missing.push(word.t);
            }
        }
        const legend = [...marks.length === 0 ? [] : wrap(`Repères : ${marks.map((m, i) =>
        {
            return `${i + 1} ${m}`;
        }).join(", ")}`, BODY, 390), ...missing.length === 0 ? [] : wrap(`Non écrits sur la vue faute de place : `
            + `${missing.join(", ")}`, BODY, 390)];
        return { canvas, from, drawn, projected, legend };
    };

    // The smallest reduction whose drawing, its figures and letters included, fills the room between the heading
    // and the legend : tried from 1:1 up, the first that fits is centred there
    const roomBelow = (lines: number) =>
    {
        return lines === 0 ? A3.h - MARGIN - TITLE_BLOCK_H - 3 : legendBaseline(lines, 0) - BODY - 3;
    };
    const freeW = FREE.right - FREE.left;
    let chosen = { scale: MAX_REDUCTION, ink: { x: 0, y: 0, w: 0, h: 0 }, freeH: 0 };
    for (let s = 1; s <= MAX_REDUCTION; s++)
    {
        const trial = lay(s, 0, 0);
        const ink = inkBox(trial.canvas.prims, trial.from) ?? { x: 0, y: 0, w: 0, h: 0 };
        chosen = { scale: s, ink, freeH: roomBelow(trial.legend.length) - FREE.top };
        if (ink.w <= freeW && ink.h <= chosen.freeH)
        {
            break;
        }
    }
    const { scale, ink, freeH } = chosen;
    const { canvas, drawn, projected, legend } = lay(scale, FREE.left - ink.x + (freeW - ink.w) / 2,
                                                     FREE.top - ink.y + Math.max(0, freeH - ink.h) / 2);
    legend.forEach((l, i) =>
    {
        canvas.text(MARGIN + 8, legendBaseline(legend.length, i), l, BODY);
    });
    const title = wall === "back" ? "Composition" : `Composition, ${where}`;
    const box = boxOf(drawn.flatMap(([s, e]) => { return canvas.prims.slice(s, e); }));
    if (box === null)
    {
        return { title, scale: `1:${scale}`, canvas };
    }
    const kept = canvas.prims.filter((_, i) => { return !drawn.some(([s, e]) => { return i >= s && i < e; }); });
    return { title, scale: `1:${scale}`, canvas, marks: kept, walls: [{ items: projected, scale, box }] };
}





