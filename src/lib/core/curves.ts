// Rounded ends (plan view), quarter round corners (front view) and cell linings

import type { Battens, Carcass, CurveTechnique, End, RoundCorner } from "./model";
import type { ResolvedLayout } from "./layout";
import type { Build, Part } from "./part_types";
import { baseHeight, newPart } from "./part_base";
import { type Outline, type Segment, type Vec3, X, Y, Z, bounds, insidePolygon, neg, tessellate } from "./geometry";
import { endReach, usableDepth } from "./extent";
import { FLEX_MIN_RADIUS } from "../data/materials";


// Workshop conventions : one former every 400 mm of height, solid profiles only for small radii
const FORMER_SPACING = 400;
const SOLID_MAX_RADIUS = 100;
// an open end's upright, narrow enough for a single connector at each end (two would clash under 2 x 37)
const POST_WIDTH = 60;
const POST_SETBACK = 15;


function skinThickness(tech: CurveTechnique, flex: 6 | 9, battens: Battens): number
{
    if (tech === "flex")
    {
        return flex;
    }
    if (tech === "battens")
    {
        return battens.thickness;
    }
    return 0;
}


// Skin or battens covering a developed lenght, returned as parts ready for the cut list
function skinParts(
    base: { item: string; itemName: string }, id: string, label: string, tech: CurveTechnique, flex: 6 | 9, battens: Battens,
    developed: number, height: number, radius: number, curve: Part["curve"], b: Build,
): void
{
    if (tech === "flex")
    {
        // TODO : these minimum radii come from resellers, no manufacturer datasheet found for them yet
        const min = FLEX_MIN_RADIUS[flex] ?? 200;
        if (radius < min)
        {
            b.errors.push(`${base.itemName}, ${label.toLowerCase()} : rayon ${Math.round(radius)} mm, ${min} mm mini `
                + `pour du MDF cintrable de ${flex} mm (donnée revendeur). Passer aux tasseaux ou au massif.`);
        }
        const p = newPart({
            ...base, id, label: `${label}, peau cintrée`, role: "skin", length: developed, width: height,
            thickness: flex, decor: "MDF_FLEX", edges: [], frame: null,
        });
        p.curve = curve;
        p.notes.push(`Cintrée au rayon ${Math.round(radius)} mm, collée sur les gabarits. Essai sur chute conseillé`);
        b.parts.push(p);
        return;
    }
    if (tech === "battens")
    {
        const pitch = battens.width + battens.gap;
        const count = Math.max(1, Math.floor((developed + battens.gap) / pitch));
        const p = newPart({
            ...base, id, label: `${label}, tasseaux`, role: "batten", length: height, width: battens.width,
            thickness: battens.thickness, decor: battens.decor, edges: [], frame: null,
        });
        p.quantity = count;
        p.curve = curve;
        p.notes.push(`${count} tasseaux au pas de ${pitch} mm sur ${Math.round(developed)} mm développés`);
        b.parts.push(p);
        return;
    }
    if (radius > SOLID_MAX_RADIUS)
    {
        b.errors.push(`${base.itemName} : profil massif usiné réservé aux rayons de ${SOLID_MAX_RADIUS} mm maxi `
            + `(${Math.round(radius)} demandés).`);
    }
    const p = newPart({
        ...base, id, label: `${label}, profil massif usiné`, role: "skin", length: height, width: radius,
        thickness: radius, decor: "CHENE_MASSIF", edges: [], frame: null,
    });
    p.curve = curve;
    p.notes.push("Profil massif en quart de rond, usinage CN ou toupie");
    b.parts.push(p);
}


// How far below the carcass bottom the low end panel goes : down to the floor past a plinth or feet
export function endDrop(c: Carcass, end: Extract<End, { type: "rounded" }>): number
{
    return end.floor === true ? baseHeight(c) : 0;
}


