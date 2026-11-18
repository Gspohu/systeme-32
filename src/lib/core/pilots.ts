// Pilot holes bored in the workshop for the screws of the bought hardware : nothing to measure nor drill on site

import type { Build, Purpose } from "./part_types";
import { screwOf } from "../data/screws";

// The bit Blum's MOVENTO notice LIT.MOV5000.09.16 p. 2 bores its Ø3.5 screws with, taken for every hardware screw up
// to Ø4 : a chipboard screw cuts its own thread past it
export const PILOT_DIAMETER = 2.5;
const PILOT_MAX_SCREW = 4;
// Stopped short of the tip, whose thread bites the lsat of it, and of the far face, left whole
export const PILOT_SHORT = 3;
const PILOTED = new Set<Purpose>(["runner-screw", "adapter-screw", "cup-screw", "handle-screw", "plate-screw",
                                  "flap-screw", "foot-mount-screw"]);


// Every screw position of a hinge plate, a runner, a pull, a TIP-ON adapter, a flap fitting or a foot base turned
// into a drilling : marked only, it was found on site by a mark measured off the edges
export function drillPilots(b: Build): void
{
    for (const q of b.parts)
    {
        for (const h of q.holes)
        {
            if (h.diameter !== 0 || !PILOTED.has(h.purpose))
            {
                continue;
            }
            const spec = screwOf(h.purpose, h.label);
            if (spec === null || spec.diameter > PILOT_MAX_SCREW)
            {
                continue;
            }
            h.diameter = PILOT_DIAMETER;
            h.depth = Math.max(1, Math.min(spec.length - PILOT_SHORT, q.thickness - PILOT_SHORT));
        }
    }
}