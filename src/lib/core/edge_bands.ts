// The edge banding of a board of any outline : which of its segments are banded, how long the banding runs, and the
// outline of the board under it, its banded segments moved in by the thickness of the banding

import type { Outline, Segment } from "./geometry";
import type { Edge } from "./part_types";

type Pt = [number, number];
// The line or the circle a segment runs on
type Carrier = { kind: "line"; p: Pt; d: Pt } | { kind: "circle"; c: Pt; r: number };

const NEAR = 0.01;


// The outline of a board is its plain rectangle : 4 straight sides from its origin, as the build reads it
export function plainRectangle(o: Outline, length: number, width: number): boolean
{
    const corners = [[length, 0], [length, width], [0, width], [0, 0]];
    return o.start[0] === 0 && o.start[1] === 0 && o.segments.length === 4 && o.segments.every((s, k) =>
    {
        return s.kind === "line" && Math.abs(s.x - corners[k]![0]!) < NEAR && Math.abs(s.y - corners[k]![1]!) < NEAR;
    });
}


// The segments of an outline, each with where it starts, a segment of no lenght left out
function walk(o: Outline): { from: Pt; s: Segment }[]
{
    const out: { from: Pt; s: Segment }[] = [];
    let at: Pt = [o.start[0], o.start[1]];
    for (const s of o.segments)
    {
        if (Math.hypot(s.x - at[0], s.y - at[1]) > NEAR || s.kind === "arc")
        {
            out.push({ from: at, s });
        }
        at = [s.x, s.y];
    }
    return out;
}


// Banded : a line lying on a side its board says banded, and every arc, never agianst another board
export function bandedSegments(o: Outline, length: number, width: number, edges: Edge[]): boolean[]
{
    const on = (e: Edge, a: Pt, b: Pt): boolean =>
    {
        const [k, value] = e === "u0" ? [0, 0] : e === "u1" ? [0, length] : e === "v0" ? [1, 0] : [1, width];
        return Math.abs(a[k]! - value) < NEAR && Math.abs(b[k]! - value) < NEAR;
    };
    return walk(o).map(({ from, s }) =>
    {
        return s.kind === "arc" ? edges.length > 0 : edges.some((e) => { return on(e, from, [s.x, s.y]); });
    });
}


function sweep(from: Pt, s: Segment & { kind: "arc" }): number
{
    const a0 = Math.atan2(from[1] - s.cy, from[0] - s.cx);
    const a1 = Math.atan2(s.y - s.cy, s.x - s.cx);
    let d = s.ccw ? a1 - a0 : a0 - a1;
    while (d <= 0)
    {
        d += 2 * Math.PI;
    }
    return d;
}


// The banded segments themselves, each with where it starts : what the drawings show as banded
export function bandedPieces(o: Outline, length: number, width: number, edges: Edge[]): { from: [number,
    number]; s: Segment }[]
{
    const banded = bandedSegments(o, length, width, edges);
    return walk(o).filter((_, k) => { return banded[k]; });
}


// How long the banding runs, arcs at their true length
export function bandLength(o: Outline, length: number, width: number, edges: Edge[]): number
{
    const banded = bandedSegments(o, length, width, edges);
    return walk(o).reduce((sum, { from, s }, k) =>
    {
        if (!banded[k])
        {
            return sum;
        }
        return sum + (s.kind === "line" ? Math.hypot(s.x - from[0], s.y - from[1]) : Math.hypot(from[0] - s.cx,
            from[1] - s.cy) * sweep(from, s));
    }, 0);
}


// Twice the signed area of the outline drawn as its corners : positive when it turns counterclockwise
function turn(segments: { from: Pt; s: Segment }[]): number
{
    return segments.reduce((sum, { from, s }) => { return sum + from[0] * s.y - s.x * from[1]; }, 0);
}


