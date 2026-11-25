// Setting out of the room seen from above, and the chans of dimensions the plans run along an edge

import type { Project } from "../model";
import { boxToRoom, roomBox, sideWallDepth } from "../room";
import { OBSTACLE_LABELS, obstacleBox } from "../obstacles";
import { A3, Canvas, MARGIN, SMALL_TEXT, TITLE_BLOCK_H, inkBox, inkedBoxes, labelGap, pickScale,
    textWidth } from "./display";
import { heading, table, type Draft } from "./draft";
import { writeNear, type Box, type TextPrim } from "./clear";
import { round1 } from "../text";

type ToPage = (value: number) => number;

const LEGEND_W = 150;


// Setting out, seen from above : the walls as far as they stand, every footprint, and a chain of dimensions along
// each wall that carry items, from its corner
export function roomPlan(project: Project): Draft
{
    const canvas = new Canvas();
    heading(canvas, "Implantation, vue de dessus");
    const room = project.room;
    const boxes = project.items.map((it) =>
    {
        return { it, area: roomBox(it, room) };
    });
    const left = sideWallDepth(room, "left");
    const right = sideWallDepth(room, "right");
    // An alcove is drawn as deep as it and the items reach, the room past it isn't measured
    let shown = room.depth;
    if (room.returns !== undefined)
    {
        shown = Math.max(left, right, ...boxes.map((x) =>
        {
            return x.area.max[2];
        }));
        shown = Math.min(room.depth, shown + 400);
    }
    // The plan on the left, its legend in the right hand column
    const boxW = A3.w - 2 * MARGIN - 60 - LEGEND_W;
    const boxH = A3.h - 2 * MARGIN - TITLE_BLOCK_H - 60;
    const scale = pickScale(room.width, shown, boxW, boxH);
    const originX = MARGIN + 35 + (boxW - room.width / scale) / 2;
    const originY = MARGIN + 35;
    const pageX: ToPage = (x) =>
    {
        return originX + x / scale;
    };
    const pageZ: ToPage = (z) =>
    {
        return originY + z / scale;
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
        // The returns end, the room opens out
        canvas.line(pageX(0), pageZ(left), pageX(0) - 4, pageZ(left), "thick");
        canvas.line(pageX(room.width), pageZ(right), pageX(room.width) + 4, pageZ(right), "thick");
        canvas.dimV(pageZ(0), pageZ(left), pageX(0) - 6, pageX(0) - 14, `${left}`);
        canvas.dimV(pageZ(0), pageZ(right), pageX(room.width) + 6, pageX(room.width) + 14, `${right}`);
    }
    canvas.dimH(pageX(0), pageX(room.width), pageZ(0) - 2, pageZ(0) - 10, `${room.width}`);
    // What stands on the walls, seen from above against its wall
    // Its words wait for the chains : written as it went, a chain ran through a 30 and a mark 2
    const pending: { t: string; size: number; bold: boolean; around: Box; first: TextPrim[] }[] = [];
    for (const obstacle of room.obstacles)
    {
        const walled = boxToRoom(obstacle.wall, room, obstacleBox(obstacle));
        const box = { x: pageX(walled.min[0]), y: pageZ(walled.min[2]), w: (walled.max[0] - walled.min[0]) / scale,
                      h: (walled.max[2] - walled.min[2]) / scale };
        canvas.rect(box.x, box.y, box.w, box.h, "dashed");
        const t = `${OBSTACLE_LABELS[obstacle.kind]} ${obstacle.name}`;
        pending.push({ t, size: SMALL_TEXT, bold: false, around: box,
                       first: [{ k: "text", x: box.x + box.w / 2, y: pageZ(walled.max[2]) + 3, t, size: SMALL_TEXT,
                                 anchor: "middle", bold: false, rot: 0 }] });
    }
    // Footprints overlap once items stand on or hang over others : open outlines, a mark at the front left corner
    // of each, the items sharing a corner sharing its mark, and the names in the legend
    const corners = new Map<string, { x: number; z: number; marks: number[] }>();
    const legend: string[][] = [];
    boxes.forEach(({ it, area }, i) =>
    {
        canvas.rect(pageX(area.min[0]), pageZ(area.min[2]), (area.max[0] - area.min[0]) / scale,
                    (area.max[2] - area.min[2]) / scale, "normal");
        const key = `${Math.round(area.min[0])},${Math.round(area.max[2])}`;
        corners.set(key, { x: area.min[0], z: area.max[2], marks: [...corners.get(key)?.marks ?? [], i + 1] });
        legend.push([`${i + 1}`, it.name,
                     `${Math.round(area.max[0] - area.min[0])} x ${Math.round(area.max[2] - area.min[2])}`,
                     `${Math.round(area.min[1])}`]);
    });
    for (const { x, z, marks } of corners.values())
    {
        const t = marks.join(", ");
        pending.push({ t, size: 2.4, bold: true, around: { x: pageX(x), y: pageZ(z), w: 0, h: 0 },
                       first: [{ k: "text", x: pageX(x) + 1.5, y: pageZ(z) - 1.5, t, size: 2.4, anchor: "start",
                                 bold: true, rot: 0 }] });
    }
    table(canvas, A3.w - MARGIN - LEGEND_W, MARGIN + 30, [12, 70, 34, 34],
          ["Repère", "Meuble", "Emprise", "Dessous à"], legend, 2.4, 4.5);
    // A chain along the back wall under the deepest of its items, one down each side wall beside its items
    const back = boxes.filter((x) =>
    {
        return x.it.wall === "back";
    });
    if (back.length > 0)
    {
        const deep = Math.max(...back.map((x) =>
        {
            return x.area.max[2];
        }));
        chain(canvas, [0, room.width, ...back.flatMap((x) =>
        {
            return [x.area.min[0], x.area.max[0]];
        })], pageX, pageZ(deep) + 2, pageZ(deep) + 9, "h");
    }
    for (const side of ["left", "right"] as const)
    {
        const against = boxes.filter((x) =>
        {
            return x.it.wall === side;
        });
        if (against.length === 0)
        {
            continue;
        }
        const reach = side === "left" ? Math.max(...against.map((x) =>
        {
            return x.area.max[0];
        })) : Math.min(...against.map((x) =>
        {
            return x.area.min[0];
        }));
        const dir = side === "left" ? 1 : -1;
        chain(canvas, [0, ...against.flatMap((x) =>
        {
            return [x.area.min[2], x.area.max[2]];
        })], pageZ, pageX(reach) + dir * 2, pageX(reach) + dir * 9, "v");
    }
    // A mark with no free paper by its corner is still in the table, its line read by its number
    for (const word of pending)
    {
        writeNear(canvas, word.t, word.size, word.around, canvas.prims, word.first, word.bold);
    }
    return { title: "Implantation", scale: `1:${scale}`, canvas };
}