// A quarter of the ellipse of half axes `a` along u and `b` along v centred on (0, cy), as the workshop cuts it : a
// basket-handle arch of two tangent arcs, from (a, cy) to (0, cy - b). The first radius is searched for the arch
// closest to the ellipse, under a millimetre on a 300 x 342 quarter
export function basketHandle(a: number, b: number, cy: number): Segment[]
{
    if (Math.abs(a - b) < 0.01)
    {
        return [{ kind: "arc", x: 0, y: cy - b, cx: 0, cy, ccw: false }];
    }
    const A = Math.max(a, b);
    const B = Math.min(a, b);
    // X along the major half axis, Y along the minor one
    const onBoard = (X: number, Y: number): [number, number] =>
    {
        return b > a ? [Y, cy - X] : [X, cy - Y];
    };
    const arch = (r1: number): { r2: number; c1: [number, number]; c2: [number, number]; j: [number, number] } =>
    {
        const r2 = (2 * A * r1 - A * A - B * B) / (2 * (r1 - B));
        const c1: [number, number] = [A - r1, 0];
        const c2: [number, number] = [0, B - r2];
        const d = Math.hypot(c1[0] - c2[0], c1[1] - c2[1]);
        return { r2, c1, c2, j: [c2[0] + (c1[0] - c2[0]) / d * r2, c2[1] + (c1[1] - c2[1]) / d * r2] };
    };
    const worst = (r1: number): number =>
    {
        const { r2, c1, c2, j } = arch(r1);
        const joint = Math.atan2(j[1] - c1[1], j[0] - c1[0]);
        let w = 0;
        for (let k = 0; k <= 48; k++)
        {
            const t = Math.PI / 2 * k / 48;
            const [x, y] = [A * Math.cos(t), B * Math.sin(t)];
            const near = Math.atan2(y - c1[1], x - c1[0]) <= joint;
            w = Math.max(w, Math.abs(near ? Math.hypot(x - c1[0], y - c1[1]) - r1 : Math.hypot(x - c2[0], y -
                c2[1]) - r2));
        }
        return w;
    };
    // r1 under B, and under (A² + B²) / 2A so the second centre stays past the minor axis
    let lo = B * B / A / 2;
    let hi = Math.min(B, (A * A + B * B) / (2 * A)) - 1e-6;
    let best = (lo + hi) / 2;
    for (let pass = 0; pass < 3; pass++)
    {
        const step = (hi - lo) / 40;
        for (let r = lo; r <= hi; r += step)
        {
            if (worst(r) < worst(best))
            {
                best = r;
            }
        }
        [lo, hi] = [Math.max(lo, best - step), Math.min(hi, best + step)];
    }
    const { c1, c2, j } = arch(best);
    const [jx, jy] = onBoard(...j);
    const [c1x, c1y] = onBoard(...c1);
    const [c2x, c2y] = onBoard(...c2);
    // from (a, cy) : the minor end first when the major axis runs along v
    return b > a
        ? [{ kind: "arc", x: jx, y: jy, cx: c2x, cy: c2y, ccw: false },
           { kind: "arc", x: 0, y: cy - b, cx: c1x, cy: c1y, ccw: false }]
        : [{ kind: "arc", x: jx, y: jy, cx: c1x, cy: c1y, ccw: false },
           { kind: "arc", x: 0, y: cy - b, cx: c2x, cy: c2y, ccw: false }];
}


// The floor board of an open end on a plinth, kept off the toes : from the side in line with the plinth face, a
// quarter round set back as much, or a basket handle out to the back on a quarter round. Null when it is cut like the
// boards above
export function floorOutline(c: Carcass, side: "left" | "right"): Outline | null
{
    const end = c.ends[side];
    if (end.type !== "rounded")
    {
        return null;
    }
    const toe = endToe(c, end);
    if (toe === 0)
    {
        return null;
    }
    const outer = endReach(c, side);
    if (end.sweep === 180)
    {
        const low = outer - toe;
        return { start: [0, outer - low], segments: [
            { kind: "arc", x: 0, y: outer + low, cx: 0, cy: outer, ccw: true },
            { kind: "line", x: 0, y: outer - low },
        ] };
    }
    const usable = usableDepth(c);
    return { start: [0, toe], segments: [
        { kind: "line", x: 0, y: usable },
        { kind: "line", x: outer, y: usable },
        ...basketHandle(outer, usable - toe, usable),
    ] };
}


// How far the floor board of an open end stays inside the arc of the boards above : in line with the plinth face
// its edge kept off the toes like the plinth is
export function endToe(c: Carcass, end: Extract<End, { type: "rounded" }>): number
{
    if (end.open !== true || endDrop(c, end) === 0 || c.base.type !== "plinth")
    {
        return 0;
    }
    return c.base.setback;
}


// The low end panel rests on the floor, the only way a load on the end reaches it
export function endGrounded(c: Carcass, end: Extract<End, { type: "rounded" }>): boolean
{
    return c.base.type === "floor" || (end.floor === true && c.base.type !== "wall");
} 


