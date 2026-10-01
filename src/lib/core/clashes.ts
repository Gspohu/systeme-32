// What the volumes do wrong : one that sinks into the floor, two that cross each other. Boxes find the
// candidates, the true shapes decide

import type { Vec3 } from "./geometry";
import { CLASH_TOL, type Solid } from "./solids";

// points tried per axis in the space two boxes share : for two straight boards that space is the overlap itself
// only a curved shape need the grid
const GRID = 6;


export function belowFloor(all: Solid[]): Solid[]
{
    return all.filter((s) =>
    {
        return s.min[1] < -CLASH_TOL;
    });
}


export interface Clash
{
    a: Solid;
    b: Solid;
    // a point found inside both, room millimetres
    at: Vec3;
}


// a point of the space both boxes share that lies inside both true shapes
function sharedPoint(a: Solid, b: Solid): Vec3 | null
{
    const [first, second] = b.cheap && !a.cheap ? [b, a] : [a, b];
    const lo: Vec3 = [0, 0, 0];
    const hi: Vec3 = [0, 0, 0];
    let k = 0;
    while (k < 3)
    {
        lo[k] = Math.max(a.min[k]!, b.min[k]!);
        hi[k] = Math.min(a.max[k]!, b.max[k]!);
        if (hi[k]! - lo[k]! <= 2 * CLASH_TOL)
        {
            return null;
        }
        k++;
    }
    let i = 0;
    while (i < GRID)
    {
        let j = 0;
        while (j < GRID)
        {
            let l = 0;
            while (l < GRID)
            {
                const q: Vec3 = [lo[0] + (hi[0] - lo[0]) * (i + 0.5) / GRID, lo[1] + (hi[1] - lo[1]) * (j + 0.5) / GRID,
                                 lo[2] + (hi[2] - lo[2]) * (l + 0.5) / GRID];
                if (first.holds(q, CLASH_TOL) && second.holds(q, CLASH_TOL))
                {
                    return q;
                }
                l++;
            }
            j++;
        }
        i++;
    }
    return null;
}


export function clashes(all: Solid[]): Clash[]
{
    const out: Clash[] = [];
    let i = 0;
    while (i < all.length)
    {
        let j = i + 1;
        const a = all[i]!;
        while (j < all.length)
        {
            // the battens of one batch and a skin with its flat run are one part, laid out not to cross
            const other = all[j]!;
            const samePart = a.part !== null && a.part === other.part;
            if (samePart || (other.host !== null && other.host === a.part) || (a.host !== null && a.host === other.part))
            {
                j++;
                continue;
            }
            const q = sharedPoint(all[i]!, other);
            if (q !== null)
            {
                out.push({ a: all[i]!, b: all[j]!, at: q });
            }
            j++;
        }
        i++;
    }
    return out;
}
