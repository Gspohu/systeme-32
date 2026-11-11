// Whether a face drilling fit clear of the holes already there, shared by the connectors and the shelf pins

import type { Hole, Part, Purpose } from "./part_types";


// Drillings laid out to open into each othe : the lead of a spot comes out of its housing
const JOINED: [Purpose, Purpose][] = [["spot", "light-lead"]];


// A face drilling at (u, v) metes hole h : on the same face when the circles come within 2 mm, from the other
// face when both run into each other. A screw opint counts as Ø4 x 15
function hitsHole(h: Hole, thickness: number, face: "A" | "B", u: number, v: number, diameter: number,
                  depth: number): boolean
{
    if (h.face !== "A" && h.face !== "B")
    {
        return false;
    }
    const d = h.diameter === 0 ? 4 : h.diameter;
    const deep = h.depth === 0 ? 15 : h.depth;
    return Math.hypot(h.u - u, h.v - v) < (d + diameter) / 2 + 2 && (h.face === face || deep + depth >= thickness);
}


export function metHole(p: Part, face: "A" | "B", u: number, v: number, diameter: number,
                        depth: number): Hole | undefined
{
    return p.holes.find((h) =>
    {
        return hitsHole(h, p.thickness, face, u, v, diameter, depth);
    });
}


// The axis of a drilling in the board, from its mouth to its bottom, in u, v and the depth w from face A. A screw
// mark counts as Ø4 x 15
type Axis = { a: [number, number, number]; b: [number, number, number]; r: number };

function axisOf(h: Hole, p: Part): Axis
{
    const d = h.depth === 0 ? 15 : h.depth;
    const r = (h.diameter === 0 ? 4 : h.diameter) / 2;
    const w = h.w ?? p.thickness / 2;
    switch (h.face)
    {
        case "A": return { a: [h.u, h.v, 0], b: [h.u, h.v, d], r };
        case "B": return { a: [h.u, h.v, p.thickness], b: [h.u, h.v, p.thickness - d], r };
        case "u0": return { a: [h.u, h.v, w], b: [h.u + d, h.v, w], r };
        case "u1": return { a: [h.u, h.v, w], b: [h.u - d, h.v, w], r };
        case "v0": return { a: [h.u, h.v, w], b: [h.u, h.v + d, w], r };
        default: return { a: [h.u, h.v, w], b: [h.u, h.v - d, w], r };
    }
}


// The closest 2 segments come to each other
function segmentsApart(p: Axis, q: Axis): number
{
    const sub = (x: number[], y: number[]): number[] => { return x.map((v, k) => { return v - y[k]!; }); };
    const dot = (x: number[], y: number[]): number => { return x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!; };
    const d1 = sub(p.b, p.a);
    const d2 = sub(q.b, q.a);
    const r = sub(p.a, q.a);
    const [a, e, f] = [dot(d1, d1), dot(d2, d2), dot(d2, r)];
    const c = dot(d1, r);
    const bb = dot(d1, d2);
    const den = a * e - bb * bb;
    let s = den > 1e-9 ? Math.min(Math.max((bb * f - c * e) / den, 0), 1) : 0;
    let t = e > 1e-9 ? (bb * s + f) / e : 0;
    if (t < 0 || t > 1)
    {
        t = Math.min(Math.max(t, 0), 1);
        s = a > 1e-9 ? Math.min(Math.max((bb * t - c) / a, 0), 1) : 0;
    }
    const gap = sub(sub(p.a, q.a).map((v, k) => { return v + d1[k]! * s; }), d2.map((v) => { return v * t; }));
    return Math.sqrt(dot(gap, gap));
}


// Drilled to meet : the passage of a Minifix bolt runs into its housing
const JOINED_EDGE: [Purpose, Purpose][] = [["minifix-passage", "minifix-housing"]];


// Every pair of drillings of the part that meet, whatever placed them. Two face drillings by their circles, as the
// connectors place them. A drilling in an edge by its axis : the passages of the bolts, the dowels and the units
// bored into an edge were seen by no check (review of 2026-11-09)
export function crossedHoles(p: Part): [Hole, Hole][]
{
    const pairs: [Hole, Hole][] = [];
    const onFace = (h: Hole): boolean => { return h.face === "A" || h.face === "B"; };
    p.holes.forEach((x, i) =>
    {
        for (const y of p.holes.slice(i + 1))
        {
            const joined = [...JOINED, ...JOINED_EDGE].some(([m, n]) =>
            {
                return (x.purpose === m && y.purpose === n) || (x.purpose === n && y.purpose === m);
            });
            if (joined)
            {
                continue;
            }
            if (onFace(x) && onFace(y))
            {
                if (hitsHole(y, p.thickness, x.face as "A" | "B", x.u, x.v, x.diameter === 0 ? 4 : x.diameter,
                             x.depth === 0 ? 15 : x.depth))
                {
                    pairs.push([x, y]);
                }
                continue;
            }
            const [ax, ay] = [axisOf(x, p), axisOf(y, p)];
            if (segmentsApart(ax, ay) < ax.r + ay.r)
            {
                pairs.push([x, y]);
            }
        }
    });
    return pairs;
}


export function meets(p: Part, face: "A" | "B", u: number, v: number, diameter: number, depth: number): boolean
{
    return metHole(p, face, u, v, diameter, depth) !== undefined;
}