// Undersides of the shaped boards of an open end above the carcass bottom : both end panels, then the shelves
// evenly spread between them
export function openEndLevels(c: Carcass, end: Extract<End, { type: "rounded" }>): number[]
{
    const board = c.thickness;
    const drop = endDrop(c, end);
    const shelves = Math.max(0, Math.round(end.shelves ?? 2));
    const gap = (c.height + drop - 2 * board - shelves * board) / (shelves + 1);
    const levels = [-drop, c.height - board];
    for (let k = 1; k <= shelves; k++)
    {
        levels.push(-drop + board + k * gap + (k - 1) * board);
    }
    return levels;
}


// Upright of an open end sat on, in the frame of its shaped boards (u out from the side, v back from the front) :
// halfway round the arc, its outer corners kept POST_SETBACK inside it. No seat, no upright
export function endPost(c: Carcass, side: "left" | "right"): { u: number; v: number; w: number; t: number } | null
{
    const end = c.ends[side];
    if (end.type !== "rounded" || end.open !== true || end.seat !== true)
    {
        return null;
    }
    const outer = endReach(c, side);
    const phi = end.sweep === 180 ? 0 : Math.PI / 4;
    const a = POST_WIDTH / 2;
    const h = c.thickness / 2;
    const lead = a * Math.cos(phi) + h * Math.sin(phi);
    const reach = outer - POST_SETBACK;
    let rho = -lead + Math.sqrt((lead * lead) - (a * a + h * h - reach * reach));
    // it stands on the floor board too : drawn in when that one is cut smaller, its corners as far inside it
    const floor = floorOutline(c, side);
    if (floor !== null)
    {
        const poly = tessellate(floor, 2);
        const fits = (r: number): boolean =>
        {
            const [u, v] = [r * Math.cos(phi), outer - r * Math.sin(phi)];
            return [[u - a, v - h], [u + a, v - h], [u - a, v + h], [u + a, v + h]].every(([x, y]) =>
            {
                return insidePolygon(poly, x!, y!, POST_SETBACK);
            });
        };
        let inside = rho;
        while (inside > 0 && !fits(inside))
        {
            inside -= 1;
        }
        let out = Math.min(rho, inside + 1);
        if (inside > 0 && out > inside)
        {
            for (let k = 0; k < 40; k++)
            {
                const mid = (inside + out) / 2;
                [inside, out] = fits(mid) ? [mid, out] : [inside, mid];
            }
            rho = inside;
        }
    }
    return { u: rho * Math.cos(phi), v: outer - rho * Math.sin(phi), w: POST_WIDTH, t: c.thickness };
}


