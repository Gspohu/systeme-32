// Which edges of a board take a band : those left to sight, worked out from where eveyr board stands and not from
// its knid

import type { Project, Wall } from "./model";
import type { Build, Edge, Part } from "./part_types";
import type { Vec3 } from "./geometry";
import { toRoom, sideWallDepth } from "./room";
import { plainRectangle } from "./edge_bands";
import { decorById, materialOfDecor } from "../data/materials";

// An edge is hidden when what stands before it closes the view within that much, a touching board within the play
// of the workshop : the void behind a plinth of 100, the gap under a ceiling
export const SIGHT_CLOSED = 150;
const TOUCH = 0.5;
// The points of an edge looked out from : one every 50 mm, 2 in from its corners, at the middle of its thickness
const SAMPLE_PITCH = 50;
const CORNER_INSET = 2;

// The boards judged : those of the carcasses. Fronts and drawer boxes keep their own rule, every edge of a front
// banded as it show once open, a curved board its own outline
const JUDGED = new Set(["side", "top", "bottom", "shelf", "hdivider", "vdivider", "plinth", "lining"]);
// What moves hides nothing : a door, a drawer and its box open
const MOVING = new Set(["door", "drawerFront", "leaf", "flap", "panel", "boxSide", "boxEnd", "boxBottom"]);

interface Box
{
    o: Vec3;
    axes: [Vec3, Vec3, Vec3];
    size: Vec3;
}


function sub(a: Vec3, b: Vec3): Vec3
{
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}


function dot(a: Vec3, b: Vec3): number
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}


// A board in the coordinates of the room, whatever wall its item stands on
function boxOf(q: Part, wall: Wall, p: Project): Box
{
    const f = q.frame!;
    const room = (v: Vec3): Vec3 => { return toRoom(wall, p.room, v); };
    const o = room(f.o);
    const axis = (a: Vec3): Vec3 => { return sub(room([f.o[0] + a[0], f.o[1] + a[1], f.o[2] + a[2]]), o); };
    return { o, axes: [axis(f.u), axis(f.v), axis(f.n)], size: [q.length, q.width, q.thickness] };
}


// How far along the ray the box start, the slab of each axis widened by the play, null when missed
function enters(b: Box, from: Vec3, way: Vec3): number | null
{
    const rel = sub(from, b.o);
    let near = -Infinity;
    let far = Infinity;
    for (let k = 0; k < 3; k++)
    {
        const at = dot(rel, b.axes[k]!);
        const go = dot(way, b.axes[k]!);
        const [lo, hi] = [-TOUCH, b.size[k]! + TOUCH];
        if (Math.abs(go) < 1e-9)
        {
            if (at < lo || at > hi)
            {
                return null;
            }
            continue;
        }
        const t0 = (lo - at) / go;
        const t1 = (hi - at) / go;
        near = Math.max(near, Math.min(t0, t1));
        far = Math.min(far, Math.max(t0, t1));
    }
    return far >= Math.max(near, 0) ? Math.max(near, 0) : null;
}


// How far the floor, the ceiling or a wall of the room stands along the ray
function roomStop(p: Project, from: Vec3, way: Vec3): number
{
    const r = p.room;
    const stops: number[] = [];
    // Along axis k towards the plane at `at`, the room lying on the side of `inside`
    const plane = (k: number, at: number, inside: number): number | null =>
    {
        const go = way[k]!;
        if (Math.sign(go) !== Math.sign(at - inside) || Math.abs(go) < 1e-9)
        {
            return null;
        }
        return Math.max((at - from[k]!) / go, 0);
    };
    for (const t of [plane(1, 0, 1), plane(1, r.height, 0), plane(2, 0, 1)])
    {
        if (t !== null)
        {
            stops.push(t);
        }
    }
    for (const [at, inside, side] of [[0, 1, "left"], [r.width, 0, "right"]] as const)
    {
        const t = plane(0, at, inside);
        if (t !== null && from[2] + way[2] * t <= sideWallDepth(r, side) + TOUCH)
        {
            stops.push(t);
        }
    }
    return Math.min(Infinity, ...stops);
}


// Where an eye may stand : a grid over the floor, crouching, sitting and standing, outside every board. A lsot
// behind a filler open up to the ceiling is closed to them all
const EYE_PITCH = 600;
const EYE_HEIGHTS = [400, 1100, 1700];
// Off the face of the edge, clear of the boards it touches
const EYE_START = 1;

