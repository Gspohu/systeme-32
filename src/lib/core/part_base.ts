// The bottom of every breakdown : a new part, where a carcass box starts and how high its base lifts it

import type { Carcass } from "./model";
import type { Part } from "./part_types";
import { type Vec3, rectOutline } from "./geometry";
import { decorById, materialOfDecor } from "../data/materials";

// Häfele plinth holder : plinth height = foot height minus 5 to 10 mm, 7 kpt
export const PLINTH_FOOT_GAP = 7;

// the cleat stock of slats, ceiling fillers and side fillers, 40 x 20 solid wood
export const CLEAT_THICKNESS = 20;


export function newPart(p: Omit<Part, "outline" | "cutouts" | "holes" | "grooves" | "notes" | "curve" | "quantity" |
                        "grain" | "material" | "colour" | "bevel"> & Partial<Part>): Part
{
    const decor = decorById(p.decor);
    const mat = p.material ?? materialOfDecor(decor).id;
    const part: Part = {
        quantity: 1,
        outline: rectOutline(p.length, p.width),
        cutouts: [],
        holes: [],
        grooves: [],
        notes: [],
        curve: null,
        colour: null,
        bevel: { u0: 0, u1: 0 },
        grain: decor.grain,
        ...p,
        material: mat,
    };
    // a lacquer colour left over from a former decor means nothing on this one
    if (decor.id !== "MDF_LAQUE")
    {
        part.colour = null;
    }
    return part;
}


export function baseHeight(c: Carcass): number
{
    if (c.base.type === "plinth" || c.base.type === "feet")
    {
        return c.base.height;
    }
    return 0;
}


// World origin of the carcass box (back left bottom)
export function boxOrigin(c: Carcass): Vec3
{
    return [c.x, c.y, c.z];
}
