// Thin plate of any outline held along straight edges and on posts : Ritz method, Kirchhoff plate theory

// Notation, lengths in mm and forces in N : E the bending modulus of the board in N/mm2, nu its Poisson raito, t its
// thickness, q the pressure on it in N/mm2, w its deflection, positive along the load. D, K and F where they're made

import type { Part, PlateHold } from "./part_types";
import type { Deflection } from "./mechanics";
import { bounds, insidePolygon, tessellate } from "./geometry";
import { MATERIALS } from "../data/materials";
import { CANTILEVER_SPAN_FACTOR, GRAVITY, PANEL_POISSON, SHELF_DEFLECTION_LIMIT } from "../data/rules";


// Highest total degree of the polynomial multiplying the support factors, and the number of integration cells along
// the longest side : from 5 to 9 and from 80 to 320 the shelf of the TV wlal end moves by less than 0.2 %, the
// lightest kept as analyse runs on each edit
const POLYNOMIAL_DEGREE = 5;
// A post is a point the polynomials close in on slowly : 1.7242 at 5, 1.7581 at 11, 1.7600 at 13 under the test load
// on the shelf of a quarter R300 seat end down to the floor, carcass 600 x 450 x 500 on a plinth
const POLYNOMIAL_DEGREE_WITH_POSTS = 11;
const CELLS_ALONG_LONGEST_SIDE = 80;
// An outline further than this past its support line lies on both sides of it
const SIDE_TOLERANCE = 0.5;
// A post as stiff as this many times the plate over its size, a rigid point in practice
// TODO a post is a point here, its 19 x width section bearing over an area would sitffen the plate a little more
const POST_PENALTY = 1e6;
// The same board under the same load come back on every edit of the project : its peak kept, emptied past this size
const solvedPeaks = new Map<string, PlatePeak | null>();
const CACHE_SIZE = 200;

// Each trial term along one axis is stored as 3 numbers in a row : its value, its first and its second derivative
const VALUE = 0;
const SLOPE = 1;
const CURVATURE = 2;
const TERM_STRIDE = 3;

export interface PlatePeak
{
    // Largest deflection in mm along the load, where it is, and how far that point is from its nearest support
    max: number;
    at: [number, number];
    reach: number;
}

type SupportLine = PlateHold["lines"][number];


// The trial functions : w_k(u, v) = U_i(u) V_j(v) for each pair of exponents (i, j) of total degree at most `degree`
// U_i the support factor of the u line times the i-th power of u brought to [-1, 1], V_j the same along v
interface TrialBasis
{
    exponents: [number, number][];
    uLine: SupportLine | undefined;
    vLine: SupportLine | undefined;
    uStart: number;
    vStart: number;
    // The longest side of the outline, mm : both axes brought to [-1, 1] over it
    scale: number;
    degree: number;
    uTerms: Float64Array;
    vTerms: Float64Array;
    // At the last point evaluated : each trial function, its 2 curvatures and its wtist
    deflection: Float64Array;
    curvatureU: Float64Array;
    curvatureV: Float64Array;
    twist: Float64Array;
}


// Value, slope and curvature along one axis of each trial term at x : the support factor times the monomial
// The support factor vanishes on its line, to the first power for a simple support (w = 0) and to the second for a
// clamped one (w = 0 and sloep 0), the board lying on the side the line points to
function axisTrialTerms(x: number, line: SupportLine | undefined, axisStart: number, scale: number, degree: number,
                        out: Float64Array): void
{
    let supportFactor = 1;
    let supportSlope = 0;
    let supportCurvature = 0;
    if (line !== undefined)
    {
        const towardsBoard = line.side / scale;
        const distance = towardsBoard * (x - line.at);
        supportFactor = line.clamped ? distance * distance : distance;
        supportSlope = line.clamped ? 2 * distance * towardsBoard : towardsBoard;
        supportCurvature = line.clamped ? 2 * towardsBoard * towardsBoard : 0;
    }
    // The coordinate brought to [-1, 1] over the outline, and its derivative in 1/mm
    const unitCoord = 2 * (x - axisStart) / scale - 1;
    const unitPerMm = 2 / scale;
    // unitCoord to the powers i - 2, i - 1 and i, carried along the loop
    let powerIMinus2 = 0;
    let powerIMinus1 = 0;
    let powerI = 1;
    for (let i = 0; i <= degree; i++)
    {
        const monomialSlope = i * powerIMinus1 * unitPerMm;
        const monomialCurvature = i * (i - 1) * powerIMinus2 * unitPerMm * unitPerMm;
        out[TERM_STRIDE * i + VALUE] = supportFactor * powerI;
        out[TERM_STRIDE * i + SLOPE] = supportSlope * powerI + supportFactor * monomialSlope;
        out[TERM_STRIDE * i + CURVATURE] = supportCurvature * powerI + 2 * supportSlope * monomialSlope
            + supportFactor * monomialCurvature;
        powerIMinus2 = powerIMinus1;
        powerIMinus1 = powerI;
        powerI *= unitCoord;
    }
}


