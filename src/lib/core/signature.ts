// Whether two parts are one workpiece : board, size, outline, machining, and the hand of a part no mirror repeats

import type { Part } from "./parts";
import { rectOutline } from "./geometry";


function r1(x: number): number
{
    return Math.round(x * 10) / 10;
}


function outlineKey(p: Part): string
{
    let outline = "";
    for (const o of [p.outline, ...p.cutouts])
    {
        outline += o === p.outline ? "" : "/";
        for (const s of o.segments)
        {
            outline += s.kind === "arc" ? `a${r1(s.x)},${r1(s.y)},${r1(s.cx)},${r1(s.cy)},${s.ccw}` : `l${r1(s.x)},${r1(s.y)}`;
        }
    }
    return outline;
}


// A mirror of the board read in its own frame : faces swapped, u or v running backwards
interface Mirror
{
    faces: boolean;
    u: boolean;
    v: boolean;
}

const AS_IS: Mirror = { faces: false, u: false, v: false };


// Edges, holes and grooves of a part as the mirror image carry them
function machining(p: Part, m: Mirror): string
{
    const flip = (e: string): string =>
    {
        const swaps: Record<string, string> = m.u && m.v ? { u0: "u1", u1: "u0", v0: "v1", v1: "v0" }
            : m.u ? { u0: "u1", u1: "u0" } : m.v ? { v0: "v1", v1: "v0" } : {};
        if (m.faces && (e === "A" || e === "B"))
        {
            return e === "A" ? "B" : "A";
        }
        return swaps[e] ?? e;
    };
    const u = (x: number): number =>
    {
        return r1(m.u ? p.length - x : x);
    };
    const v = (y: number): number =>
    {
        return r1(m.v ? p.width - y : y);
    };
    const holes = p.holes.map((h) =>
    {
        const w = h.w === undefined ? "" : r1(m.faces ? p.thickness - h.w : h.w);
        return `${u(h.u)},${v(h.v)},${h.diameter},${h.depth},${flip(h.face)},${w}`;
    });
    const grooves = p.grooves.map((g) =>
    {
        const [lo, hi] = g.along === "u" ? [u(g.from), u(g.to)] : [v(g.from), v(g.to)];
        const at = g.along === "u" ? v(g.at) : u(g.at);
        return `${flip(g.face)},${g.along},${at},${Math.min(lo, hi)},${Math.max(lo, hi)},${g.width},${g.depth}`;
    });
    const pockets = (p.pockets ?? []).map((k) =>
    {
        const at = k.edge === "v0" || k.edge === "v1" ? u(k.at) : v(k.at);
        const w = r1(m.faces ? p.thickness - k.w : k.w);
        return `${flip(k.edge)},${at},${k.length},${k.across},${w},${k.depth}`;
    });
    return [p.edges.map(flip).sort().join(""), holes.sort().join(";"), grooves.sort().join(";"),
            pockets.sort().join(";")].join("|");
}


// +1 or -1 as the frame of the part turns one way or the other, 0 without a frame
function handedness(p: Part): number
{
    const f = p.frame;
    if (f === null)
    {
        return 0;
    }
    const det = f.n[0] * (f.u[1] * f.v[2] - f.u[2] * f.v[1]) + f.n[1] * (f.u[2] * f.v[0] - f.u[0] * f.v[2])
        + f.n[2] * (f.u[0] * f.v[1] - f.u[1] * f.v[0]);
    return Math.sign(det);
}


// A left and a right side drilled alike in their own frames are mirror images, not two copies : they make one
// workpiece only when some mirror of the board leaves its machining unchanged. Reversing u or v is only tried on
// a plain rectangle, a shaped outline is never mirrored here
function chiral(p: Part): boolean
{
    const own = machining(p, AS_IS);
    const plain = p.cutouts.length === 0 && outlineKey(p) === outlineKey({ ...p, outline: rectOutline(p.length,
        p.width), cutouts: [] });
    const mirrors: Mirror[] = [{ faces: true, u: false, v: false }];
    if (plain)
    {
        mirrors.push({ faces: false, u: true, v: false }, { faces: false, u: false, v: true },
                     { faces: true, u: true, v: true });
    }
    return !mirrors.some((m) =>
    {
        return machining(p, m) === own;
    });
}


// Two parts are the same workpiece when board, size, edges and machining are identical, and so is the hand of a
// part no mirror reproduces
function signature(p: Part): string
{
    return [p.decor, p.material, p.thickness, r1(p.length), r1(p.width), p.role, outlineKey(p), machining(p, AS_IS),
            chiral(p) ? `main ${handedness(p)}` : ""].join("|");
}


// Parts grouped by signature, in the order their first member appears
export function groupBySignature(parts: Part[]): Part[][]
{
    const groups = new Map<string, Part[]>();
    for (const part of parts)
    {
        const sig = signature(part);
        const g = groups.get(sig) ?? [];
        g.push(part);
        groups.set(sig, g);
    }
    return [...groups.values()];
}
