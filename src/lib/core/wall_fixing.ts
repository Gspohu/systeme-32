// Anti-tip brackets of a standing carcass : where they go, which ones something standing on the top leaves out

import type { Carcass, Item, Settings } from "./model";
import type { Build, Purpose } from "./part_types";
import { byId } from "./edit";
import { topAngle, topAt } from "./slope";
import { box } from "./fitted";
import { boxesMeet, wallBox, type Box3 } from "./room";
import { spread } from "./fittings";

// one central up to 500 wide, else 100 to 150 from each end (Furnica guide)
// no more than 800 apart and 20 from the back edge of the top (convention)
// TODO the 800 and the 20 are workshop habits, no maker figure read for them yet
const ANTI_TIP_SINGLE_MAX_WIDTH = 500;
const ANTI_TIP_INSET = 120;
const ANTI_TIP_MAX_SPACING = 800;
const ANTI_TIP_FROM_BACK = 20;
// the generic 40 x 40 x 40 steel bracket of 2 mm priced in data/prices.ts
const ANTI_TIP_BRACKET_SIZE = 40;
const ANTI_TIP_BRACKET_THICKNESS = 2;


// Centres of the anti-tip brackets along the carcass width, from its left outer face
export function antiTipPositions(width: number): number[]
{
    if (width <= ANTI_TIP_SINGLE_MAX_WIDTH)
    {
        return [width / 2];
    }
    return spread(width, ANTI_TIP_INSET, ANTI_TIP_MAX_SPACING);
}


// where a bracket lies, in the frame of the wall : on the highest point of the top under it, a sloped top
// gets a bracket bent to its angle
function bracketBox(c: Carcass, x: number): Box3
{
    const half = ANTI_TIP_BRACKET_SIZE / 2;
    const y = c.y + (c.slope === null ? c.height : Math.max(topAt(c, x - half), topAt(c, x + half)));
    return { min: [c.x + x - half, y, c.z], max: [c.x + x + half, y + ANTI_TIP_BRACKET_SIZE, c.z +
                                                  ANTI_TIP_BRACKET_SIZE] };
}


// Each bracket position, with the name of what stands over it when something does : no bracket fits under
// another item, a carcass above holds the lower one once the two are joined
export function antiTipKept(c: Carcass, items: Item[]): { x: number; under: string | null }[]
{
    return antiTipPositions(c.width).map((x) =>
    {
        const space = bracketBox(c, x);
        const over = items.find((k) =>
        {
            return k.id !== c.id && k.wall === c.wall && boxesMeet(space, wallBox(k));
        });
        return { x, under: over === undefined ? null : over.name };
    });
}


// Brackets on the top of a standing carcass, screwed to the wall with the plug the wall material need
export function fitWallFixing(c: Carcass, s: Settings, b: Build, items: Item[]): void
{
    const top = byId(b.parts, `${c.id}/top`);
    if (!c.fixToWall || c.base.type === "wall" || top === undefined)
    {
        return;
    }
    const kept = antiTipKept(c, items);
    for (const name of new Set(kept.map((k) =>
    {
        return k.under;
    })))
    {
        if (name !== null)
        {
            b.infos.push(`${c.name} : pas d'équerre anti-basculement sous ${name}, posé dessus. Le plus haut le `
                + "retient par les vis de liaison qui les serrent l'un à l'autre.");
        }
    }
    const at = kept.filter((k) =>
    {
        return k.under === null;
    }).map((k) =>
    {
        return k.x;
    });
    const t = ANTI_TIP_BRACKET_THICKNESS;
    const S = ANTI_TIP_BRACKET_SIZE;
    for (const x of at)
    {
        // measured along a sloped top
        const u = (x - c.thickness) / Math.cos(topAngle(c));
        top.holes.push({ u, v: top.width - ANTI_TIP_FROM_BACK, diameter: 0, depth: 0, face: "B",
                         label: `Équerre anti-basculement : vis 4 x 16, à ${ANTI_TIP_FROM_BACK} mm du chant arrière (convention)`,
                         purpose: "anti-tip-screw" });
        // one leg lying on the top from the wall, the other standing against the wall on it
        const y = bracketBox(c, x).min[1];
        const key = `${c.id}/equerre-${Math.round(x)}`;
        const label = `${c.name} : équerre anti-basculement`;
        const x0 = c.x + x - S / 2;
        const x1 = c.x + x + S / 2;
        b.fitted.push(
            box(`${key}/a`, c.id, "ANTI_TIP_BRACKET", label, "anti-tip", [x0, y, c.z], [x1, y + t, c.z + S], true),
            box(`${key}/b`, c.id, "ANTI_TIP_BRACKET", label, "anti-tip", [x0, y + t, c.z], [x1, y + S, c.z + t], true),
        );
    }
    const n = at.length;
    if (n === 0)
    {
        return;
    }
    const line = (ref: string, note: string | null, purpose: Purpose): void =>
    {
        b.hardware.push({ ref, qty: n, item: c.id, itemName: c.name, target: top.id, note, purpose });
    };
    line("ANTI_TIP_BRACKET", "sur le dessus, jamais dans le fond", "anti-tip");
    line("SCREW_4x16", null, "anti-tip-screw");
    if (s.wallType === "plasterboard")
    {
        line("PLUG_HOLLOW_METAL", null, "wall-fixing");
        return;
    }
    line("WALL_SCREW_5x50", null, "wall-fixing");
    line(s.wallType === "aerated" ? "PLUG_AERATED" : "PLUG_NYLON_8x40", null, "wall-fixing");
}
