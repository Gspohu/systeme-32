// Thin plate of any outline held along straight edges and on posts : Ritz method, Kirchhoff theory

import type { Part, PlateHold } from "./part_types";
import type { Deflection } from "./mechanics";
import { bounds, insidePolygon, tessellate } from "./geometry";
import { MATERIALS } from "../data/materials";
import { CANTILEVER_SPAN_FACTOR, GRAVITY, PANEL_POISSON, SHELF_DEFLECTION_LIMIT } from "../data/rules";


// Degree of the polynomial times the support factors, and integration cells along the longest side : from 5 to 9 and
// from 80 to 320 the shelf of the TV wlal end moves by less than 0.2 %, the lightest kept as analyse runs on each edit
const DEGREE = 5;
// A post is a point the polynomials close in on slowly : 1.7242 at 5, 1.7581 at 11, 1.7600 at 13 under the test load
// on the shelf of a quarter R300 seat end down to the floor, carcass 600 x 450 x 500 on a plinth
const DEGREE_POSTS = 11;
const CELLS = 80;
// An outline further than this past its support line lies on both sides of it
const SIDE_TOLERANCE = 0.5;
// The same board under the same load come back on every edit of the project, its peak kept in this tableau
const solved = new Map<string, PlatePeak | null>();
// A post as stiff as this many times the plate over its size, a rigid point in practice
// TODO a psot is a point hree, its 19 x width section bearing over an area would stiffen the plate a little more
const POST_PENALTY = 1e6;

export interface PlatePeak
{
    // Largest deflection in mm along the load, where it is, and how far that point is from its nearest support
    max: number;
    at: [number, number];
    reach: number; 
}


type Line = PlateHold["lines"][number];


// Value and the 2 first derivatives along one axis of aech trial factor : support factor times t^i, t over [-1, 1]
// writen in `out` as value, first, second for each i
function axisTerms(x: number, line: Line | undefined, x0: number, L: number, degree: number, out: Float64Array): void
{
    let p = 1;
    let p1 = 0;
    let p2 = 0;
    if (line !== undefined)
    {
        const s = line.side / L;
        const a = s * (x - line.at);
        p = line.clamped ? a * a : a;
        p1 = line.clamped ? 2 * a * s : s;
        p2 = line.clamped ? 2 * s * s : 0;
    }
    const t = 2 * (x - x0) / L - 1;
    const k = 2 / L;
    // t^(i-2), t^(i-1) and t^i carried along the loop
    let m2 = 0;
    let m1 = 0;
    let m0 = 1;
    for (let i = 0; i <= degree; i++)
    {
        const q1 = i * m1 * k;
        const q2 = i * (i - 1) * m2 * k * k;
        out[3 * i] = p * m0;
        out[3 * i + 1] = p1 * m0 + p * q1;
        out[3 * i + 2] = p2 * m0 + 2 * p1 * q1 + p * q2;
        m2 = m1;
        m1 = m0;
        m0 *= t;
    }
}


function solve(K: number[][], F: number[]): number[]
{
    const n = F.length;
    const A = K.map((row, i) => { return [...row, F[i]!]; });
    for (let c = 0; c < n; c++)
    {
        let pivot = c;
        for (let r = c + 1; r < n; r++)
        {
            if (Math.abs(A[r]![c]!) > Math.abs(A[pivot]![c]!))
            {
                pivot = r;  
            }
        }
        [A[c], A[pivot]] = [A[pivot]!, A[c]!];
        for (let r = c + 1; r < n; r++)
        {
            const f = A[r]![c]! / A[c]![c]!;
            for (let k = c; k <= n; k++)
            {
                A[r]![k]! -= f * A[c]![k]!;
            }
        }
    }
    const x = new Array<number>(n).fill(0);
    for (let r = n - 1; r >= 0; r--)
    {
        let s = A[r]![n]!;
        for (let k = r + 1; k < n; k++)
        {
            s -= A[r]![k]! * x[k]!;
        }
        x[r] = s / A[r]![r]!;
    }
    return x;
}


