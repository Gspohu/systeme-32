// Gravity on what stands on the floor : does it stand, how far the floor may tilt before it falls, and the
// carpet test of ASTM F2057-23. A rigid body on a rigid floor tips when its centre of mass passes over the edge
// of its supports, the same answer a physics engine would reach without its noise

import type { Item, Project } from "./model";
import type { Build } from "./parts";
import { partMass } from "./fittings";
import { topDrawerExtension } from "./mechanics";
import { toWall } from "./room";
import { CLASH_TOL, type Solid } from "./solids";
import { carries, touches } from "./support";
import { AXILO_PLATE_D } from "./feet";

// ASTM F2057-23 § 9.2.3 as summed up by the CPSC (Ballot vote sheet, 22 March 2023) : 60 lb on the edge of an
// open drawer, the unit tilted forward on a 0.43 in block under its back to stand for a carpet
export const ASTM_CARPET_BLOCK = 10.9;
export const ASTM_DRAWER_LOAD_KG = 27.2;


export interface Stability
{
    items: string[];
    name: string;
    // hung on the wall or fixed to it : what follows tells what the fixing saves it from
    held: boolean;
    massKg: number;
    // centre of mass in room millimetres
    centre: [number, number, number];
    stands: boolean;
    // how far the centre lies inside its supports, negative outside, and towards which side it is nearest the edge
    margin: number;
    // floor tilt that makes it fall, degrees, and towards which side
    tiltDeg: number;
    towards: string;
    // carpet test, null without drawers
    carpet: { passes: boolean; tiltDeg: number } | null;
}


function hull(points: [number, number][]): [number, number][]
{
    const pts = [...points].sort((a, b) =>
    {
        return a[0] - b[0] || a[1] - b[1];
    });
    if (pts.length < 3)
    {
        return pts;
    }
    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };
    const lower: [number, number][] = [];
    for (const p of pts)
    {
        while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
        {
            lower.pop();
        }
        lower.push(p);
    }
    const upper: [number, number][] = [];
    for (const p of [...pts].reverse())
    {
        while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
        {
            upper.pop();
        }
        upper.push(p);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}


// items standing on each other are one body, held as a whole if one of them hangs on the wall or is fixed to it
function bodies(project: Project, all: Solid[]): Item[][]
{
    const ids = project.items.map((it) =>
    {
        return it.id;
    });
    const parent = new Map(ids.map((id) =>
    {
        return [id, id];
    }));
    const find = (x: string): string =>
    {
        let r = x;
        while (parent.get(r) !== r)
        {
            r = parent.get(r)!;
        }
        return r;
    };
    const corner = new Set(project.items.filter((it) =>
    {
        return it.kind === "corner";
    }).map((it) =>
    {
        return it.id;
    }));
    let i = 0;
    while (i < all.length)
    {
        let j = i + 1;
        while (j < all.length)
        {
            const a = all[i]!;
            const b = all[j]!;
            // a round corner joins what it touches, a box joins what it stands on
            if (a.item !== b.item && touches(a, b)
                && (carries(a, b, b.min[1]) || carries(b, a, a.min[1]) || corner.has(a.item) || corner.has(b.item)))
            {
                parent.set(find(a.item), find(b.item));
            }
            j++;
        }
        i++;
    }
    const groups = new Map<string, Item[]>();
    for (const it of project.items)
    {
        const r = find(it.id);
        groups.set(r, [...(groups.get(r) ?? []), it]);
    }
    return [...groups.values()];
}


function held(it: Item): boolean
{
    if (it.kind === "carcass")
    {
        return it.base.type === "wall" || it.fixToWall;
    }
    return it.kind === "wallShelf" || it.kind === "box" || it.kind === "slats" || it.kind === "ladder";
}


function sideName(d: [number, number, number]): string
{
    if (Math.abs(d[2]) >= Math.abs(d[0]))
    {
        return d[2] > 0 ? "l'avant" : "l'arrière";
    }
    return d[0] > 0 ? "la droite" : "la gauche";
}