export function buildEnds(c: Carcass, b: Build): void
{
    for (const side of ["left", "right"] as const)
    {
        const end: End = c.ends[side];
        if (end.type !== "rounded")
        {
            continue;
        }
        const board = c.thickness;
        const depth = c.depth;
        const usable = usableDepth(c);
        const outer = endReach(c, side);
        if (end.sweep === 90 && end.radius > usable)
        {
            b.errors.push(`${c.name} : rayon de ${end.radius} mm supérieur à la profondeur ${usable} mm, ramené à ${usable}.`);
        }
        const open = end.open === true;
        const skin = open ? 0 : skinThickness(end.technique, end.flexThickness, end.battens);
        const inner = outer - skin;
        const outline: Outline = end.sweep === 180
            ? {
                start: [0, outer - inner],
                segments: [
                    { kind: "arc", x: 0, y: outer + inner, cx: 0, cy: outer, ccw: true },
                    { kind: "line", x: 0, y: outer - inner },
                ],
            }
            : {
                start: [0, 0],
                segments: [
                    { kind: "line", x: 0, y: usable },
                    { kind: "line", x: inner, y: usable },
                    { kind: "line", x: inner, y: outer },
                    { kind: "arc", x: 0, y: outer - inner, cx: 0, cy: outer, ccw: false },
                    { kind: "line", x: 0, y: 0 },
                ],
            };
        const toe = endToe(c, end);
        // a floor board cut smaller starts at its own front corner : the blank of the cut list is where the CNC sets 0
        const kept = floorOutline(c, side);
        const reach = kept === null ? null : bounds(tessellate(kept));
        const floorShift = reach === null ? 0 : reach.minY;
        const floor: Outline = kept === null ? outline : {
            start: [kept.start[0], kept.start[1] - floorShift],
            segments: kept.segments.map((s) =>
            {
                return s.kind === "arc" ? { ...s, y: s.y - floorShift, cy: s.cy - floorShift } : { ...s,
                    y: s.y - floorShift };
            }),
        };
        const floorLength = reach === null ? inner : reach.maxX;
        const xFace = side === "right" ? c.x + c.width : c.x;
        const uDir: Vec3 = side === "right" ? X : neg(X);
        const base = { item: c.id, itemName: c.name };
        const title = `Bout arrondi ${side === "right" ? "droit" : "gauche"}`;
        if (end.floor === true && c.base.type === "wall")
        {
            b.errors.push(`${c.name}, ${title.toLowerCase()} : un meuble suspendu ne descend pas au sol. `
                + "Décocher la case Jusqu'au sol, ou poser le meuble au sol.");
        }
        const drop = endDrop(c, end);
        const y0 = c.y - drop;
        const tall = c.height + drop;
        const formers = Math.max(0, Math.ceil(tall / FORMER_SPACING) - 1);
        const levels: { y: number; label: string; role: Part["role"] }[] = [
            { y: y0, label: "Flasque basse", role: "endPanel" },
            { y: c.y + c.height - board, label: "Flasque haute", role: "endPanel" },
        ];
        // TODO an open end's shelves hang off the side, the deflection check knows shelves on two supports only
        const shelfLevels = open ? openEndLevels(c, end).slice(2) : [];
        let k = 1;
        while (k <= (open ? shelfLevels.length : formers))
        {
            levels.push(open
                ? { y: c.y + shelfLevels[k - 1]!, label: `Tablette ${k}`, role: "endPanel" }
                : { y: y0 + (tall - board) * k / (formers + 1), label: `Gabarit ${k}`, role: "former" });
            k++;
        }
        const post = endPost(c, side);
        if (drop > 0 && post === null && end.back !== true)
        {
            b.errors.push(`${c.name}, ${title.toLowerCase()} : la flasque basse posée au sol n'est tenue par rien, `
                + "la joue s'arrête au-dessus du socle. Cocher la case Fond, ou Assise qui pose un montant.");
        }
        for (const lv of levels)
        {
            const grounded = lv.y < c.y;
            const p = newPart({
                ...base, id: `${c.id}/end/${side}/${lv.label}`, label: `${title}, ${lv.label.toLowerCase()}`,
                role: lv.role, length: grounded ? floorLength : inner, width: grounded ? usable - floorShift : usable,
                thickness: board, decor: c.decor, edges: !open ? [] : end.sweep === 90 ? ["v0", "u1"] : ["v0"],
                frame: { o: [xFace, lv.y + board, c.z + depth - (grounded ? floorShift : 0)], u: uDir, v: neg(Z),
                         n: neg(Y) },
            });
            p.outline = grounded ? floor : outline;
            if (grounded && toe > 0)
            {
                p.notes.push(end.sweep === 180 ? `Arc ramené de ${toe} mm au nu de la plinthe, hors des orteils`
                    : `Anse de panier de deux arcs, du nu de la plinthe (${toe} mm) jusqu'au fond, hors des orteils`);
            }
            p.notes.push("Contour cintré : découpe CN d'après le DXF");
            if (open)
            {
                p.notes.push("Ouvert : chant cintré sur l'arc, posé à la main");
            }
            b.parts.push(p);
            if (grounded)
            {
                p.notes.push("Posée au sol, sous le niveau de la joue");
                continue;
            }
            // shaped panels butt the outer face of the side with their straight edge
            b.joints.push({ edgePart: p.id, edge: "u0", facePart: `${c.id}/side/${side === "right" ? "R" : "L"}`,
                           face: "B", lineAxis: "u", line: lv.y + (board / 2) - c.y, from: 0, to: usable, edgeFrom: 0,
                           reversed: false });
        }
        if (post !== null)
        {
            // one lenght of upright between each pair of boards, standing on the one below and under the next :
            // the low panel, the shelves bottom up, the top panel
            const boards = [levels[0]!, ...levels.slice(2), levels[1]!].map((lv) =>
            {
                return { y: lv.y, id: `${c.id}/end/${side}/${lv.label}` };
            });
            const xMin = side === "right" ? xFace + post.u - post.w / 2 : xFace - post.u - post.w / 2;
            let n = 1;
            while (n < boards.length)
            {
                const low = boards[n - 1]!;
                const high = boards[n]!;
                const label = boards.length > 2 ? `montant ${n}` : "montant";
                const piece = newPart({
                    ...base, id: `${c.id}/end/${side}/post${n}`, label: `${title}, ${label}`, role: "vdivider",
                    length: high.y - low.y - board, width: post.w, thickness: post.t, decor: c.decor, edges: ["v0",
                        "v1"],
                    frame: { o: [xMin, low.y + board, c.z + depth - post.v + post.t / 2], u: Y, v: X, n: neg(Z) },
                });
                piece.notes.push("Montant porteur sous l'assise : la charge descend jusqu'à la flasque au sol");
                b.parts.push(piece);
                const span = { lineAxis: "v" as const, line: post.v, from: post.u - post.w / 2, to: post.u + post.w / 2,
                               edgeFrom: 0, reversed: side === "left" };
                // the floor board's own frame starts floorShift further back
                const below = n === 1 ? { ...span, line: post.v - floorShift } : span;
                b.joints.push({ edgePart: piece.id, edge: "u0", facePart: low.id, face: "A", ...below },
                              { edgePart: piece.id, edge: "u1", facePart: high.id, face: "B", ...span });
                n++;
            }
        }
        if (end.back === true && end.sweep === 90)
        {
            if (c.back.type !== "applied")
            {
                b.errors.push(`${c.name}, ${title.toLowerCase()} : son fond se visse en applique comme celui du caisson, `
                    + "qui n'est pas rapporté. Passer le fond du caisson en rapporté ou retirer le fond de l'arrondi.");
            }
            else
            {
                // behind the shaped panels, in the plane of the carcass back, from the side out to the skin
                const back = newPart({
                    ...base, id: `${c.id}/end/${side}/back`, label: `${title}, fond`, role: "back", length: tall,
                    width: outer, thickness: c.back.thickness, decor: c.backDecor, edges: [],
                    frame: { o: [side === "right" ? xFace : xFace - outer, y0, c.z + c.back.thickness], u: Y, v: X,
                             n: neg(Z) },
                });
                back.notes.push("Vissé en applique sur les chants arrière des flasques et des gabarits");
                b.parts.push(back);
            }
        }
        if (open)
        {
            continue;
        }
        const straight = end.sweep === 180 ? 0 : usable - outer;
        const developed = end.sweep === 180
            ? Math.PI * (outer - skin / 2)
            : Math.PI / 2 * (outer - skin / 2) + straight;
        const centre: Vec3 = [xFace, y0, c.z + depth - outer];
        // right end sweeps from +x to +z (quarter) or -z to +z (half), the left end mirrors it
        const q = Math.PI / 2;
        let a0 = q;
        let a1 = 2 * q;
        if (side === "right")
        {
            a0 = end.sweep === 180 ? -q : 0;
            a1 = q;
        }
        else if (end.sweep === 180)
        {
            a1 = 3 * q;
        }
        const straightAt = side === "right" ? 0 : Math.PI;
        skinParts(base, `${c.id}/end/${side}/skin`, title, end.technique, end.flexThickness, end.battens,
                  developed, tall, outer, { centre, axis: "y", rOuter: outer, thickness: skin, a0, a1, from: 0,
                                            to: tall, straight, straightAt }, b);
    }
}