function eyes(p: Project, boxes: Box[]): Vec3[]
{
    const r = p.room;
    const steps = (to: number): number[] =>
    {
        const n = Math.max(1, Math.floor((to - EYE_PITCH) / EYE_PITCH));
        return Array.from({ length: n + 1 }, (_, k) => { return EYE_PITCH / 2 + (to - EYE_PITCH) * k / n; });
    };
    const out: Vec3[] = [];
    for (const x of steps(r.width))
    {
        for (const z of steps(r.depth))
        {
            for (const y of EYE_HEIGHTS)
            {
                const e: Vec3 = [x, y, z];
                if (!boxes.some((b) => { return enters(b, e, [0, 1, 0]) === 0 && enters(b, e, [0, -1, 0]) === 0; }))
                {
                    out.push(e);
                }
            }
        }
    }
    return out;
}


// Whether an eye sees that point of an edge, the edge turned to it and nothing fixed in bteween
function seen(from: Vec3, way: Vec3, eyesAt: Vec3[], blocking: Box[]): boolean
{
    const start: Vec3 = [from[0] + way[0] * EYE_START, from[1] + way[1] * EYE_START, from[2] + way[2] * EYE_START];
    return eyesAt.some((e) =>
    {
        const d = sub(e, start);
        const far = Math.hypot(d[0], d[1], d[2]);
        const go: Vec3 = [d[0] / far, d[1] / far, d[2] / far];
        if (dot(go, way) <= 0)
        {
            return false;
        }
        return !blocking.some((b) => { const t = enters(b, start, go); return t !== null && t < far; });
    });
}


// Points along an edge and the way it looks, in the coordinates of the room
function looks(q: Part, b: Box, e: Edge): { from: Vec3[]; way: Vec3 }
{
    const along = e[0] === "u" ? q.width : q.length;
    const n = Math.max(2, Math.ceil((along - 2 * CORNER_INSET) / SAMPLE_PITCH) + 1);
    const at = (s: number): [number, number] =>
    {
        const end = e[1] === "0" ? 0 : e[0] === "u" ? q.length : q.width;
        return e[0] === "u" ? [end, s] : [s, end];
    };
    const from = Array.from({ length: n }, (_, k) =>
    {
        const s = CORNER_INSET + (along - 2 * CORNER_INSET) * k / (n - 1);
        const [u, v] = at(s);
        const w = q.thickness / 2;
        return [0, 1, 2].map((i) => { return b.o[i]! + u * b.axes[0][i]! + v * b.axes[1][i]! + w *
                                     b.axes[2][i]!; }) as Vec3;
    });
    const a = e[0] === "u" ? b.axes[0] : b.axes[1];
    const sign = e[1] === "0" ? -1 : 1;
    return { from, way: [a[0] * sign, a[1] * sign, a[2] * sign] };
}


// Bands the edges left to sight : hidden when fixed boards or the room close every view within SIGHT_CLOSED
// A loose item is judged alone, it hieds nothing
export function bandVisibleEdges(p: Project, b: Build): void
{
    const items = new Map(p.items.map((it) => { return [it.id, it]; }));
    const loose = (q: Part): boolean => { const it = items.get(q.item); return it?.kind === "carcass" &&
                                         it.freeStanding === true; };
    const boxes = new Map<Part, Box>();
    for (const q of b.parts)
    {
        const it = items.get(q.item);
        if (q.frame !== null && q.curve === null && it !== undefined && "wall" in it)
        {
            boxes.set(q, boxOf(q, it.wall, p));
        }
    }
    const blockers = [...boxes.keys()].filter((q) => { return !MOVING.has(q.role) && !q.id.includes("/pull-out/"); });
    const fixedBoxes = blockers.filter((q) => { return !loose(q); }).map((q) => { return boxes.get(q)!; });
    const eyesAt = eyes(p, fixedBoxes);
    for (const q of b.parts)
    {
        const box = boxes.get(q);
        // A glass shelf takes no banding wherever it shows
        if (box === undefined || !JUDGED.has(q.role) || !plainRectangle(q.outline, q.length, q.width)
            || materialOfDecor(decorById(q.decor)).kind === "glass")
        {
            continue;
        }
        const alone = loose(q);
        const others = blockers.filter((x) => { return x !== q && (alone ? x.item === q.item : !loose(x) ||
                                                                   x.item === q.item); });
        const otherBoxes = others.map((x) => { return boxes.get(x)!; });
        const edges: Edge[] = ["u0", "u1", "v0", "v1"];
        q.edges = edges.filter((e) =>
        {
            const { from, way } = looks(q, box, e);
            return from.some((pt) =>
            {
                let stop = alone ? Infinity : roomStop(p, pt, way);
                for (const x of others)
                {
                    const t = enters(boxes.get(x)!, pt, way);
                    if (t !== null && t < stop)
                    {
                        stop = t;
                    }
                }
                return stop > SIGHT_CLOSED && (alone || seen(pt, way, eyesAt, otherBoxes));
            });
        });
    }
}