function intersect(a: Carrier, b: Carrier, near: Pt): Pt | null
{
    if (a.kind === "line" && b.kind === "line")
    {
        const det = a.d[0] * b.d[1] - a.d[1] * b.d[0];
        if (Math.abs(det) < 1e-9)
        {
            return null;
        }
        const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / det;
        return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t];
    }
    if (a.kind === "circle" && b.kind === "circle")
    {
        // Tangent arcs of a basket handle : no crossing worth taking, the caller offsets the junction along the normal
        return null;
    }
    const line = (a.kind === "line" ? a : b) as Carrier & { kind: "line" };
    const circle = (a.kind === "circle" ? a : b) as Carrier & { kind: "circle" };
    const f: Pt = [line.p[0] - circle.c[0], line.p[1] - circle.c[1]];
    const A = line.d[0] ** 2 + line.d[1] ** 2;
    const B = 2 * (f[0] * line.d[0] + f[1] * line.d[1]);
    const C = f[0] ** 2 + f[1] ** 2 - circle.r ** 2;
    const disc = B * B - 4 * A * C;
    if (disc < -1e-6)
    {
        return null;
    }
    const roots = [(-B - Math.sqrt(Math.max(disc, 0))) / (2 * A), (-B + Math.sqrt(Math.max(disc, 0))) / (2 * A)];
    const pts = roots.map((t): Pt => { return [line.p[0] + line.d[0] * t, line.p[1] + line.d[1] * t]; });
    return pts.sort((p, q) => { return Math.hypot(p[0] - near[0], p[1] - near[1]) - Math.hypot(q[0] -
        near[0], q[1] - near[1]); })[0]!;
}


// The outline of the board under its banding : its banded lines moved in by `t`, its banded arcs of a radius `t`
// smaller when they bulge out, larger when they cut in. Each corner found again where its 2 neighbours now meet
export function innerOutline(o: Outline, length: number, width: number, edges: Edge[], t: number): Outline
{
    const segs = walk(o);
    const banded = bandedSegments(o, length, width, edges);
    const ccw = turn(segs) > 0;
    // The way into the board from a point of a segment
    const inward = (k: number, at: Pt): Pt =>
    {
        const { from, s } = segs[k]!;
        if (s.kind === "line")
        {
            const d: Pt = [s.x - from[0], s.y - from[1]];
            const l = Math.hypot(d[0], d[1]);
            return ccw ? [-d[1] / l, d[0] / l] : [d[1] / l, -d[0] / l];
        }
        const r: Pt = [at[0] - s.cx, at[1] - s.cy];
        const l = Math.hypot(r[0], r[1]);
        // An arc turning the way the outline turns bulges out : its centre is inside
        const bulges = s.ccw === ccw;
        return bulges ? [-r[0] / l, -r[1] / l] : [r[0] / l, r[1] / l];
    };
    const carriers: Carrier[] = segs.map(({ from, s }, k) =>
    {
        const move = banded[k] ? t : 0;
        if (s.kind === "line")
        {
            const n = inward(k, from);
            return { kind: "line", p: [from[0] + n[0] * move, from[1] + n[1] * move], d: [s.x - from[0], s.y -
                from[1]] };
        }
        const r = Math.hypot(from[0] - s.cx, from[1] - s.cy);
        return { kind: "circle", c: [s.cx, s.cy], r: s.ccw === ccw ? r - move : r + move };
    });
    // The corner between each segment and the next
    const corners: Pt[] = segs.map(({ s }, k) =>
    {
        const next = (k + 1) % segs.length;
        const at: Pt = [s.x, s.y];
        const met = intersect(carriers[k]!, carriers[next]!, at);
        if (met !== null && Math.hypot(met[0] - at[0], met[1] - at[1]) < 4 * t + 1)
        {
            return met;
        }
        // Tangent : moved in along the normal of whichever of the two is banded
        const n: Pt = banded[k] ? inward(k, at) : banded[next] ? inward(next, at) : [0, 0];
        const move = banded[k] || banded[next] ? t : 0;
        return [at[0] + n[0] * move, at[1] + n[1] * move];
    });
    const start = corners[corners.length - 1]!;
    return {
        start,
        segments: segs.map(({ s }, k): Segment =>
        {
            const corner = corners[k]!;
            const x = corner[0];
            const y = corner[1];
            return s.kind === "line" ? { kind: "line", x, y } : { kind: "arc", x, y, cx: s.cx, cy: s.cy, ccw: s.ccw };
        }),
    };
}