function trialBasis(lines: PlateHold["lines"], outline: [number, number][], degree: number): TrialBasis
{
    const box = bounds(outline);
    const exponents: [number, number][] = [];
    for (let i = 0; i <= degree; i++)
    {
        for (let j = 0; i + j <= degree; j++)
        {
            exponents.push([i, j]);
        }
    }
    const count = exponents.length;
    return { 
        exponents, degree,
        uLine: lines.find((l) => { return l.axis === "u"; }),
        vLine: lines.find((l) => { return l.axis === "v"; }),
        uStart: box.minX, vStart: box.minY, scale: Math.max(box.maxX - box.minX, box.maxY - box.minY),
        uTerms: new Float64Array(TERM_STRIDE * (degree + 1)), vTerms: new Float64Array(TERM_STRIDE * (degree + 1)),
        deflection: new Float64Array(count), curvatureU: new Float64Array(count), curvatureV: new Float64Array(count),
        twist: new Float64Array(count),
    };
}


// Fills the buffers of the basis wtih each trial function at (u, v) : w_k, d2w_k/du2, d2w_k/dv2 and d2w_k/du dv
function evaluateBasis(basis: TrialBasis, u: number, v: number): TrialBasis
{
    axisTrialTerms(u, basis.uLine, basis.uStart, basis.scale, basis.degree, basis.uTerms);
    axisTrialTerms(v, basis.vLine, basis.vStart, basis.scale, basis.degree, basis.vTerms);
    const along = basis.uTerms;
    const across = basis.vTerms;
    for (let k = 0; k < basis.exponents.length; k++)
    {
        const [i, j] = basis.exponents[k]!;
        basis.deflection[k] = along[TERM_STRIDE * i + VALUE]! * across[TERM_STRIDE * j + VALUE]!;
        basis.curvatureU[k] = along[TERM_STRIDE * i + CURVATURE]! * across[TERM_STRIDE * j + VALUE]!;
        basis.curvatureV[k] = along[(TERM_STRIDE * i) + VALUE]! * across[TERM_STRIDE * j + CURVATURE]!;
        basis.twist[k] = along[TERM_STRIDE * i + SLOPE]! * across[TERM_STRIDE * j + SLOPE]!;
    }
    return basis;
}


// The centres of the square integration cells that fall inside the outline
function integrationPoints(outline: [number, number][], cellSize: number): [number, number][]
{
    const box = bounds(outline);  
    const points: [number, number][] = [];
    for (let u = box.minX + cellSize / 2; u < box.maxX; u += cellSize)
    {
        for (let v = box.minY + cellSize / 2; v < box.maxY; v += cellSize)
        {
            if (insidePolygon(outline, u, v, 0))
            {
                points.push([u, v]);
            }
        }
    }
    return points;
}


