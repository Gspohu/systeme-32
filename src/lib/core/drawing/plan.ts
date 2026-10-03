// Setting out of the room seen from above, and the chans of dimensions the plans run along an edge

import type { Project } from "../model";
import { roomBox, sideWallDepth } from "../room";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, pickScale } from "./display";
import { heading, table, type Draft } from "./draft";

type ToPage = (value: number) => number;

const LEGEND_W = 150;


// Setting out, seen from above : the walls as far as they stand, every footprint, and a chain of dimensions along
// each wall that carry items, from its corner
export function roomPlan(p: Project): Draft
{
    const canvas = new Canvas();
    heading(canvas, "Implantation, vue de dessus");
    const room = p.room;
    const boxes = p.items.map((it) =>
    {
        return { it, b: roomBox(it, room) };
    });
    const left = sideWallDepth(room, "left");
    const right = sideWallDepth(room, "right");
    // an alcove is drawn as deep as it and the items reach, the room past it is not measured
    let shown = room.depth;
    if (room.returns !== undefined)
    {
        shown = Math.max(left, right, ...boxes.map((x) =>
        {
            return x.b.max[2];
        }));
        shown = Math.min(room.depth, shown + 400);
    }
    // the plan on the left, its legend in the right hand column
    const boxW = A3.w - 2 * MARGIN - 60 - LEGEND_W;
    const boxH = A3.h - 2 * MARGIN - TITLE_BLOCK_H - 60;
    const scale = pickScale(room.width, shown, boxW, boxH);
    const ox = MARGIN + 35 + (boxW - room.width / scale) / 2;
    const oy = MARGIN + 35;
    const pageX: ToPage = (x) =>
    {
        return ox + x / scale;
    };
    const pageZ: ToPage = (z) =>
    {
        return oy + z / scale;
    };
    // room x to the right, depth downwards : the back wall at the top of the sheet
    canvas.line(pageX(0), pageZ(0), pageX(room.width), pageZ(0), "thick");
    canvas.line(pageX(0), pageZ(0), pageX(0), pageZ(left), "thick");
    canvas.line(pageX(room.width), pageZ(0), pageX(room.width), pageZ(right), "thick");
    if (room.returns === undefined)
    {
        canvas.line(pageX(0), pageZ(room.depth), pageX(room.width), pageZ(room.depth), "thick");
        canvas.dimV(pageZ(0), pageZ(room.depth), pageX(0) - 2, pageX(0) - 10, `${room.depth}`);
    }
    else
    {
        // the returns end, the room opens out
        canvas.line(pageX(0), pageZ(left), pageX(0) - 4, pageZ(left), "thick");
        canvas.line(pageX(room.width), pageZ(right), pageX(room.width) + 4, pageZ(right), "thick");
        canvas.dimV(pageZ(0), pageZ(left), pageX(0) - 6, pageX(0) - 14, `${left}`);
        canvas.dimV(pageZ(0), pageZ(right), pageX(room.width) + 6, pageX(room.width) + 14, `${right}`);
    }
    canvas.dimH(pageX(0), pageX(room.width), pageZ(0) - 2, pageZ(0) - 10, `${room.width}`);
    // footprints overlap once items stand on or hang over others : open outlines, a mark at the front left corner
    // of each, the items sharing a corner sharing its mark, and the names in the legend
    const corners = new Map<string, { x: number; z: number; marks: number[] }>();
    const legend: string[][] = [];
    boxes.forEach(({ it, b }, i) =>
    {
        canvas.rect(pageX(b.min[0]), pageZ(b.min[2]), (b.max[0] - b.min[0]) / scale, (b.max[2] - b.min[2]) / scale,
                    "normal");
        const key = `${Math.round(b.min[0])},${Math.round(b.max[2])}`;
        corners.set(key, { x: b.min[0], z: b.max[2], marks: [...corners.get(key)?.marks ?? [], i + 1] });
        legend.push([`${i + 1}`, it.name, `${Math.round(b.max[0] - b.min[0])} x ${Math.round(b.max[2] - b.min[2])}`,
                     `${Math.round(b.min[1])}`]);
    });
    for (const { x, z, marks } of corners.values())
    {
        canvas.text(pageX(x) + 1.5, pageZ(z) - 1.5, marks.join(", "), 2.4, "start", true);
    }
    table(canvas, A3.w - MARGIN - LEGEND_W, MARGIN + 30, [12, 70, 34, 34],
          ["Repère", "Meuble", "Emprise", "Dessous à"], legend, 2.4, 4.5);
    // a chain along the back wall under the deepest of its items, one down each side wall beside its items
    const back = boxes.filter((x) =>
    {
        return x.it.wall === "back";
    });
    if (back.length > 0)
    {
        const deep = Math.max(...back.map((x) =>
        {
            return x.b.max[2];
        }));
        chain(canvas, [0, room.width, ...back.flatMap((x) =>
        {
            return [x.b.min[0], x.b.max[0]];
        })], pageX, pageZ(deep) + 2, pageZ(deep) + 9, "h");
    }
    for (const side of ["left", "right"] as const)
    {
        const on = boxes.filter((x) =>
        {
            return x.it.wall === side;
        });
        if (on.length === 0)
        {
            continue;
        }
        const reach = side === "left" ? Math.max(...on.map((x) =>
        {
            return x.b.max[0];
        })) : Math.min(...on.map((x) =>
        {
            return x.b.min[0];
        }));
        const dir = side === "left" ? 1 : -1;
        chain(canvas, [0, ...on.flatMap((x) =>
        {
            return [x.b.min[2], x.b.max[2]];
        })], pageZ, pageX(reach) + dir * 2, pageX(reach) + dir * 9, "v");
    }
    return { title: "Implantation", scale: `1:${scale}`, canvas };
}


// Consecutive dimensions between sorted page positions, the duplicates and slivers under 1 mm dropped
export function chain(canvas: Canvas, at: number[], page: ToPage, ref: number, line: number, dir: "h" | "v"): void
{
    const xs = [...new Set(at.map((v) =>
    {
        return Math.round(v);
    }))].sort((p, q) =>
    {
        return p - q;
    });
    for (let i = 0; i + 1 < xs.length; i++)
    {
        const label = `${xs[i + 1]! - xs[i]!}`;
        if (dir === "h")
        {
            canvas.dimH(page(xs[i]!), page(xs[i + 1]!), ref, line, label, 1.8);
        }
        else
        {
            const [p, q] = [page(xs[i]!), page(xs[i + 1]!)];
            canvas.dimV(Math.min(p, q), Math.max(p, q), ref, line, label, 1.8);
        }
    }
}