export function stability(project: Project, b: Build, all: Solid[]): Stability[]
{
    const out: Stability[] = [];
    const bySolidPart = new Map<string, Solid[]>();
    for (const s of all)
    {
        if (s.part !== null)
        {
            bySolidPart.set(s.part, [...(bySolidPart.get(s.part) ?? []), s]);
        }
    }
    for (const body of bodies(project, all))
    {
        const ids = new Set(body.map((it) =>
        {
            return it.id;
        }));
        // centre of mass : each part at the middle of its own volumes
        let massKg = 0;
        const c: [number, number, number] = [0, 0, 0];
        for (const p of b.parts)
        {
            const vols = bySolidPart.get(p.id);
            if (!ids.has(p.item) || vols === undefined)
            {
                continue;
            }
            const mass = partMass(p, false);
            for (const v of vols)
            {
                let k = 0;
                while (k < 3)
                {
                    c[k] = c[k]! + mass / vols.length * (v.min[k]! + v.max[k]!) / 2;
                    k++;
                }
            }
            massKg += mass;
        }
        if (massKg <= 0)
        {
            continue;
        }
        const centre: [number, number, number] = [c[0] / massKg, c[1] / massKg, c[2] / massKg];
        // what touches the floor : round foot plates, else the floor face of the parts lying on it
        const contact: [number, number][] = [];
        for (const s of all)
        {
            if (!ids.has(s.item) || s.min[1] > CLASH_TOL)
            {
                continue;
            }
            const cx = (s.min[0] + s.max[0]) / 2;
            const cz = (s.min[2] + s.max[2]) / 2;
            if (s.label.endsWith("patin"))
            {
                let k = 0;
                while (k < 16)
                {
                    const a = 2 * Math.PI * k / 16;
                    contact.push([cx + AXILO_PLATE_D / 2 * Math.cos(a), cz + AXILO_PLATE_D / 2 * Math.sin(a)]);
                    k++;
                }
                continue;
            }
            contact.push([s.min[0], s.min[2]], [s.max[0], s.min[2]], [s.min[0], s.max[2]], [s.max[0], s.max[2]]);
        }
        const poly = hull(contact);
        if (poly.length < 3)
        {
            continue;
        }
        const first = body[0]!;
        const wallDir = (d: [number, number]): [number, number, number] =>
        {
            const o = toWall(first.wall, project.room, [0, 0, 0]);
            const q = toWall(first.wall, project.room, [d[0], 0, d[1]]);
            return [q[0] - o[0], 0, q[2] - o[2]];
        };
        // a body backed against its wall cannot fall backwards : the wall stop it
        const backed = body.some((it) =>
        {
            return it.kind === "carcass" && it.z <= CLASH_TOL;
        });
        // signed distance to each edge, the ring running counter clockwise : positive inside
        let margin = Infinity;
        let open = Infinity;
        let towards = "";
        let i = 0;
        while (i < poly.length)
        {
            const [x0, z0] = poly[i]!;
            const [x1, z1] = poly[(i + 1) % poly.length]!;
            const len = Math.hypot(x1 - x0, z1 - z0);
            const d = ((x1 - x0) * (centre[2] - z0) - (z1 - z0) * (centre[0] - x0)) / len;
            const side = sideName(wallDir([(z1 - z0) / len, -(x1 - x0) / len]));
            margin = Math.min(margin, d);
            if (d < open && !(backed && side === "l'arrière"))
            {
                open = d;
                towards = side;
            }
            i++;
        }
        const tiltDeg = Math.atan2(Math.max(0, open), centre[1]) * 180 / Math.PI;
        // carpet test about the front edge of the supports, in the frame of the wall
        let carpet: Stability["carpet"] = null;
        const drawers = body.filter((it) =>
        {
            return it.kind === "carcass" && topDrawerExtension(it) > 0;
        });
        if (drawers.length > 0)
        {
            const zs = contact.map(([x, z]) =>
            {
                return toWall(first.wall, project.room, [x, 0, z])[2];
            });
            const front = Math.max(...zs);
            const back = Math.min(...zs);
            const alpha = Math.atan2(ASTM_CARPET_BLOCK, front - back);
            const cw = toWall(first.wall, project.room, centre);
            const restore = massKg * ((front - cw[2]) * Math.cos(alpha) - cw[1] * Math.sin(alpha));
            let worst = -Infinity;
            for (const it of drawers)
            {
                if (it.kind !== "carcass")
                {
                    continue;
                }
                // the load stands at the top of the carcass, the highest a drawer edge can be
                // TODO ASTM loads each drawer in turn at its own heigth, the top is the worst case taken for all
                const zL = it.z + it.depth + topDrawerExtension(it);
                const yL = it.y + it.height;
                worst = Math.max(worst, ASTM_DRAWER_LOAD_KG * ((zL - front) * Math.cos(alpha) + yL * Math.sin(alpha)));
            }
            carpet = { passes: margin > 0 && restore > worst, tiltDeg: alpha * 180 / Math.PI };
        }
        out.push({
            items: [...ids], name: body.map((it) =>
            {
                return it.name;
            }).join(" + "),
            held: body.some(held), massKg, centre, stands: margin > 0, margin, tiltDeg, towards, carpet,
        });
    }
    return out;
}