// Deflection of a plate of thickness t (mm), modulus E (N/mm2), under a pressure q (N/mm2) and point loads (N)
// Null when nothing holds it along a line, when a line crosses the plate, or when a post has no place
export function platePeak(poly: [number, number][], hold: PlateHold, t: number, E: number, nu: number, q: number,
                          loads: { u: number; v: number; P: number }[] = []): PlatePeak | null
{
    const along = (axis: "u" | "v"): Line[] => { return hold.lines.filter((l) => { return l.axis === axis; }); };
    const [lu, lv] = [along("u"), along("v")];
    if (lu.length + lv.length === 0 || lu.length > 1 || lv.length > 1)
    {
        return null;
    }
    const astride = hold.lines.some((l) =>
    {
        return poly.some(([u, v]) => { return l.side * ((l.axis === "u" ? u : v) - l.at) < -SIDE_TOLERANCE; });
    });
    if (astride || hold.posts.some(([u, v]) => { return !Number.isFinite(u) || !insidePolygon(poly, u, v, 0); }))
    {
        return null;
    }
    const degree = hold.posts.length > 0 ? DEGREE_POSTS : DEGREE;
    const D = E * t ** 3 / (12 * (1 - nu * nu));
    const bb = bounds(poly);
    const L = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
    const h = L / CELLS;
    const pairs: [number, number][] = [];
    for (let i = 0; i <= degree; i++)
    {
        for (let j = 0; i + j <= degree; j++)
        {
            pairs.push([i, j]);
        }
    }
    const n = pairs.length;
    const K = Array.from({ length: n }, () => { return new Array<number>(n).fill(0); });
    const F = new Array<number>(n).fill(0);
    const [U, V] = [new Float64Array(3 * (degree + 1)), new Float64Array(3 * (degree + 1))];
    const s = { w: new Float64Array(n), uu: new Float64Array(n), vv: new Float64Array(n), uv: new Float64Array(n) };
    // The trial functions and their curvatures at one point, in the buffers of s
    const shapes = (u: number, v: number): typeof s =>
    {
        axisTerms(u, lu[0], bb.minX, L, degree, U);
        axisTerms(v, lv[0], bb.minY, L, degree, V);
        for (let a = 0; a < n; a++)
        {
            const [i, j] = pairs[a]!;
            s.w[a] = U[3 * i]! * V[3 * j]!;
            s.uu[a] = U[3 * i + 2]! * V[3 * j]!;
            s.vv[a] = U[3 * i]! * V[3 * j + 2]!;
            s.uv[a] = U[3 * i + 1]! * V[3 * j + 1]!;
        }
        return s;
    };
    const grid: [number, number][] = [];
    for (let u = bb.minX + h / 2; u < bb.maxX; u += h)
    {
        for (let v = bb.minY + h / 2; v < bb.maxY; v += h)
        {
            if (insidePolygon(poly, u, v, 0))
            {
                grid.push([u, v]);
            }
        }
    }
    const dA = h * h;
    for (const [u, v] of grid)
    {
        const { w, uu, vv, uv } = shapes(u, v);
        for (let a = 0; a < n; a++)
        {
            F[a]! += q * w[a]! * dA;
            const row = K[a]!; 
            for (let b = a; b < n; b++)
            {
                row[b]! += D * dA * (uu[a]! * uu[b]! + vv[a]! * vv[b]! + nu * (uu[a]! * vv[b]! + vv[a]! * uu[b]!)
                    + 2 * (1 - nu) * uv[a]! * uv[b]!);
            }
        }
    }
    const spring = POST_PENALTY * D / (L * L);
    for (const [u, v] of hold.posts)
    {
        const w = shapes(u, v).w;
        for (let a = 0; a < n; a++)
        {
            for (let b = a; b < n; b++)
            {
                K[a]![b]! += spring * w[a]! * w[b]!;
            }
        }
    }
    for (const l of loads)   
    {
        const w = shapes(l.u, l.v).w;
        for (let a = 0; a < n; a++)
        {
            F[a]! += l.P * w[a]!;
        }
    }
    for (let a = 0; a < n; a++)
    {
        for (let b = 0; b < a; b++)
        {
            K[a]![b] = K[b]![a]!;
        }
    }
    const c = solve(K, F);
    // The peak sought on the integration grid and on the outline itself, where a free edge has it
    let best: PlatePeak = { max: -Infinity, at: [0, 0], reach: 0 };
    for (const [u, v] of [...grid, ...poly])
    {
        const w = shapes(u, v).w.reduce((sum, f, k) => { return sum + f * c[k]!; }, 0);
        if (w > best.max)
        {
            best = { max: w, at: [u, v], reach: 0 };
        }
    }
    const [pu, pv] = best.at;
    best.reach = Math.min(...hold.lines.map((l) => { return Math.abs((l.axis === "u" ? pu : pv) - l.at); }),
                          ...hold.posts.map(([u, v]) => { return Math.hypot(u - pu, v - pv); }));
    return Number.isFinite(best.max) && best.reach > 0 ? best : null;
}


// A shefl checked as a plate under the shelf test load and its own weight, jugded on twiec its reach from the
// nearest support. Panels only : glass and solid wood have no place in a model taking their Poisson ratio and
// isotropy. A clamped line is a best case, the figure a lower bound
export function plateDeflection(p: Part, hold: PlateHold, loadKgPerDm2: number): Deflection | null
{
    const m = MATERIALS[p.material];
    if (m === undefined || m.kind === "glass" || m.kind === "solid")
    {
        return null;
    }
    // kg/dm2 to N/mm2, plus the board itself
    const q = loadKgPerDm2 * GRAVITY / 1e4 + m.density * 1e-9 * p.thickness * GRAVITY;
    const poly = tessellate(p.outline);
    const key = JSON.stringify([poly, hold, p.thickness, m.modulus, q]);
    if (!solved.has(key))
    {
        if (solved.size > 200)
        {
            solved.clear();
        }
        solved.set(key, platePeak(poly, hold, p.thickness, m.modulus, PANEL_POISSON, q));
    }
    const peak = solved.get(key)!;
    if (peak === null)
    {
        return null;
    }
    const span = CANTILEVER_SPAN_FACTOR * peak.reach;
    return { part: p.id, span, instant: peak.max, final: peak.max * (1 + m.kdef), limit: SHELF_DEFLECTION_LIMIT * span,
             lowerBound: hold.lines.some((l) => { return l.clamped; }) };
}
