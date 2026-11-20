// Thin plate of any outline held along straight edges and on posts : Ritz method, Kirchhoff plate theory

// Notation, lengths in mm and forces in N : E the bending modulus of the board in N/mm2, nu its Poisson raito, t its
// thickness, q the pressure on it in N/mm2, w its deflection, positive along the load. D, K and F where they're made

// Ritz : w is sought as a sum of trial functions c_k w_k, the coefficients c_k those minimising the bending energy
// less the work of the loads

import type { Part, PlateHold } from "./part_types";
import type { Deflection } from "./mechanics";
import { bounds, insidePolygon, tessellate } from "./geometry";
import { MATERIALS } from "../data/materials";
import { CANTILEVER_SPAN_FACTOR, GRAVITY, PANEL_POISSON, SHELF_DEFLECTION_LIMIT } from "../data/rules";
import { valueOf, workOut } from "./calc_notes";


// Highest total degree of the polynomial multiplying the support factors, and the number of integration cells along
// the longest side : from 5 to 9 and from 80 to 320 the shelf of the TV wlal end moves by less than 0.2 %, the
// lightest kept as analyse runs on each edit
const POLYNOMIAL_DEGREE = 5;
// A post is a point the polynomials close in on slowly : 1.7242 at 5, 1.7581 at 11, 1.7600 at 13 under the test load
// on the shelf of a quarter R300 seat end down to the floor, carcass 600 x 450 x 500 on a plinth
const POLYNOMIAL_DEGREE_WITH_POSTS = 11;
const CELLS_ALONG_LONGEST_SIDE = 80;
// An outline further than this past its support line lies on both sides of it, and a post must stand this far
// inside the outline
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
// U_i the support factor of the u line times the i-th power of the scaled u, V_j the same along v
interface TrialBasis
{
    exponents: [number, number][];
    uLine: SupportLine | undefined;
    vLine: SupportLine | undefined;
    uStart: number;
    vStart: number;
    // The longest side of the outline, mm : it goes from -1 to 1 once scaled, the other axis at the same scale
    scale: number;
    degree: number;
    uTerms: Float64Array;
    vTerms: Float64Array;
    // Rewritten at each point evaluated : ech trial function, its 2 curvatures and its wtist
    deflection: Float64Array;
    curvatureU: Float64Array;
    curvatureV: Float64Array;
    twist: Float64Array;
}


// Value, slope and curvature of each trial term along one axis, at `coord` mm on that axis : the support factor
// times the monomial
function axisTrialTerms(coord: number, line: SupportLine | undefined, axisStart: number, scale: number, degree: number,  
                        out: Float64Array): void
{
    // The support factor vanishes on its lne, to the first power for a simple support (w = 0) and to the second for
    // a clamped one (w = 0 and sloep 0), the board lying on the side the line points to
    let supportFactor = 1;
    let supportSlope = 0;
    let supportCurvature = 0;
    if (line !== undefined)
    {
        // The side of the board over the scael, in 1/mm : the distance to the line, positive on the board, scaled
        const signPerMm = line.side / scale;
        const scaledDistance = signPerMm * (coord - line.at);
        supportFactor = line.clamped ? scaledDistance * scaledDistance : scaledDistance;
        supportSlope = line.clamped ? 2 * scaledDistance * signPerMm : signPerMm;
        supportCurvature = line.clamped ? 2 * signPerMm * signPerMm : 0;
    }
    // The coordinate scaled so the longest side runs from -1 to 1, and its derviative in 1/mm
    const unitCoord = 2 * (coord - axisStart) / scale - 1;
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
        uLine: lines.find((support) => { return support.axis === "u"; }),
        vLine: lines.find((support) => { return support.axis === "v"; }),
        uStart: box.minX, vStart: box.minY, scale: Math.max(box.maxX - box.minX, box.maxY - box.minY),
        uTerms: new Float64Array(TERM_STRIDE * (degree + 1)), vTerms: new Float64Array(TERM_STRIDE * (degree + 1)),
        deflection: new Float64Array(count), curvatureU: new Float64Array(count), curvatureV: new Float64Array(count),
        twist: new Float64Array(count),
    };
}


