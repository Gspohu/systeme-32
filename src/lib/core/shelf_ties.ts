// A wall shelf tied to the carcasses it touches : what they carry down to the floor the wall no longer hold

import type { Carcass, Project, Settings, WallShelf } from "./model";
import type { Build, Part } from "./part_types";
import { byId } from "./edit";
import { meets } from "./drilling";
import { DIAM } from "./text";
import { at, neg, type Vec3 } from "./geometry";
import { FIST_OPENING } from "./wall_fixing";
import { HEAD_RATIO, HEAD_SINK } from "./screw_heads";
import { round1 } from "./text";

const HOLE = 5;
// Centres 2 countersinks apart : one countersink of solid wood left between the heads
const MIN_GAP = 2 * (HOLE * HEAD_RATIO + 2 * HEAD_SINK);
const SPOT_STEP = 1;
const TOP_SCREW_LENGTH = 50;
// Workshop conventions : each tie need 2 screws throught a side at these distances from the wall, 2 up through a top
const SIDE_SCREWS_Z = [60, 190];
const TOP_SCREWS_AT = [0.25, 0.75];


// From inside the carcass through its right side into the end of the shelf, heads hidden behind its door
function screwsThroughSide(w: WallShelf, c: Carcass, side: Part, b: Build, s: Settings): number
{
    let n = 0;
    // On the rows of the system 32 of the side, 37 off its front or its back edge and 32 apart from those : the
    // nearest to each place. Their heigth is the middle of the shelf, set by the shelf
    const rows: number[] = [];
    for (let k = 0; s.grid > 0 && s.connectorInset + k * s.grid <= side.width - s.connectorInset; k++)
    {
        rows.push(s.connectorInset + k * s.grid, side.width - s.connectorInset - k * s.grid);
    }
    for (const wanted of SIDE_SCREWS_Z)
    {
        const z = rows.length === 0 ? wanted : c.z + c.depth - rows.reduce((best, r) =>
        {
            return Math.abs(c.z + c.depth - r - wanted) < Math.abs(c.z + c.depth - best - wanted) ? r : best;
        });
        const inDepth = z > c.z && z < c.z + c.depth && z < w.z + w.depth;
        const u = w.y + w.thickness / 2 - c.y;
        const v = c.z + c.depth - z;
        if (!inDepth || u > side.length)
        {
            continue;
        }
        if (meets(side, "A", u, v, HOLE, side.thickness))
        {
            b.errors.push(`${w.name} : une vis depuis ${c.name} tombe sur un perçage de ${side.label.toLowerCase()}. `
                + "Déplacer une tablette ou un connecteur.");
            continue;
        }
        side.holes.push({ u, v, diameter: HOLE, depth: side.thickness, face: "A", purpose: "wall-fixing",
                          label: `Vis 5 x 50 dans ${w.name.toLowerCase()}, ${DIAM}${HOLE} traversant, tête fraisée` });
        n++;
    }
    return n;
}


// The cells under the top, between its sides and uprights, with room for the screw and the fist round its driver
// 50 + FIST_OPENING (ISO 15534-2:2000) : one of 173 in the book column took a screw no driver reached
function roomUnderTop(c: Carcass, top: Part, b: Build): [number, number][]
{
    const span = (q: Part, k: number): [number, number] =>
    {
        const ends = [0, q.length].flatMap((u) => { return [0, q.width].flatMap((v) => { return [0,
            q.thickness].map((t) =>
        {
            return at(q.frame!, u, v, t)[k]!;
        }); }); });
        return [Math.min(...ends), Math.max(...ends)];
    };
    const own = b.parts.filter((q) => { return q.item === c.id && q.frame !== null && q.id !== top.id; });
    const [x0, x1] = span(top, 0);
    const under = span(top, 1)[0];
    const walls = own.filter((q) => { return q.role === "side" || q.role === "vdivider"; }).map((q) => { return span(q,
        0); })
        .sort((a, z) => { return a[0] - z[0]; });
    const cells: [number, number][] = [];
    let from = x0;
    for (const [a, z] of walls)
    {
        if (z <= from || a >= x1)
        {
            continue;
        }
        if (a > from)
        {
            cells.push([from, a]);
        }
        from = Math.max(from, z);
    }
    if (from < x1)
    {
        cells.push([from, x1]);
    }
    return cells.filter(([a, z]) =>
    {
        const floor = Math.max(...own.filter((q) => { return Math.abs(q.frame!.n[1]) > 0.9 && q.role !== "shelf"; })
            .filter((q) => { const [qa, qz] = span(q, 0); return qa < z && qz > a && span(q, 1)[1] <= under; })
            .map((q) => { return span(q, 1)[1]; }), -Infinity);
        return under - floor >= TOP_SCREW_LENGTH + FIST_OPENING;
    }).map(([a, z]) => { return [a - x0, z - x0]; });
}


// Whether a screw driven along `way` from `from` over `length` runs into a drilling of the shelf it holds : a steel
// pin of its wall fixing sat 0.3 mm off the axis of one (T1 of the external review)
function meetsShelf(shelf: Part, from: Vec3, way: Vec3, length: number): boolean
{
    const f = shelf.frame!;
    return shelf.holes.some((h) =>
    {
        if (h.diameter <= 0)
        {
            return false;
        }
        const mid = h.w ?? shelf.thickness / 2;
        const [start, dir]: [Vec3, Vec3] = h.face === "A" ? [at(f, h.u, h.v, 0), f.n]
            : h.face === "B" ? [at(f, h.u, h.v, shelf.thickness), neg(f.n)]
            : h.face === "u0" ? [at(f, 0, h.v, mid), f.u] : h.face === "u1" ? [at(f, shelf.length, h.v, mid), neg(f.u)]
            : h.face === "v0" ? [at(f, h.u, 0, mid), f.v] : [at(f, h.u, shelf.width, mid), neg(f.v)];
        for (let step = 0; step <= length; step++)
        {
            const p = [0, 1, 2].map((k) => { return from[k]! + way[k]! * step - start[k]!; });
            const along = Math.max(0, Math.min(h.depth, p[0]! * dir[0] + p[1]! * dir[1] + p[2]! * dir[2]));
            const off = Math.hypot(p[0]! - dir[0] * along, p[1]! - dir[1] * along, p[2]! - dir[2] * along);
            if (off < h.diameter / 2 + HOLE / 2)
            {
                return true;
            }
        }
        return false;
    });
}


