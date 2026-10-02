// Front views of the items, the composition sheet of each wall and the room lpan

import type { Carcass, Item, Project, Wall } from "../model";
import { roomBox, WALL_LABELS } from "../room";
import { openingPoints } from "../cutouts";
import type { Analysis } from "../analysis";
import { PLINTH_FOOT_GAP, baseHeight } from "../parts";
import { endReach, itemExtent, projectExtent, screenSize } from "../extent";
import { slatLayout } from "../slats";
import { ceilingAt, frontOutline } from "../slope";
import { FIT_PLAY, RAIL_D, railPlan } from "../wardrobe";
import { SPOT_RIM, spotCentres } from "../lights";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, fit, pickScale } from "./display";
import { BODY, heading, type Draft } from "./draft";
import { fittedExtent } from "../fitted";

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
    canvas.rect(pageX(box.x0), pageY(box.y1), (box.x1 - box.x0) / scale, (box.y1 - box.y0) / scale, "normal");
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


function drawCarcass(canvas: Canvas, k: Carcass, scale: number, pageX: ToPage, pageY: ToPage, a: Analysis,
                     withFronts: boolean): void
{
    const bh = baseHeight(k);
    const t = k.thickness;
    const at = (pts: [number, number][]): [number, number][] =>
    {
        return pts.map(([x, y]): [number, number] => { return [pageX(k.x + x), pageY(k.y + y)]; });
    };
    if (k.slope === null)
    {
        canvas.rect(pageX(k.x), pageY(k.y + k.height), k.width / scale, k.height / scale, "normal");
    }
    else
    {
        canvas.poly(at(frontOutline(k)), true, "normal");
    }
    // the filler as the analysis built it, up to the ceiling of the room
    const filler = a.build.parts.find((q) =>
    {
        return q.id === `${k.id}/filler`;
    });
    if (filler !== undefined)
    {
        canvas.rect(pageX(k.x), pageY(k.y + k.height + filler.width), k.width / scale, filler.width / scale, "normal");
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
        canvas.rect(pageX(k.x), pageY(k.y - PLINTH_FOOT_GAP), k.width / scale, (bh - PLINTH_FOOT_GAP) / scale, "thin");
    }
    // the feet behind a plinth are hidden lines, the runner spaces only show where no front covers them
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
    for (const side of ["left", "right"] as const)
    {
        const end = k.ends[side];
        if (end.type !== "rounded")
        {
            continue;
        }
        const reach = endReach(k, side);
        const x = side === "right" ? k.x + k.width : k.x - reach;
        canvas.rect(pageX(x), pageY(k.y + k.height), reach / scale, k.height / scale, "normal");
        if (end.technique === "battens")
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
    // inner panels show where no front covers them
    const W = k.width;
    if (k.slope === null)
    {
        canvas.rect(pageX(k.x + t), pageY(k.y + k.height - t), (k.width - 2 * t) / scale, (k.height - 2 * t) / scale,
                    "thin");
    }
    else
    {
        canvas.poly(at([[t, t], [W - t, t], [W - t, ceilingAt(k, W - t)], [t, ceilingAt(k, t)]]), true, "thin");
    }
    for (const d of a.build.layouts.get(k.id)?.dividers ?? [])
    {
        // an upright reaching a sloped top ends in its bevel
        if (k.slope !== null && d.axis === "v" && d.y + d.h >= k.height - 2 * t)
        {
            const x1 = d.x + d.w;
            canvas.poly(at([[d.x, d.y], [x1, d.y], [x1, ceilingAt(k, x1)], [d.x, ceilingAt(k, d.x)]]), true, "thin");
            continue;
        }
        canvas.rect(pageX(k.x + d.x), pageY(k.y + d.y + d.h), d.w / scale, d.h / scale,
                    d.kind === "adjustable" ? "dashed" : "thin");
    }
    const lay = a.build.layouts.get(k.id);
    for (const r of lay === undefined ? [] : k.rails)
    {
        const rp = railPlan(k, lay!, r);
        if (rp !== null)
        {
            canvas.rect(pageX(k.x + rp.cell.x), pageY(k.y + rp.axisY + RAIL_D / 2), rp.cell.w / scale, RAIL_D /
                        scale, "thin");
        }
    }
    for (const l of k.lights)
    {
        const nb = lay?.nodes.get(l.cell);
        if (nb === undefined)
        {
            continue;
        }
        const y = pageY(k.y + nb.y + nb.h) + 0.6;
        if (l.kind === "spots")
        {
            for (const x of spotCentres(nb, l))
            {
                canvas.line(pageX(k.x + x - SPOT_RIM / 2), y, pageX(k.x + x + SPOT_RIM / 2), y, "thick");
            }
        }
        else
        {
            canvas.line(pageX(k.x + nb.x + FIT_PLAY), y, pageX(k.x + nb.x + nb.w - FIT_PLAY), y, "dashed");
        }
    }
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
            // the lines leave the opening side corners and meet in the middle of the hinge side
            const hingeX = fp.hinge === "left" ? x0 : x1;
            const openX = fp.hinge === "left" ? x1 : x0;
            canvas.poly([[openX, y0], [hingeX, midY], [openX, y1]], false, "thin");
        }
        else if (fp.role === "flap")
        {
            canvas.poly([[x0, y1], [(x0 + x1) / 2, y0], [x1, y1]], false, "thin");
        }
        else if (fp.role === "panel")
        {
            // a fixed panel has no handle, only its opening when it has one
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


export function composition(p: Project, a: Analysis, wall: Wall = "back"): Draft
{
    const canvas = new Canvas();
    const items: Item[] = [];
    for (const it of p.items)
    {
        if (it.wall === wall)
        {
            items.push(it);
        }
    }
    const where = wall === "back" ? "vue de face" : WALL_LABELS[wall].toLowerCase();
    heading(canvas, `Composition, ${where}`);
    const all = projectExtent(items);
    const boxW = A3.w - 2 * MARGIN - 40;
    const boxH = A3.h - 2 * MARGIN - TITLE_BLOCK_H - 40;
    const scale = pickScale(all.x1 - all.x0, all.y1 - all.y0, boxW, boxH);
    const ox = MARGIN + 25 - all.x0 / scale + (boxW - (all.x1 - all.x0) / scale) / 2;
    const oy = MARGIN + 25 + boxH - (boxH - (all.y1 - all.y0) / scale) / 2 + all.y0 / scale;
    for (const it of items)
    {
        drawFront(canvas, it, scale, ox, oy, a);
    }
    const floorY = oy - all.y0 / scale;
    canvas.line(ox + all.x0 / scale - 5, floorY, ox + all.x1 / scale + 5, floorY, "thin");
    canvas.dimH(ox + all.x0 / scale, ox + all.x1 / scale, floorY + 2, floorY + 10, `${Math.round(all.x1 - all.x0)}`);
    canvas.dimV(oy - all.y1 / scale, floorY, ox + all.x0 / scale - 2, ox + all.x0 / scale - 10,
                `${Math.round(all.y1 - all.y0)}`);
    if (p.screen !== null && wall === "back")
    {
        const sc = p.screen;
        const { w, h } = screenSize(sc);
        canvas.rect(ox + (sc.cx - w / 2) / scale, oy - (sc.bottom + h) / scale, w / scale, h / scale, "dashed");
        const label = `Écran ${sc.diagonalInch}" (${Math.round(w)} x ${Math.round(h)})`;
        canvas.text(ox + sc.cx / scale, oy - (sc.bottom + h / 2) / scale, label, BODY, "middle");
    }
    for (const it of items)
    {
        const box = itemExtent(it);
        const lx = (box.x0 + box.x1) / 2;
        const ly = it.kind === "wallShelf" ? box.y1 + 40 : (box.y0 + box.y1) / 2;
        canvas.text(ox + lx / scale, oy - ly / scale, fit(it.name, 2.2, (box.x1 - box.x0) / scale), 2.2, "middle", true);
    }
    return { title: wall === "back" ? "Composition" : `Composition, ${where}`, scale: `1:${scale}`, canvas };
}


// Top view of the room : its walls and the footprint of every item, fronts towards the room
export function roomPlan(p: Project): Draft
{
    const canvas = new Canvas();
    heading(canvas, "Plan de la pièce, vue de dessus");
    const r = p.room;
    const boxW = A3.w - 2 * MARGIN - 40;
    const boxH = A3.h - 2 * MARGIN - TITLE_BLOCK_H - 40;
    const scale = pickScale(r.width, r.depth, boxW, boxH);
    const ox = MARGIN + 25 + (boxW - r.width / scale) / 2;
    const oy = MARGIN + 25;
    // room x to the right, depth downwards : the back wall at the top of the sheet
    canvas.rect(ox, oy, r.width / scale, r.depth / scale, "thick");
    canvas.dimH(ox, ox + r.width / scale, oy + r.depth / scale + 2, oy + r.depth / scale + 10, `${r.width}`);
    canvas.dimV(oy, oy + r.depth / scale, ox - 2, ox - 10, `${r.depth}`);
    for (const it of p.items)
    {
        const b = roomBox(it, r);
        const x = ox + b.min[0] / scale;
        const y = oy + b.min[2] / scale;
        const w = (b.max[0] - b.min[0]) / scale;
        const d = (b.max[2] - b.min[2]) / scale;
        canvas.rect(x, y, w, d, "normal", "#ffffff");
        canvas.text(x + w / 2, y + d / 2, fit(it.name, 2.2, w), 2.2, "middle", true);
    }
    return { title: "Plan", scale: `1:${scale}`, canvas };
}



