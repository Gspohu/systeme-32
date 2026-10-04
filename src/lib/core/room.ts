// Items built against their own wall, placed in the room : back wall z = 0, left wall x = 0, right wall x = width

import type { Item, Room, Wall } from "./model";
import type { Vec3 } from "./geometry";
import { itemDepth, itemExtent } from "./extent";


export interface Box3
{
    min: Vec3;
    max: Vec3;
}


// Rotation about the vertical and origin of each wall frame : facing the left wall the corner
// with the back wall is on the right, facing the right wall it is on the left
export function wallPlacement(wall: Wall, room: Room): { angle: number; origin: Vec3 }
{
    if (wall === "left")
    {
        return { angle: Math.PI / 2, origin: [0, 0, room.depth] };
    }
    if (wall === "right")
    {
        return { angle: -Math.PI / 2, origin: [room.width, 0, 0] };
    }
    return { angle: 0, origin: [0, 0, 0] };
}


export function toRoom(wall: Wall, room: Room, p: Vec3): Vec3
{
    if (wall === "left")
    {
        return [p[2], p[1], room.depth - p[0]];
    }
    if (wall === "right")
    {
        return [room.width - p[2], p[1], p[0]];
    }
    return [p[0], p[1], p[2]];
}


export function toWall(wall: Wall, room: Room, p: Vec3): Vec3
{
    if (wall === "left")
    {
        return [room.depth - p[2], p[1], p[0]];
    }
    if (wall === "right")
    {
        return [p[2], p[1], room.width - p[0]];
    }
    return [p[0], p[1], p[2]];
}


// The eight corners of a box carried into another frame, and the box around them
function carry(b: Box3, map: (p: Vec3) => Vec3): Box3
{
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const x of [b.min[0], b.max[0]])
    {
        for (const y of [b.min[1], b.max[1]])
        {
            for (const z of [b.min[2], b.max[2]])
            {
                const q = map([x, y, z]);
                let k = 0;
                while (k < 3)
                {
                    min[k] = Math.min(min[k]!, q[k]!);
                    max[k] = Math.max(max[k]!, q[k]!);
                    k++;
                }
            }
        }
    }
    return { min, max };
}


export function wallBox(it: Item): Box3
{
    const e = itemExtent(it);
    return { min: [e.x0, e.y0, it.z], max: [e.x1, e.y1, it.z + itemDepth(it)] };
}


export function boxToRoom(wall: Wall, room: Room, b: Box3): Box3
{
    return carry(b, (p) =>
    {
        return toRoom(wall, room, p);
    });
}


export function boxToWall(wall: Wall, room: Room, b: Box3): Box3
{
    return carry(b, (p) =>
    {
        return toWall(wall, room, p);
    });
}


export function roomBox(it: Item, room: Room): Box3
{
    return boxToRoom(it.wall, room, wallBox(it));
}


// Touching faces are fine, 0.5 mm tolerance
export function boxesMeet(a: Box3, b: Box3): boolean
{
    let k = 0;
    while (k < 3)
    {
        if (a.max[k]! <= b.min[k]! + 0.5 || b.max[k]! <= a.min[k]! + 0.5)
        {
            return false;
        }
        k++;
    }
    return true;
}


// Two items take the same room space, a round corner and an appliance excepted : the corner is meant for the notch
// between the boxes it joins, an appliance may sit in a cell and has its own checks
export function itemsMeet(a: Item, b: Item, room: Room): boolean
{
    return a.kind !== "corner" && b.kind !== "corner" && a.kind !== "device" && b.kind !== "device"
        && boxesMeet(roomBox(a, room), roomBox(b, room));
}


// How far a side wall runs from the back wall : its return in an alcove, else the depth of the room
export function sideWallDepth(room: Room, side: "left" | "right"): number
{
    return Math.min(room.returns?.[side] ?? room.depth, room.depth);
}


export const WALL_LABELS: Record<Wall, string> = { back: "Mur du fond", left: "Mur gauche", right: "Mur droit" };