// Lying on the top of the carcass : screwed up through it, heads seen from under it
function screwsThroughTop(w: WallShelf, c: Carcass, top: Part, b: Build): number
{
    let n = 0;
    const cells = roomUnderTop(c, top, b);
    const shelf = byId(b.parts, `${w.id}/shelf`);
    const v = top.width / 2;
    // Clear of the top's drillings and of the shelf's, and a countersink apart from the other : 2 screws 15.8 apart
    // in the same line of chipboard held as one
    const clear = (u: number, placed: number[]): boolean =>
    {
        if (meets(top, "A", u, v, HOLE, top.thickness) || placed.some((x) => { return Math.abs(x - u) < MIN_GAP; }))
        {
            return false;
        }
        const from = at(top.frame!, u, v, 0);
        const way = top.frame!.n;
        return shelf === undefined || shelf.frame === null || !meetsShelf(shelf, from, way, TOP_SCREW_LENGTH);
    };
    const placed: number[] = [];
    // Every spot of a cell high enough to drive a screw from, along the top
    const spots = cells.flatMap(([a, z]) =>
    {
        const out: number[] = [];
        for (let u = a + HOLE; u <= z - HOLE; u += SPOT_STEP)
        {
            out.push(u);
        }
        return out;
    }).sort((x, y) => { return x - y; });
    for (const f of TOP_SCREWS_AT)
    {
        const wanted = top.length * f;
        // Where it was meant, or the nearest free spot walking out from it both ways, the lower one first on a tie
        let right = spots.findIndex((u) => { return u >= wanted; });
        right = right === -1 ? spots.length : right;
        let left = right - 1;
        let pick: number | undefined;
        while (pick === undefined && (left >= 0 || right < spots.length))
        {
            const takeLeft = right >= spots.length || (left >= 0 && wanted - spots[left]! <= spots[right]! - wanted);
            const u = takeLeft ? spots[left--]! : spots[right++]!;
            if (clear(u, placed))
            {
                pick = u;
            }
        }
        if (pick === undefined)
        {
            b.errors.push(cells.length === 0
                ? `${w.name} : aucune case sous le dessus de ${c.name} n'a ${TOP_SCREW_LENGTH + FIST_OPENING} mm pour `
                    + "visser par-dessous. Monter une tablette ou fixer l'étagère autrement."
                : `${w.name} : plus de place sous le dessus de ${c.name} pour une vis de liaison hors des perçages et à `
                    + `${round1(MIN_GAP)} mm de l'autre. Une seule vis la tient : déplacer un connecteur ou une fixation.`);
            break;
        }
        placed.push(pick);
        top.holes.push({ u: pick, v, diameter: HOLE, depth: top.thickness, face: "A", purpose: "wall-fixing",
                         label: `Vis 5 x 50 dans ${w.name.toLowerCase()}, ${DIAM}${HOLE} traversant, tête fraisée` });
        n++;
    }
    return n;
}


export function fitShelfTies(p: Project, b: Build): void
{
    for (const w of p.items)
    {
        const shelf = w.kind === "wallShelf" && w.tied === true ? byId(b.parts, `${w.id}/shelf`) : undefined;
        if (w.kind !== "wallShelf" || shelf === undefined)
        {
            continue;
        }
        const said: string[] = [];
        const line = (ref: string, qty: number, note: string): void =>
        {
            b.hardware.push({ ref, qty, item: w.id, itemName: w.name, target: shelf.id, note,
                             purpose: "shelf-bracket" });
        };
        for (const c of p.items)
        {
            if (c.kind !== "carcass" || c.wall !== w.wall)
            {
                continue;
            }
            const side = byId(b.parts, `${c.id}/side/R`);
            const inHeight = w.y >= c.y - 0.5 && w.y + w.thickness <= c.y + c.height + 0.5;
            if (side !== undefined && Math.abs(w.x - (c.x + c.width)) < 0.5 && inHeight)
            {
                const n = screwsThroughSide(w, c, side, b, p.settings);
                if (n > 0)
                {
                    line("WALL_SCREW_5x50", n, `étagère sur ${c.name}`);
                    said.push(`${n} vis 5 x 50 depuis l'intérieur de ${c.name}`);
                }
            }
            const top = byId(b.parts, `${c.id}/top`);
            const over = w.x < c.x + c.width - c.thickness && w.x + w.width > c.x + c.thickness;
            if (top !== undefined && Math.abs(w.y - (c.y + c.height)) < 0.5 && over)
            {
                const n = screwsThroughTop(w, c, top, b);
                if (n > 0)
                {
                    line("WALL_SCREW_5x50", n, `étagère sur ${c.name}`);
                    said.push(`${n} vis 5 x 50 à travers le dessus de ${c.name}`);
                }
            }
        }
        if (said.length === 0)
        {
            b.warnings.push(`${w.name} : à fixer sur un meuble, mais elle n'en touche aucun. Retirer l'option ou la déplacer.`);
            continue;
        }
        shelf.notes.push(`Tenue aussi par ${said.join(" et ")}, en plus de ses fixations murales`);
    }
}
