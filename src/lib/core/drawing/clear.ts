// Words writen on free paper only : no line, outline or other text runs through what a sheet prints

import { A3, Canvas, MARGIN, TITLE_BLOCK_H, TITLE_BLOCK_W, inkBox, inkedBoxes, type Prim } from "./display";

export type Box = { x: number; y: number; w: number; h: number };
export type TextPrim = Extract<Prim, { k: "text" }>;

// Clear paper kept round a text, mm
export const MARK_AIR = 0.4;
// Rings of places tried round a box before giving up, each 1.25 mm further out
const RINGS = 24;


// A text written where its ink touches nothing drawn : the places it prefers first, then round the box it names
// above, under and beside it, moving out ring by ring. False when the sheet has no room left for it
export function writeNear(canvas: Canvas, t: string, size: number, around: Box, drawn: Prim[], first: TextPrim[] = [],
                          bold = false): boolean
{
    const busy = drawn.flatMap((q) => { return inkedBoxes(q); });
    const blockX = A3.w - MARGIN - TITLE_BLOCK_W;
    const blockY = A3.h - MARGIN - TITLE_BLOCK_H;
    const clear = (b: Box): boolean =>
    {
        const room = { x: b.x - MARK_AIR, y: b.y - MARK_AIR, w: b.w + 2 * MARK_AIR, h: b.h + 2 * MARK_AIR };
        const onSheet = b.x >= MARGIN && b.y >= MARGIN && b.x + b.w <= A3.w - MARGIN && b.y + b.h <= A3.h - MARGIN
            && !(b.x + b.w > blockX && b.y + b.h > blockY);
        return onSheet && !busy.some((o) =>
        {
            return room.x < o.x + o.w && o.x < room.x + room.w && room.y < o.y + o.h && o.y < room.y + room.h;
        });
    };
    const [cx, cy] = [around.x + around.w / 2, around.y + around.h / 2];
    const tries: TextPrim[] = [...first];
    for (let ring = 0; ring < RINGS; ring++)
    {
        const gap = MARK_AIR + 0.4 + ring * 1.25;
        const at = (x: number, y: number, anchor: TextPrim["anchor"]): TextPrim =>
        {
            return { k: "text", x, y, t, size, anchor, bold, rot: 0 };
        };
        tries.push(at(cx, around.y - gap, "middle"), at(cx, around.y + around.h + gap + size, "middle"),
                   at(around.x + around.w + gap, cy + size * 0.35, "start"), at(around.x - gap, cy + size * 0.35, "end"),
                   at(around.x + around.w + gap, around.y - gap, "start"), at(around.x - gap, around.y - gap, "end"),
                   at(around.x + around.w + gap, around.y + around.h + gap + size, "start"),
                   at(around.x - gap, around.y + around.h + gap + size, "end"));
    }
    const chosen = tries.find((q) => { return clear(inkBox([q])!); });
    if (chosen === undefined)
    {
        return false;
    }
    canvas.text(chosen.x, chosen.y, t, size, chosen.anchor, bold, chosen.rot ?? 0);
    return true;
}


// Places inside a box first, along its middle from the centre outwards : a name stay on the item it names
export function insideFirst(t: string, size: number, b: Box, bold = false): TextPrim[]
{
    const out: TextPrim[] = [];
    const cx = b.x + b.w / 2;
    for (let k = 0; k * 1.25 <= b.h / 2; k++)
    {
        for (const sign of k === 0 ? [1] : [-1, 1])
        {
            out.push({ k: "text", x: cx, y: b.y + b.h / 2 + sign * k * 1.25 + size * 0.35, t, size, anchor: "middle",
                       bold, rot: 0 });
        }
    }
    return out;
}