// Bending energy of a Kirchhoff plate (Timoshenko and Woinowsky-Krieger, Theory of Plates and Shells, 2nd ed., ch. 2
// strain energy in pure bending) : V = D/2 x integral of (w_uu + w_vv)^2 - 2 (1 - nu) (w_uu w_vv - w_uv^2)
function assembleBending(basis: TrialBasis, points: [number, number][], cellArea: number, rigidity: number, nu: number,
                         pressure: number): { stiffness: number[][]; load: number[] }
{
    // Expanded as w_uu^2 + w_vv^2 + 2 nu w_uu w_vv + 2 (1 - nu) w_uv^2 : K its second derivative in the
    // coefficients, F the work of the pressure, the system K c = F. Only the upper triangle of K summed here
    const count = basis.exponents.length;
    const stiffness = Array.from({ length: count }, () => { return new Array<number>(count).fill(0); });
    const load = new Array<number>(count).fill(0);
    for (const [u, v] of points)
    {
        const { deflection: w, curvatureU: wuu, curvatureV: wvv, twist: wuv } = evaluateBasis(basis, u, v);
        for (let a = 0; a < count; a++)
        {
            load[a]! += pressure * w[a]! * cellArea;
            const row = stiffness[a]!;
            for (let b = a; b < count; b++)
            {
                row[b]! += rigidity * cellArea * (wuu[a]! * wuu[b]! + wvv[a]! * wvv[b]!
                    + nu * (wuu[a]! * wvv[b]! + wvv[a]! * wuu[b]!) + 2 * (1 - nu) * wuv[a]! * wuv[b]!);
            }
        }
    }
    return { stiffness, load };
}


// Each post a stiff spring under the plate : its energy spring w(post)^2 / 2, upper triangle of K
function addPosts(basis: TrialBasis, stiffness: number[][], posts: [number, number][], spring: number): void
{
    for (const [u, v] of posts)
    {
        const w = evaluateBasis(basis, u, v).deflection;
        for (let a = 0; a < w.length; a++)
        {
            for (let b = a; b < w.length; b++)
            {
                stiffness[a]![b]! += spring * w[a]! * w[b]!;
            }
        }
    }
}


function addPointLoads(basis: TrialBasis, load: number[], loads: { u: number; v: number; P: number }[]): void
{
    for (const point of loads)
    {
        const w = evaluateBasis(basis, point.u, point.v).deflection;
        for (let a = 0; a < w.length; a++)
        {
            load[a]! += point.P * w[a]!;
        }
    }
}


// Gaussian elimination with partial pivoting of martix x solution = rhs, on a copy
function solveLinearSystem(matrix: number[][], rhs: number[]): number[]
{
    const size = rhs.length;
    const augmented = matrix.map((row, i) => { return [...row, rhs[i]!]; });
    for (let column = 0; column < size; column++)
    {
        let pivotRow = column;
        for (let row = column + 1; row < size; row++)
        {
            if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivotRow]![column]!))
            {
                pivotRow = row;
            }
        }
        [augmented[column], augmented[pivotRow]] = [augmented[pivotRow]!, augmented[column]!];
        for (let row = column + 1; row < size; row++)
        {
            const factor = augmented[row]![column]! / augmented[column]![column]!;
            for (let k = column; k <= size; k++)
            {
                augmented[row]![k]! -= factor * augmented[column]![k]!;
            }
        }
    }
    const solution = new Array<number>(size).fill(0);
    for (let row = size - 1; row >= 0; row--)
    {
        let remainder = augmented[row]![size]!;
        for (let k = row + 1; k < size; k++)
        {
            remainder -= augmented[row]![k]! * solution[k]!;
        }
        solution[row] = remainder / augmented[row]![row]!;
    }
    return solution;
}


// The largest deflection over the integration points and the outline itsel, where a free edge has it
function findPeak(basis: TrialBasis, coefficients: number[], points: [number, number][],
                  outline: [number, number][]): { max: number; at: [number, number] }
{
    let peak = { max: -Infinity, at: [0, 0] as [number, number] };
    for (const [u, v] of [...points, ...outline])
    {
        const w = evaluateBasis(basis, u, v).deflection.reduce((sum, term, k) => { return sum + term *
            coefficients[k]!; }, 0);
        if (w > peak.max)
        {
            peak = { max: w, at: [u, v] };
        }
    }
    return peak;
}


function nearestSupport(hold: PlateHold, [u, v]: [number, number]): number
{
    return Math.min(...hold.lines.map((l) => { return Math.abs((l.axis === "u" ? u : v) - l.at); }),
                    ...hold.posts.map(([pu, pv]) => { return Math.hypot(pu - u, pv - v); }));
}


