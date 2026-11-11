// What stops a carcass standing loose from coming out : a light screwed in front of it lower than its top. Read by
// its plan note and by the assembly sequence, which sets that light once the carcass is in

import type { Carcass, Project } from "./model";
import type { Build, Fitted } from "./part_types";


// Half its reach along an axis of the room, its box turned any way
function reach(f: Fitted, k: 0 | 1 | 2): number
{
    return [0, 1, 2].reduce((s, i) => { return s + Math.abs(f.axes[i as 0 | 1 | 2][k]) * f.half[i]!; }, 0);
}


export function lowest(f: Fitted): number
{
    return f.centre[1] - reach(f, 1);
}


// Each light in the way of a loose carcass, with what it holds (a strip in its profile), by its key : the loose
// carcasses it stops, in the order they stand in the project
export function lightsInTheWay(p: Project, b: Build): Map<string, Carcass[]>
{
    const out = new Map<string, Carcass[]>();
    for (const c of p.items)
    {
        if (c.kind !== "carcass" || c.freeStanding !== true)
        {
            continue;
        }
        const top = c.y + c.height;
        for (const f of b.fitted)
        {
            const across = Math.abs(f.centre[0] - (c.x + c.width / 2)) < reach(f, 0) + c.width / 2;
            if (f.purpose === "light" && f.shape === "box" && f.host === null && f.centre[2] > c.z + c.depth && across
                && lowest(f) < top)
            {
                for (const g of b.fitted.filter((x) => { return x.key === f.key || x.host === f.key; }))
                {
                    out.set(g.key, [...(out.get(g.key) ?? []), c]);
                }
            }
        }
    }
    return out;
}
