// Radiators, boxes and skirtings on the walls : wha the furniture runs into, and the room a radiator need

import type { Obstacle, ObstacleKind, Project } from "./model";
import type { Build } from "./part_types";
import type { Check } from "./check";
import { boxesMeet, boxToRoom, type Box3 } from "./room";
import { solids, type Solid } from "./solids";


export const OBSTACLE_LABELS: Record<ObstacleKind, string> = {
    radiator: "Radiateur", box: "Boîtier", skirting: "Plinthe murale",
};


// starting values, the radiator and the skirting measuerd at the entrance in Colmar : edited to the real ones
export const OBSTACLE_DEFAULTS: Record<ObstacleKind, Omit<Obstacle, "id" | "name" | "kind" | "wall">> = {
    radiator: { x: 0, y: 150, width: 500, height: 600, depth: 120, clearance: null },
    box: { x: 0, y: 1350, width: 120, height: 180, depth: 40, clearance: null },
    skirting: { x: 0, y: 0, width: 1000, height: 100, depth: 15, clearance: null },
};


// in the frame of its wall : x along it, y up from the floor, z out of the wall
export function obstacleBox(o: Obstacle): Box3
{
    return { min: [o.x, o.y, 0], max: [o.x + o.width, o.y + o.height, o.depth] };
}


// A solid takes som of the box : its own box is enough for a flat board, a curved one is sounded inside the common
// space
function takes(s: Solid, box: Box3): boolean
{
    if (!boxesMeet(box, { min: s.min, max: s.max }))
    {
        return false;
    }
    if (s.cheap)
    {
        return true;
    }
    const lo = [0, 1, 2].map((k) =>
    {
        return Math.max(box.min[k]!, s.min[k]!);
    });
    const hi = [0, 1, 2].map((k) =>
    {
        return Math.min(box.max[k]!, s.max[k]!);
    });
    const n = 5;
    const at = (d: number, t: number): number =>
    {
        return lo[d]! + (hi[d]! - lo[d]!) * (t + 0.5) / n;
    };
    for (let i = 0; i < n; i++)
    {
        for (let j = 0; j < n; j++)
        {
            for (let k = 0; k < n; k++)
            {
                if (s.holds([at(0, i), at(1, j), at(2, k)], 0.5))
                {
                    return true;
                }
            }
        }
    }
    return false;
}


export function obstacleChecks(p: Project, b: Build): Check[]
{
    const checks: Check[] = [];
    if (p.room.obstacles.length === 0)
    {
        return checks;
    }
    const all = solids(p, b); 
    const names = new Map(p.items.map((it) =>
    {
        return [it.id, it.name] as const;
    }));
    for (const o of p.room.obstacles)
    {
        const what = `${OBSTACLE_LABELS[o.kind]} ${o.name}`;
        const box = boxToRoom(o.wall, p.room, obstacleBox(o));
        const byItem = new Map<string, Solid[]>();
        for (const s of all)
        {
            if (takes(s, box))
            {
                byItem.set(s.item, [...(byItem.get(s.item) ?? []), s]);
            }
        }
        for (const [item, hit] of byItem)
        {
            const name = names.get(item) ?? item;
            if (o.kind === "skirting")
            {
                checks.push({ level: "warning", item, target: null, message: `${name} : ${what} derrière, `
                    + `${o.depth} mm de saillie sur ${o.height} de haut. La déposer au droit du meuble ou entailler le bas `
                    + "des joues." });
                continue;
            }
            // a box let in through a cut-out of the back meets nothing : the volume of a cut board leaves its hole out
            const labels = [...new Set(hit.map((s) =>
            {
                return s.label;
            }))].join(", ");
            checks.push({ level: "error", item, target: null, message: `${name} : ${what} (${o.width} x ${o.height}, `
                + `${o.depth} de saillie) traverse ${labels}. Déplacer le meuble, ou découper le fond autour et laisser `
                + "la case libre devant." });
        }
        if (o.kind !== "radiator")
        {
            continue;
        }
        if (o.clearance === null)
        {
            checks.push({ level: "info", item: null, target: null,
                         message: `${what} : dégagement de sa notice non saisi, `
                + "aucune distance au mobilier contrôlée." });
            continue;  
        }
        const c = o.clearance;
        const around = boxToRoom(o.wall, p.room, { min: [o.x - c, o.y, 0], max: [o.x + o.width + c, o.y + o.height + c,
                                                                                 o.depth + c] });
        const near = new Set(all.filter((s) =>
        {
            return !byItem.has(s.item) && takes(s, around);
        }).map((s) =>
        {
            return s.item;
        }));
        for (const item of near)
        {
            checks.push({ level: "warning", item, target: null,
                         message: `${names.get(item) ?? item} : à moins de ${c} mm `
                + `du ${what.toLowerCase()}, sa notice demande ce dégagement. L'écarter.` });
        }
    }
    return checks;
}
