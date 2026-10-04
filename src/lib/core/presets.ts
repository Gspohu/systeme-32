// What a palette element give the project when dropped : the starting vaules of a new element, to adjust in
// the inspector, and the rules a dropped carcass obeys, the same the analysis checks

import type { Carcass, CellLight, DrawerFront, End, LiftFront, Lining, Project, SlatWall, SlidingFront, Wall,
    WallShelf } from "./model";
import { addItem, CommandError } from "./commands";
import { DEFAULT_BATTENS, newCarcass, newSlats, newWallShelf } from "./factory";
import { snap } from "./layout";
import { DESK_HEIGHT } from "./desk";
import { restsOnSeat } from "./seat";
import { itemsMeet } from "./room";

// workshop conventions of a new carcass : on a plinth on the floor, on the top of what it is dropped onto
export const NEW_CARCASS = { width: 600, height: 800, depth: 500, plinth: 100, setback: 50 };
export const NEW_DRAWERS: DrawerFront = { type: "drawers", count: 3, loadKg: 10 };
export const NEW_LIFT: LiftFront = { type: "lift", handleKg: 0 };
export const NEW_SHOE_RACK_LEVELS = 2;


// Top of the highest carcass or box under (x, y) on that wall, the floor when there is none
function supportUnder(p: Project, x: number, y: number, wall: Wall): number | null
{
    let best: number | null = null;
    for (const it of p.items)
    {
        if ((it.kind !== "carcass" && it.kind !== "box") || it.wall !== wall)
        {
            continue;
        }
        const top = it.y + it.height;
        if (x >= it.x && x <= it.x + it.width && top <= y + 1 && (best === null || top > best))
        {
            best = top;
        }
    }
    return best;
}


// A new carcass centred under (x, y), its left edge on the placing step : refused on a seat or into another item
export function dropCarcass(p: Project, x: number, y: number, wall: Wall, step: number): Project
{
    const n = NEW_CARCASS;
    const support = supportUnder(p, x, y, wall);
    const c = newCarcass({ name: `Caisson ${p.items.length + 1}`, width: n.width, height: n.height, depth: n.depth,
                           x: snap(x - n.width / 2, step), y: support ?? n.plinth, wall,
                           base: support === null ? { type: "plinth", height: n.plinth, setback: n.setback }
                               : { type: "floor" } });
    for (const s of p.items)
    {
        if (s.kind === "carcass" && s.seat !== null && restsOnSeat(p, s, c))
        {
            throw new CommandError("On ne pose rien sur une assise. Déposer le caisson ailleurs.");
        }
    }
    for (const o of p.items)
    {
        if (itemsMeet(c, o, p.room))
        {
            throw new CommandError(`Pas assez de place ici : le caisson de ${n.width} mm chevaucherait un meuble.`);
        }
    }
    return addItem(p, c);
}


export function newLight(kind: CellLight["kind"]): Omit<CellLight, "id" | "cell">
{
    // one centred spot, as in every niche of the reference photos
    return { kind, spots: kind === "spots" ? 1 : 0, setback: 40, kelvin: 3000 };
}


// in the back decor : an 8 mm sheet the back has opened already, the cost counting whole sheets
export function newLining(c: Carcass): Omit<Lining, "id" | "cell">
{
    return { decor: c.backDecor, colour: null, thickness: 8,
             faces: { back: true, left: true, right: true, top: true, bottom: true } };
}


// one leaf over half the track, damped
export function newSliding(c: Carcass, cellWidth: number): SlidingFront
{
    return { type: "sliding", leaves: 1, leafWidth: Math.round((cellWidth + 2 * c.thickness) / 2), damped: true };
}


export function newRoundEnd(c: Carcass): End
{
    return { type: "rounded", radius: Math.min(300, c.depth), sweep: 90, technique: "battens", flexThickness: 9,
             battens: DEFAULT_BATTENS, decor: c.decor };
}


// the top at the EN 527-1 height whatever the drop height, 1200 x 600 x 38 to start with (convention)
export function newDesk(wall: Wall): WallShelf
{
    const thickness = 38;
    return newWallShelf({ name: "Plan de bureau", purpose: "desk", y: DESK_HEIGHT - thickness, width: 1200, depth: 600,
                          thickness, wall });
}


// a divider stands in the room, away from the wall the front view looks at, floor to ceiling
export function newDivider(wall: Wall): SlatWall
{
    return newSlats({ name: "Claustra", mode: "divider", y: 0, z: 600, width: 1000, height: 2500, slatDepth: 60, gap: 40,
                      wall });
}
