// A wall shelf tied to the carcasses it touches : what they carry down to the floor the wall no longer hold

import type { Carcass, Project, Settings, WallShelf } from "./model";
import type { Build, Part } from "./part_types";
import { byId } from "./edit";
import { meets } from "./drilling";
import { DIAM } from "./text";
import { at } from "./geometry";
import { FIST_OPENING } from "./wall_fixing";

const HOLE = 5;
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


// Lying on the top of the carcass : screwed up through it, heads seen from under it
function screwsThroughTop(w: WallShelf, c: Carcass, top: Part, b: Build): number
{
    let n = 0;
    const cells = roomUnderTop(c, top, b);
    // Each screw where it was meant, or the nearest third of a cell high enough to drive it from
    const spots = cells.flatMap(([a, z]) => { return [a + (z - a) / 3, a + 2 * (z - a) / 3]; });
    const taken = new Set<number>();
    for (const f of TOP_SCREWS_AT)
    {
        const wanted = top.length * f;
        const fits = cells.some(([a, z]) => { return wanted > a + HOLE && wanted < z - HOLE; });
        const near = spots.filter((s) => { return !taken.has(s); }).reduce<number | undefined>((best, s) =>
        {
            return best === undefined || Math.abs(s - wanted) < Math.abs(best - wanted) ? s : best;
        }, undefined);
        if (!fits && near === undefined)
        {
            b.errors.push(`${w.name} : aucune case sous le dessus de ${c.name} n'a ${TOP_SCREW_LENGTH + FIST_OPENING} mm `
                + "pour visser par-dessous. Monter une tablette ou fixer l'étagère autrement.");
            break;
        }
        const pick = fits ? wanted : near!;
        taken.add(pick);
        const [u, v] = [pick, top.width / 2];
        if (meets(top, "A", u, v, HOLE, top.thickness))
        {
            b.errors.push(`${w.name} : une vis vers ${c.name} tombe sur un perçage de ${top.label.toLowerCase()}. Déplacer `
                + "un connecteur.");
            continue;
        }
        top.holes.push({ u, v, diameter: HOLE, depth: top.thickness, face: "A", purpose: "wall-fixing",
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
