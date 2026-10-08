// Whether a face drilling fit clear of the holes already there, shared by the connectors and the shelf pins

import type { Hole, Part, Purpose } from "./part_types";


// drillings laid out to open into each othe : the lead of a spot comes out of its housing
const JOINED: [Purpose, Purpose][] = [["spot", "light-lead"]];


// A face drilling at (u, v) metes hole h : on the same face when the circles come within 2 mm, from the other
// face when both run into each other. A screw opint counts as Ø4 x 15
function hitsHole(h: Hole, thickness: number, face: "A" | "B", u: number, v: number, diameter: number,
                  depth: number): boolean
{
    if (h.face !== "A" && h.face !== "B")
    {
        return false;
    }
    const d = h.diameter === 0 ? 4 : h.diameter;
    const deep = h.depth === 0 ? 15 : h.depth;
    return Math.hypot(h.u - u, h.v - v) < (d + diameter) / 2 + 2 && (h.face === face || deep + depth >= thickness);
}


export function metHole(p: Part, face: "A" | "B", u: number, v: number, diameter: number,
                        depth: number): Hole | undefined
{
    return p.holes.find((h) =>
    {
        return hitsHole(h, p.thickness, face, u, v, diameter, depth);
    });
}


// every pair of face drillings of the part that meet, whatever placed them
export function crossedHoles(p: Part): [Hole, Hole][]  
{
    const pairs: [Hole, Hole][] = [];
    p.holes.forEach((x, i) =>
    {
        if (x.face !== "A" && x.face !== "B")
        {
            return;
        }
        for (const y of p.holes.slice(i + 1))
        {
            const joined = JOINED.some(([m, n]) =>
            {
                return (x.purpose === m && y.purpose === n) || (x.purpose === n && y.purpose === m);
            });
            if (!joined && hitsHole(y, p.thickness, x.face, x.u, x.v, x.diameter === 0 ? 4 : x.diameter,
                         x.depth === 0 ? 15 : x.depth))
            {
                pairs.push([x, y]);
            }
        }
    });
    return pairs;
}


export function meets(p: Part, face: "A" | "B", u: number, v: number, diameter: number, depth: number): boolean
{
    return metHole(p, face, u, v, diameter, depth) !== undefined;
}
