// What a cell of a cacrass may recieve besides its front : a print, a socket hole, shoe racks, a rail, a light

import type { Id } from "./model";

// A project photo printed to the size of the back of a cell and pasted on it, stretched, never tiled
export interface CellPrint
{
    id: Id;
    cell: Id;
    file: string;
}  


// A socket or cable hole through the back of a cell or the panel above or below it, `w` the diameter of a round
// one : its centre moved from the middle of the cell, across then up on the back or frontwards elsewhere
export interface Outlet
{
    id: Id;
    cell: Id;
    panel: "back" | "above" | "below";
    shape: "round" | "rect";
    w: number;
    h: number;
    dx: number;
    dy: number;
}

// Shoe racks screwed to the back of a cell, levels spread evenly from its floor
export interface ShoeRack
{
    id: Id;
    cell: Id;
    levels: number;
}


// Clothes rail across a cell, hung under the panel above it, or pulled down on a wardrobe lift
export interface HangingRail
{
    id: Id;
    cell: Id;
    kind: "fixed" | "lift";
}


// LED profile or round Häfele spots spread across the cell, let into the panel above at `setback` from its front
export interface CellLight
{
    id: Id;
    cell: Id;
    kind: "strip" | "spots";
    spots: number;
    setback: number;
    kelvin: 2700 | 3000 | 4000;
    // dimmed and switched from a phone through a Wi-Fi controller on the driver output
    wifi?: boolean;
}