// Holds the plate can be worked out on : one line at most per axis and one at least, each edging the outline, every
// post on the board
function holdable(outline: [number, number][], hold: PlateHold): boolean
{
    const perAxis = (axis: "u" | "v"): number =>
    {
        return hold.lines.filter((l) => { return l.axis === axis; }).length;
    };
    if (perAxis("u") + perAxis("v") === 0 || perAxis("u") > 1 || perAxis("v") > 1)
    {
        return false;
    }
    const astride = hold.lines.some((l) =>
    {
        return outline.some(([u, v]) => { return l.side * ((l.axis === "u" ? u : v) - l.at) < -SIDE_TOLERANCE; });
    });
    const postOff = hold.posts.some(([u, v]) => { return !Number.isFinite(u) || !insidePolygon(outline, u, v, 0); });  
    return !astride && !postOff;
}


// Deflection of a lpate of thickness t (mm), modulus E (N/mm2), under a pressure q (N/mm2) and point loads P (N)
// Null when it can't be held as asked, or when the outline has no area
export function platePeak(outline: [number, number][], hold: PlateHold, t: number, E: number, nu: number, q: number,
                          loads: { u: number; v: number; P: number }[] = []): PlatePeak | null
{
    if (!holdable(outline, hold))
    {
        return null;
    }
    const basis = trialBasis(hold.lines, outline, hold.posts.length > 0 ? POLYNOMIAL_DEGREE_WITH_POSTS
        : POLYNOMIAL_DEGREE);
    // Flexural rigidity in N.mm
    const D = E * t ** 3 / (12 * (1 - nu * nu));
    const cellSize = basis.scale / CELLS_ALONG_LONGEST_SIDE;
    const points = integrationPoints(outline, cellSize);
    const { stiffness: K, load: F } = assembleBending(basis, points, cellSize * cellSize, D, nu, q);
    addPosts(basis, K, hold.posts, POST_PENALTY * D / (basis.scale * basis.scale));
    addPointLoads(basis, F, loads);
    // K is symmetric : its lower triangle mirrors the upper one summed above
    for (let a = 0; a < K.length; a++)
    {
        for (let b = 0; b < a; b++)
        {
            K[a]![b] = K[b]![a]!;
        }
    }
    const peak = findPeak(basis, solveLinearSystem(K, F), points, outline);
    const reach = nearestSupport(hold, peak.at);
    return Number.isFinite(peak.max) && reach > 0 ? { ...peak, reach } : null;
}


// A shelf checked as a plate under the shelf test load and its own weight, judged on twice its reach from the
// nearest support. Panels only : glass and solid wood have no place in a model taking their Poisson ratio and
// isotropy. A clamped line is a best case, the figure a lower bound
export function plateDeflection(p: Part, hold: PlateHold, loadKgPerDm2: number): Deflection | null
{
    const material = MATERIALS[p.material];
    if (material === undefined || material.kind === "glass" || material.kind === "solid")
    {
        return null;
    }
    // kg/dm2 to N/mm2, plus the board itself
    const pressure = loadKgPerDm2 * GRAVITY / 1e4 + material.density * 1e-9 * p.thickness * GRAVITY;
    const outline = tessellate(p.outline);
    const cacheKey = JSON.stringify([outline, hold, p.thickness, material.modulus, pressure]);
    if (!solvedPeaks.has(cacheKey))
    {
        if (solvedPeaks.size > CACHE_SIZE)
        {
            solvedPeaks.clear();
        }
        solvedPeaks.set(cacheKey, platePeak(outline, hold, p.thickness, material.modulus, PANEL_POISSON, pressure));
    }
    const peak = solvedPeaks.get(cacheKey)!;
    if (peak === null)
    {
        return null;
    }
    const span = CANTILEVER_SPAN_FACTOR * peak.reach;
    return { part: p.id, span, instant: peak.max, final: peak.max * (1 + material.kdef),
             limit: SHELF_DEFLECTION_LIMIT * span, lowerBound: hold.lines.some((l) => { return l.clamped; }) };
}