// Each trial function at (u, v) : w_k, d2w_k/du2, d2w_k/dv2 and d2w_k/du dv, writen in the buffers of the basis
// The basis itself comes back : read it before the next call, which overwrites it
function evaluateBasis(basis: TrialBasis, u: number, v: number): TrialBasis
{
    axisTrialTerms(u, basis.uLine, basis.uStart, basis.scale, basis.degree, basis.uTerms);
    axisTrialTerms(v, basis.vLine, basis.vStart, basis.scale, basis.degree, basis.vTerms);
    for (let k = 0; k < basis.exponents.length; k++)
    {
        const [i, j] = basis.exponents[k]!;
        basis.deflection[k] = basis.uTerms[TERM_STRIDE * i + VALUE]! * basis.vTerms[TERM_STRIDE * j + VALUE]!;
        basis.curvatureU[k] = basis.uTerms[TERM_STRIDE * i + CURVATURE]! * basis.vTerms[TERM_STRIDE * j + VALUE]!;
        basis.curvatureV[k] = basis.uTerms[TERM_STRIDE * i + VALUE]! * basis.vTerms[(TERM_STRIDE * j) + CURVATURE]!;
        basis.twist[k] = basis.uTerms[TERM_STRIDE * i + SLOPE]! * basis.vTerms[TERM_STRIDE * j + SLOPE]!;
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
// on pure bending, article and equation number not checked) : V = D/2 x integral of (w_uu + w_vv)^2
// - 2 (1 - nu) (w_uu w_vv - w_uv^2)
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
        for (let termRow = 0; termRow < count; termRow++)
        {
            load[termRow]! += pressure * w[termRow]! * cellArea;
            const row = stiffness[termRow]!;
            for (let termColumn = termRow; termColumn < count; termColumn++)
            {
                row[termColumn]! += rigidity * cellArea * (wuu[termRow]! * wuu[termColumn]!
                    + wvv[termRow]! * wvv[termColumn]!
                    + nu * (wuu[termRow]! * wvv[termColumn]! + wvv[termRow]! * wuu[termColumn]!)
                    + 2 * (1 - nu) * wuv[termRow]! * wuv[termColumn]!);
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
        for (let termRow = 0; termRow < w.length; termRow++)
        {
            for (let termColumn = termRow; termColumn < w.length; termColumn++)
            {
                stiffness[termRow]![termColumn]! += spring * w[termRow]! * w[termColumn]!;
            }
        }
    }
}


// Each point load P in N : its work P w(point) on the load vector F
function addPointLoads(basis: TrialBasis, load: number[], loads: { u: number; v: number; P: number }[]): void
{
    for (const point of loads)
    {
        const w = evaluateBasis(basis, point.u, point.v).deflection;
        for (let k = 0; k < w.length; k++)
        {
            load[k]! += point.P * w[k]!; 
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
            for (let entry = column; entry <= size; entry++)
            {
                augmented[row]![entry]! -= factor * augmented[column]![entry]!;  
            }
        }
    }
    const solution = new Array<number>(size).fill(0);
    for (let row = size - 1; row >= 0; row--)
    {
        let remainder = augmented[row]![size]!;
        for (let entry = row + 1; entry < size; entry++)
        {
            remainder -= augmented[row]![entry]! * solution[entry]!;
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
        const trial = evaluateBasis(basis, u, v).deflection;
        let w = 0;
        for (let k = 0; k < trial.length; k++)
        {
            w += trial[k]! * coefficients[k]!;
        }
        if (w > peak.max)
        {
            peak = { max: w, at: [u, v] };
        }
    }
    return peak;
}


function nearestSupport(hold: PlateHold, [u, v]: [number, number]): number
{
    return Math.min(...hold.lines.map((support) => { return Math.abs((support.axis === "u" ? u : v) - support.at); }),
                    ...hold.posts.map(([postU, postV]) => { return Math.hypot(postU - u, postV - v); }));
}


// Holds the plate can be worked out on : one line at most per axis and one at least, each edging the outline, every
// post strictly on the board, further than SIDE_TOLERANCE from its edges
function holdable(outline: [number, number][], hold: PlateHold): boolean
{
    const perAxis = (axis: "u" | "v"): number =>
    {
        return hold.lines.filter((support) => { return support.axis === axis; }).length;
    };
    if (perAxis("u") + perAxis("v") === 0 || perAxis("u") > 1 || perAxis("v") > 1)
    {
        return false;
    }
    const astride = hold.lines.some((support) =>
    {
        return outline.some(([u, v]) =>
        {
            return support.side * ((support.axis === "u" ? u : v) - support.at) < -SIDE_TOLERANCE;
        });
    });
    const postOff = hold.posts.some(([u, v]) =>
    {
        return !Number.isFinite(u) || !insidePolygon(outline, u, v, SIDE_TOLERANCE);
    });
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
    for (let termRow = 0; termRow < K.length; termRow++)
    {
        for (let termColumn = 0; termColumn < termRow; termColumn++)
        {
            K[termRow]![termColumn] = K[termColumn]![termRow]!;
        }
    }
    const peak = findPeak(basis, solveLinearSystem(K, F), points, outline);
    const reach = nearestSupport(hold, peak.at);
    return Number.isFinite(peak.max) && reach > 0 ? { ...peak, reach } : null;
}


// A shelf checked as a plate under the shelf test load and its own weight, judged on twice its reach from the
// nearest support. Panels only : glass and solid wood have no place in a model taking their Poisson ratio and
// isotropy. A clamped line is a best case, the figure a lower bound
export function plateDeflection(part: Part, hold: PlateHold, loadKgPerDm2: number): Deflection | null 
{
    const material = MATERIALS[part.material];
    if (material === undefined || material.kind === "glass" || material.kind === "solid")
    {
        return null;
    }
    // kg/dm2 to N/mm2, plus the board itself
    const pressure = loadKgPerDm2 * GRAVITY / 1e4 + material.density * 1e-9 * part.thickness * GRAVITY;  
    const outline = tessellate(part.outline);
    const cacheKey = JSON.stringify([outline, hold, part.thickness, material.modulus, pressure]);  
    if (!solvedPeaks.has(cacheKey))
    {
        if (solvedPeaks.size > CACHE_SIZE)
        {
            solvedPeaks.clear();
        }
        solvedPeaks.set(cacheKey, platePeak(outline, hold, part.thickness, material.modulus, PANEL_POISSON, pressure));
    }
    const peak = solvedPeaks.get(cacheKey)!;
    if (peak === null)
    {
        return null;
    }
    const lowerBound = hold.lines.some((support) => { return support.clamped; });
    // The plate itself is solved by Ritz, a linear system of tens of unknowns no spreadsheet cell holds : its peak is
    // the one input that's a result, named so. All the rest is worked out in the note
    const note = workOut({
        id: `fleche-plaque/${part.id}`, title: `Flèche de ${part.label}`, subject: { kind: "part", id: part.id,
            item: part.item },
        method: "Plaque mince de Kirchhoff sur ses appuis réels, méthode de Ritz, jugée sur deux fois la distance à l'appui "
            + "le plus proche",
        hypotheses: [
            `Calcul du logiciel : la flèche est cherchée comme une somme de fonctions d'essai, produit des facteurs d'appui `
                + `(nuls sur les bords tenus) par les polynômes en u et v de degré total ${hold.posts.length > 0
                    ? POLYNOMIAL_DEGREE_WITH_POSTS : POLYNOMIAL_DEGREE}. Les coefficients sont ceux qui rendent minimale `
                + `l'énergie de flexion moins le travail de la charge : un système linéaire dont la matrice et le second `
                + `membre sont intégrés sur le contour réel de la tablette, découpé en ${CELLS_ALONG_LONGEST_SIDE} cellules `
                + `sur son plus grand côté, puis résolu. Un montant est un appui ponctuel de raideur ${POST_PENALTY} fois `
                + `celle de la plaque. La flèche retenue est le maximum relevé sur la grille`,"Panneau isotrope dans son plan", lowerBound ? "Un bord encastré : la flèche calculée est un minimum"
            : "Bords en appui simple", "Charge d'essai répartie sur toute la tablette (EN 16122:2012)"],
        inputs: [
            { name: "charge_essai", label: "Charge d'essai", value: loadKgPerDm2, unit: "kg/dm²",
              source: "Réglage du projet (UNI 11663)" },
            { name: "masse_vol", label: "Masse volumique", value: material.density, unit: "kg/m^3",
             source: material.source, link: { part: part.id, property: "density" } },
            { name: "epaisseur", label: "Épaisseur", value: part.thickness, unit: "mm", source: "Modèle",
              link: { part: part.id, size: "thickness" } },
            { name: "pesanteur", label: "Pesanteur", value: GRAVITY, unit: "N/kg", source: "Valeur normale" },
            { name: "module", label: "Module d'élasticité en flexion", value: material.modulus, unit: "N/mm²",
              source: material.source, link: { part: part.id, property: "modulus" } },
            { name: "poisson", label: "Coefficient de Poisson", value: PANEL_POISSON, unit: "-",
             source: "data/rules.ts" },
            { name: "fleche_ritz", label: "Flèche maximale de la plaque (résultat du calcul de Ritz)", value: peak.max,
              unit: "mm", source: "Calcul du logiciel, méthode de Ritz (plate.ts), non reproductible en tableur",
              result: "ritz" },
            { name: "distance", label: "Distance du maximum à l'appui le plus proche", value: peak.reach, unit: "mm",
              source: "Calcul du logiciel", result: "ritz" },
            { name: "facteur", label: "Facteur de portée équivalente", value: CANTILEVER_SPAN_FACTOR, unit: "-",
              source: "Convention des consoles de l'IBC" },
            { name: "kdef", label: "Coefficient de fluage", value: material.kdef, unit: "-", source: material.source },
            { name: "part_admise", label: "Flèche admise, part de la portée", value: SHELF_DEFLECTION_LIMIT, unit: "-",
              source: "UNI 11663, essai EN 16122:2012" },
        ],
        steps: [
            { name: "pression", label: "Pression d'essai et poids propre", unit: "N/mm²",
              formula: "charge_essai * pesanteur / 10000 + masse_vol * 1e-9 * epaisseur * pesanteur",
              source: "kg/dm² ramené au mm², plus le panneau" },
            { name: "rigidite", label: "Rigidité en flexion de la plaque", unit: "N.mm",
              formula: "module * epaisseur ^ 3 / (12 * (1 - poisson ^ 2))", source: "Plaque de Kirchhoff" },
            { name: "portee_eq", label: "Portée équivalente", formula: "facteur * distance", unit: "mm",
              source: "Deux fois la distance à l'appui le plus proche" },
            { name: "fleche", label: "Flèche instantanée", formula: "fleche_ritz", unit: "mm",
             source: "Calcul de Ritz" },
            { name: "fleche_fin", label: "Flèche à long terme", formula: "fleche * (1 + kdef)", unit: "mm",
              source: "EN 1995-1-1:2004, 2.3.2.2, information seulement" },
            { name: "fleche_adm", label: "Flèche admise", formula: "part_admise * portee_eq", unit: "mm",
             source: "UNI 11663" },
        ],
        check: { value: "fleche", limit: "fleche_adm" },
        phrases: { pass: lowerBound ? "Conformité non établie : flèche minimale sous la flèche admise, encastrement "
                       + "non prouvé" : "Conforme : flèche à l'essai sous la flèche admise",
                   fail: "Non conforme : flèche à l'essai au-delà de la flèche admise",
                   stale: "Périmé : la tablette a changé depuis le calcul de Ritz, le refaire dans le logiciel" },
    });
    return { part: part.id, span: valueOf(note, "portee_eq"), instant: valueOf(note, "fleche"),
             final: valueOf(note, "fleche_fin"), limit: valueOf(note, "fleche_adm"), lowerBound, note };
}
