// Which boards and which drillings leave the software : the CAD export and the finite element input pick them alike

import type { Build, Part } from "../part_types";


// The boards a CAD tool rebuilds and a simulation meshes : flat ones, a bent board has no frame to place it by
export function exportedParts(b: Build): Part[]
{
    return b.parts.filter((q) => { return q.frame !== null && q.curve === null; });
}

// Screw marks hold no diameter : no machining, they stay on the tables of the drawings
export function drilledHoles(q: Part): Part["holes"]
{
    return q.holes.filter((h) => { return h.diameter > 0 && h.depth > 0; });
}
