// A screw whose head bears on the wood : a pilot through its first board and a countersink, the head a little under the
// face so that a cover cap can go over it

import type { Build, Hole } from "./part_types";
import { screwOf } from "../data/screws";
import { DIAM, round1 } from "./text";

// How far the head stands under the face
export const HEAD_SINK = 0.4;
// A chipboard screw head of twice its diameter : Blum 609.1500 Ø3.5 head 7, DIN 7505:1986 type A Ø5 head 10
export const HEAD_RATIO = 2;
// Into the wood, what no plate of metal or plastic takes the head of
const HEAD_ON_WOOD = new Set(["link-screw", "wall-fixing", "doubler-screw", "cleat-screw", "back-screw", "front-screw",
                              "lining-screw", "plinth-screw", "spacer-screw"]);


// A cleat drilled through its width takes the head in its back edge, as the CAD export places it
function bears(h: Hole): boolean
{
    const face = h.face === "A" || h.face === "B" || (h.purpose === "cleat-screw" &&
                                                      (h.face === "v0" || h.face === "v1"));
    return HEAD_ON_WOOD.has(h.purpose) && face && !h.label.includes("267.07");
}


export function sinkHeads(b: Build): void
{
    for (const q of b.parts)
    {
        for (const h of q.holes)
        {
            const spec = bears(h) ? screwOf(h.purpose, h.label) : null;
            if (spec === null || spec.kind === "bolt")
            {
                continue;
            }
            const head = spec.diameter * HEAD_RATIO;
            // A cone of 90° from the face : the head its own diameter at the depth it sinks to
            h.countersink = head + 2 * HEAD_SINK;
            if (h.diameter === 0)
            {
                h.diameter = spec.diameter;
                h.depth = q.thickness;
            }
            h.label = `${h.label}, fraisé ${DIAM}${round1(h.countersink)}`;
        }
    }
}
