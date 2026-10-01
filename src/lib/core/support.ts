// What holds each item up : the floor under its feet or its bottom, another item under it, or the wall it hangs on

import type { Project } from "./model";
import { CLASH_TOL, type Solid } from "./solids";


export function touches(a: Solid, b: Solid): boolean
{
    let k = 0;
    while (k < 3)
    {
        if (Math.min(a.max[k]!, b.max[k]!) - Math.max(a.min[k]!, b.min[k]!) < -CLASH_TOL)
        {
            return false;
        }
        k++;
    }
    return true;
}


// the solid below carry the one above : its top meets that bottom over a real piece of floor plan
export function carries(below: Solid, above: Solid, level: number): boolean
{
    return Math.abs(below.max[1] - level) <= CLASH_TOL && Math.abs(above.min[1] - level) <= CLASH_TOL
        && Math.min(below.max[0], above.max[0]) - Math.max(below.min[0], above.min[0]) > CLASH_TOL
        && Math.min(below.max[2], above.max[2]) - Math.max(below.min[2], above.min[2]) > CLASH_TOL;
}


export interface Unsupported
{
    item: string;
    name: string;
    why: string;
}


// What stands on nothing : feet off the floor, a box neither on the floor nor on another item, a corner touching none
export function unsupported(project: Project, all: Solid[]): Unsupported[]
{
    const out: Unsupported[] = [];
    for (const it of project.items)
    {
        const mine = all.filter((s) =>
        {
            return s.item === it.id;
        });
        if (mine.length === 0)
        {
            continue;
        }
        const hung = it.kind === "wallShelf" || it.kind === "box" || it.kind === "slats" || it.kind === "ladder"
            || (it.kind === "carcass" && it.base.type === "wall");
        if (hung)
        {
            continue;
        }
        const others = all.filter((s) =>
        {
            return s.item !== it.id;
        });
        if (it.kind === "corner")
        {
            if (!mine.some((m) =>
            {
                return others.some((o) =>
                {
                    return touches(m, o);
                });
            }))
            {
                out.push({ item: it.id, name: it.name, why: "touche aucun meuble" });
            }
            continue;
        }
        const level = Math.min(...mine.map((s) =>
        {
            return s.min[1];
        }));
        if (it.kind === "carcass" && (it.base.type === "plinth" || it.base.type === "feet"))
        {
            if (Math.abs(level) > CLASH_TOL)
            {
                out.push({ item: it.id, name: it.name, why: `pieds à ${Math.round(level)} mm du sol` });
            }
            continue;
        }
        if (Math.abs(level) <= CLASH_TOL)
        {
            continue;
        }
        const bottoms = mine.filter((s) =>
        {
            return Math.abs(s.min[1] - level) <= CLASH_TOL;
        });
        // each bottom face must sit on the top of a sloid of another item, a mere brush of an edge does not hold
        const resting = bottoms.some((m) =>
        {
            return others.some((o) =>
            {
                return carries(o, m, level);
            });
        });
        if (!resting)
        {
            out.push({ item: it.id, name: it.name, why: `ne repose sur rien à ${Math.round(level)} mm` });
        }
    }
    return out;
}