export function buildCorner(k: RoundCorner, b: Build): void
{
    const skin = skinThickness(k.technique, k.flexThickness, k.battens);
    // inner radius 0 : square inside corner closed by the neighbouring boxes, no inner skin
    const solidInside = k.innerRadius <= 0;
    const ro = k.outerRadius - skin;
    const ri = solidInside ? 0 : k.innerRadius + skin;
    if (!solidInside && ri >= ro - 32)
    {
        b.errors.push(`${k.name} : couronne trop étroite (${Math.round(ro - ri)} mm entre peaux).`);
        return;
    }
    const sx = k.quadrant === "topRight" || k.quadrant === "bottomRight" ? 1 : -1;
    const sy = k.quadrant === "topRight" || k.quadrant === "topLeft" ? 1 : -1;
    const outline: Outline = solidInside
        ? {
            start: [0, 0],
            segments: [
                { kind: "line", x: ro, y: 0 },
                { kind: "arc", x: 0, y: ro, cx: 0, cy: 0, ccw: true },
                { kind: "line", x: 0, y: 0 },
            ],
        }
        : {
            start: [ri, 0],
            segments: [
                { kind: "line", x: ro, y: 0 },
                { kind: "arc", x: 0, y: ro, cx: 0, cy: 0, ccw: true },
                { kind: "line", x: 0, y: ri },
                { kind: "arc", x: ri, y: 0, cx: 0, cy: 0, ccw: false },
            ],
        };
    const base = { item: k.id, itemName: k.name };
    const u: Vec3 = sx > 0 ? X : neg(X);
    const v: Vec3 = sy > 0 ? Y : neg(Y);
    const flanges = [
        { id: "front", label: "Flasque avant", o: [k.cx, k.cy, k.z + k.depth - k.thickness] as Vec3, n: Z },
        { id: "back", label: "Flasque arrière", o: [k.cx, k.cy, k.z + k.thickness] as Vec3, n: neg(Z) },
    ];
    for (const f of flanges)
    {
        const p = newPart({
            ...base, id: `${k.id}/${f.id}`, label: f.label, role: "flange", length: ro, width: ro,
            thickness: k.thickness, decor: k.decor, edges: [], frame: { o: f.o, u, v, n: f.n },
        });
        p.outline = outline;
        p.notes.push("Couronne en quart de cercle : découpe CN d'après le DXF");
        b.parts.push(p);
    }
    const a0 = sx > 0 ? (sy > 0 ? 0 : -Math.PI / 2) : (sy > 0 ? Math.PI / 2 : Math.PI); 
    const a1 = a0 + Math.PI / 2;
    const centre: Vec3 = [k.cx, k.cy, k.z];
    skinParts(base, `${k.id}/outer`, "Angle arrondi, face extérieure", k.technique, k.flexThickness, k.battens,
        Math.PI / 2 * (k.outerRadius - skin / 2), k.depth, k.outerRadius,
        { centre, axis: "z", rOuter: k.outerRadius, thickness: skin, a0, a1, from: 0, to: k.depth, straight: 0,
         straightAt: 0 }, b);
    if (solidInside)
    {
        return;
    }
    skinParts(base, `${k.id}/inner`, "Angle arrondi, face intérieure", k.technique, k.flexThickness, k.battens,
        Math.PI / 2 * (k.innerRadius + skin / 2), k.depth, k.innerRadius,
        { centre, axis: "z", rOuter: k.innerRadius + skin, thickness: skin, a0, a1, from: 0, to: k.depth, straight: 0,
         straightAt: 0 }, b);
}