// Consecutive dimensions between sorted page positions, the duplicates and slivers under 1 mm dropped
// Returns the outermost level a figure took, 0 when all sit between their arrows
export function chain(canvas: Canvas, at: number[], page: ToPage, ref: number, line: number, dir: "h" | "v",
    size = SMALL_TEXT): number
{
    const xs = [...new Set(at.map((v) =>
    {
        return Math.round(v * 10) / 10;
    }))].sort((p, q) =>
    {
        return p - q;
    });
    const out = Math.sign(line - ref);
    const segs = xs.slice(1).map((x, i) =>
    {
        const [p, q] = [page(xs[i]!), page(x)];
        const label = round1(x - xs[i]!);
        return { p: Math.min(p, q), q: Math.max(p, q), label, fits: textWidth(label, size) + 1 <= Math.abs(q - p) };
    });
    // Where a figure prints at a level : between its arrows over the line at 0, past the line beyond, its ink
    // starting past the 1 mm the extension lines overrun it by with some air (a text inks from size above its
    // baseline to a quarter under it, inkBox)
    const figureAt = (s: (typeof segs)[number], level: number, slide = 0): TextPrim =>
    {
        const mid = (s.p + s.q) / 2 + slide;
        const edge = line + out * (CHAIN_CLEAR + (level - 1) * (size + 0.8));
        const baseline = level === 0 ? line - labelGap(size) : out > 0 ? edge + size : edge - 0.25 * size;
        return dir === "h" ? { k: "text", x: mid, y: baseline, t: s.label, size, anchor: "middle", bold: false, rot: 0 }
            : { k: "text", x: baseline, y: mid, t: s.label, size, anchor: "middle", bold: false, rot: 90 };
    };
    // What the sheet holds before the chain : a figure pushed out never lands on a wall drawn there
    const busy = canvas.prims.flatMap((q) => { return inkedBoxes(q); });
    const inked = (q: TextPrim): boolean =>
    {
        const b = inkBox([q])!;
        return busy.some((o) => { return b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h; });
    };
    // A figure longer than its segment steps away frm the line, outwards, to the first level where it overlaps
    // no other figure and nothing drawn : still facing its own segment
    const taken: [number, number][][] = [];
    // Past a level, a figure may slide along the line by these steps : a wall standing across the chain blocks
    // every level at the middle of its segment, a 30 beside the wall stayed on it
    const slides = [0, ...[1, 2, 3, 4].flatMap((k) => { return [k * 1.25, -k * 1.25]; })];
    const place = (s: (typeof segs)[number]): { level: number; slide: number } =>
    {
        const half = textWidth(s.label, size) / 2 + 0.5;
        const free = (level: number, slide: number): boolean =>
        {
            const [a, b] = [(s.p + s.q) / 2 + slide - half, (s.p + s.q) / 2 + slide + half];
            return !(taken[level] ?? []).some(([c, d]) => { return a < d && c < b; }) && !inked(figureAt(s,
                level, slide));
        };
        // One that doesn't fit never stays between its arrows, even with nothing beside it : the extension lines of
        // a 19 mm board ran through its figure on the sections. Between its arrows it never slides
        let chosen = { level: MAX_CHAIN_LEVEL, slide: 0 };
        for (let level = s.fits ? 0 : 1; level < MAX_CHAIN_LEVEL; level++)
        {
            const slide = (level === 0 ? [0] : slides).find((d) => { return free(level, d); });
            if (slide !== undefined)
            {
                chosen = { level, slide };
                break;
            }
        }
        const mid = (s.p + s.q) / 2 + chosen.slide;
        taken[chosen.level] = [...(taken[chosen.level] ?? []), [mid - half, mid + half]];
        return chosen;
    };
    const levels = new Map<(typeof segs)[number], { level: number; slide: number }>();
    // The figures that fit between their arrows first, the ones pushed outside take the levels left
    const fitting = segs.filter((x) =>
    {
        return x.fits;
    });
    const outside = segs.filter((x) =>
    {
        return !x.fits;
    });
    for (const s of [...fitting, ...outside])
    {
        levels.set(s, place(s));
    }
    for (const s of segs)
    {
        const { level, slide } = levels.get(s)!;
        if (dir === "h")
        {
            canvas.dimH(s.p, s.q, ref, line, "", size);
        }
        else
        {
            canvas.dimV(s.p, s.q, ref, line, "", size);
        }
        const f = figureAt(s, level, slide);
        canvas.text(f.x, f.y, f.t, f.size, f.anchor, false, f.rot ?? 0);
    }
    return levels.size === 0 ? 0 : Math.max(...[...levels.values()].map((v) => { return v.level; }));
}


// Paper between a chain's line and the ink of a figure pushed out of it : the 1 mm its extension lines run past it
// and some air
const CHAIN_CLEAR = 1.4;
// Levels a figure may step out to before it stays where it is
const MAX_CHAIN_LEVEL = 12;
