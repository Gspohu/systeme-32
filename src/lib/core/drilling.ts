// Whether a new face drilling runs into a hole already there, shared by the connectors and the shelf pins

import type { Hole, Part } from "./part_types";


// A face drilling at (u, v) meets a hole already there : on the same face when the circles come within 2 mm, from
// the other face when both run into each other. A screw point counts as Ø4 x 15
export function metHole(p: Part, face: "A" | "B", u: number, v: number, diameter: number,
                        depth: number): Hole | undefined
{
    return p.holes.find((h) =>
    {
        if (h.face !== "A" && h.face !== "B")
        {
            return false;
        }
        const d = h.diameter === 0 ? 4 : h.diameter;
        const deep = h.depth === 0 ? 15 : h.depth;
        return Math.hypot(h.u - u, h.v - v) < (d + diameter) / 2 + 2 && (h.face === face || deep + depth >= p.thickness);
    });
}


export function meets(p: Part, face: "A" | "B", u: number, v: number, diameter: number, depth: number): boolean
{
    return metHole(p, face, u, v, diameter, depth) !== undefined;
}
