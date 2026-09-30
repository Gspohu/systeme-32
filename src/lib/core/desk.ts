// Desk tops : work surface height and room left for the legs underneath

import type { Project, WallShelf } from "./model";
import type { Check } from "./analysis";
import { boxToWall, roomBox } from "./room";

// BS EN 527-1:2011 as the Task Systems conformity sheet quotes it : a fixed desk at 740 +- 20 mm
// with 850 mm of legroom width under it
// https://www.tasksystems.co.uk/cmsb/uploads/bs-en-527.pdf
export const DESK_HEIGHT = 740;
export const DESK_TOLERANCE = 20;
export const LEGROOM_WIDTH = 850;


// Widest stretch under the desk that no other item takes, along its awll
export function legroom(p: Project, w: WallShelf): number
{
    const taken: [number, number][] = [];
    for (const it of p.items)
    {
        if (it.id === w.id)
        {
            continue;
        }
        const b = boxToWall(w.wall, p.room, roomBox(it, p.room));
        const under = b.min[1] < w.y - 0.5 && b.min[2] < w.z + w.depth - 0.5 && b.max[2] > w.z + 0.5;
        if (under && b.max[0] > w.x && b.min[0] < w.x + w.width)
        {
            taken.push([Math.max(w.x, b.min[0]), Math.min(w.x + w.width, b.max[0])]);
        }
    }
    taken.sort((a, b) =>
    {
        return a[0] - b[0];
    });
    let best = 0;
    let from = w.x;
    for (const [a, b] of taken)
    {
        best = Math.max(best, a - from);
        from = Math.max(from, b);
    }
    return Math.max(best, w.x + w.width - from);
}


export function deskChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    for (const w of p.items)
    {
        if (w.kind !== "wallShelf" || w.purpose !== "desk")
        {
            continue;
        }
        const top = w.y + w.thickness;
        if (Math.abs(top - DESK_HEIGHT) > DESK_TOLERANCE)
        {
            checks.push({ level: "warning", item: w.id, target: null,
                          message: `${w.name} : plan à ${Math.round(top)} mm du sol, un bureau fixe se tient à `
                              + `${DESK_HEIGHT} +- ${DESK_TOLERANCE} mm (EN 527-1:2011). Ajuster la hauteur.` });
        }
        const free = legroom(p, w);
        if (free < LEGROOM_WIDTH)
        {
            checks.push({ level: "warning", item: w.id, target: null,
                          message: `${w.name} : ${Math.round(free)} mm libres pour les jambes, ${LEGROOM_WIDTH} demandés `
                              + "sous un bureau fixe (EN 527-1:2011). Élargir le plan ou écarter les caissons." });
        }
    }
    return checks;
}
