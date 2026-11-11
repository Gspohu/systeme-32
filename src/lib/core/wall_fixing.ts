// Anti-tip brackets of a standing carcass : where they go, which ones something standing on the top leaves out

import type { Carcass, Item, Settings } from "./model";
import type { Build, Purpose } from "./part_types";
import { byId } from "./edit";
import { topAngle, topAt } from "./slope";
import { box } from "./fitted";
import { boxesMeet, wallBox, type Box3 } from "./room";
import { spread } from "./fittings";
import { wallPlug } from "./wall_load";


// One central up to 500 wide, else 100 to 150 from each end (Furnica guide)
// no more than 800 apart and 20 from the back edge of the top (convention)
// TODO the 800 is a workshop habit, no maker figure read for it yet
const ANTI_TIP_SINGLE_MAX_WIDTH = 500;
const ANTI_TIP_INSET = 120;
const ANTI_TIP_MAX_SPACING = 800;
// Each leg of the bracket drilled in its middle
const ANTI_TIP_HOLE_FROM_WALL = 20;
// The generic 40 x 40 x 40 steel bracket of 2 mm priced in data/prices.ts
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


// Where a bracket lies, in the frame of the wall : on the highest point of the top under it, a sloped top
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


// Screws through the back into the wall, a wide washer under each head : 8 mm of board alone would pull through
export function fitBackWallScrews(c: Carcass, s: Settings, b: Build): void
{
    const back = byId(b.parts, `${c.id}/back`);
    const places = c.backWallScrews ?? [];
    if (back === undefined || places.length === 0)
    {
        return;
    }
    const wide = c.width > c.height;
    for (const { x, y } of places)
    {
        back.holes.push({ u: wide ? x : y, v: wide ? y : x, diameter: 5, depth: back.thickness, face: "A",
                          label: "Fixation au mur : vis 5 x 50, rondelle large, cheville", purpose: "wall-screw" });
    }
    back.notes.push("Vissé au mur par l'intérieur : caler derrière le fond si le mur n'est pas plan, sans le cintrer");
    const line = (ref: string): void =>
    {
        b.hardware.push({ ref, qty: places.length, item: c.id, itemName: c.name, target: back.id,
                          note: "à travers le fond", purpose: "wall-fixing" });
    };
    line("WASHER_5x20");
    const plug = wallPlug(s);
    if (plug !== "PLUG_HOLLOW_METAL")
    {
        line("WALL_SCREW_5x50_PAN");
    }
    if (plug !== null)
    {
        line(plug);
    }
}


// Brackets on the top of a standing carcass, screwed to the wall with the plug the wall material need
export function fitWallFixing(c: Carcass, s: Settings, b: Build, items: Item[]): void
{
    const top = byId(b.parts, `${c.id}/top`);
    // Held through its back, no bracket on top of that
    if (!c.fixToWall || c.base.type === "wall" || top === undefined || (c.backWallScrews ?? []).length > 0)
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
        // Measured along a sloped top
        const u = (x - c.thickness) / Math.cos(topAngle(c));
        // In the hole of the leg lying on the top, its middle off the wall : the applied back stands between
        const f = top.frame!;
        const v = (c.z + ANTI_TIP_HOLE_FROM_WALL - f.o[2] - u * f.u[2]) / f.v[2];
        top.holes.push({ u, v, diameter: 0, depth: 0, face: "B",
                         label: `Équerre anti-basculement : vis 4 x 16, à ${Math.round(top.width - v)} mm du chant arrière`,
                         purpose: "anti-tip-screw" });
        // One leg lying on the top from the wall, the other standing against the wall on it
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
    // The metal plug of a plasterboard wall hold its own screw, a timber reinforcement takes the screw alone
    const plug = wallPlug(s);
    if (plug !== "PLUG_HOLLOW_METAL")
    {
        line("WALL_SCREW_5x50_PAN", null, "wall-fixing");
    }  
    if (plug !== null)
    {
        line(plug, null, "wall-fixing");
    }
}