export function buildLinings(c: Carcass, lay: ResolvedLayout, b: Build): void
{
    for (const lining of c.linings)
    {
        const nb = lay.nodes.get(lining.cell);
        if (nb === undefined)
        {
            continue;
        }
        const lt = lining.thickness;
        const faces = lining.faces;
        const x0 = c.x + nb.x;
        const y0 = c.y + nb.y;
        const front = c.z + c.depth;
        const depthAll = c.depth - lay.zBack - (faces.back ? lt : 0);
        const base = { item: c.id, itemName: c.name, thickness: lt, decor: lining.decor, colour: lining.colour,
                       role: "lining" as const };
        const first = b.parts.length;
        const tag = `${c.id}/lining/${lining.id}`;
        if (faces.back)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/back`, label: "Habillage, fond", length: nb.h, width: nb.w, edges: [],
                frame: { o: [x0, y0, c.z + lay.zBack + lt], u: Y, v: X, n: neg(Z) },
            }));
        }
        const hTop = faces.top ? lt : 0;
        const hBottom = faces.bottom ? lt : 0;
        if (faces.bottom)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/bottom`, label: "Habillage, dessous", length: nb.w, width: depthAll, edges: ["v0"],  
                frame: { o: [x0, y0 + lt, front], u: X, v: neg(Z), n: neg(Y) },
            }));
        }
        if (faces.top)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/top`, label: "Habillage, dessus", length: nb.w, width: depthAll, edges: ["v0"],
                frame: { o: [x0, y0 + nb.h - lt, front], u: X, v: neg(Z), n: Y },
            }));
        }
        const hSide = nb.h - hTop - hBottom;
        if (faces.left)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/left`, label: "Habillage, gauche", length: hSide, width: depthAll, edges: ["v0"],
                frame: { o: [x0 + lt, y0 + hBottom, front], u: Y, v: neg(Z), n: neg(X) },
            }));
        }
        if (faces.right)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/right`, label: "Habillage, droite", length: hSide, width: depthAll, edges: ["v0"],
                frame: { o: [x0 + nb.w - lt, y0 + hBottom, front], u: Y, v: neg(Z), n: X },
            }));
        }
        let k = first;
        while (k < b.parts.length)
        {
            const q = b.parts[k]!;
            if (q.colour !== null)
            {
                q.notes.push(`Teinte ${q.colour}`);
            }
            k++;
        }
    }
}
