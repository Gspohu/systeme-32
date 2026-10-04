// Side fillers : a strip in the plane of the fronts closing the gap between a carcass and the wall of an alcove

import type { Carcass } from "./model";
import type { Build } from "./part_types";
import { CLEAT_THICKNESS, newPart, PLINTH_FOOT_GAP } from "./part_base";
import { X, Y, Z, neg } from "./geometry";
import { sideFiller } from "./extent";
import { spread } from "./fittings";
import { CLEAT_WIDTH } from "./ceiling";

// workshop conventions : a strip closes 150 mm at most, past that a carcass or a shelf. A cleat screwed every 400
const FILLER_MAX = 150;
const CLEAT_SCREW_PITCH = 400;


export function buildSideFillers(c: Carcass, b: Build): void
{
    const t = c.thickness;
    const front = c.fronts[0];
    for (const side of ["left", "right"] as const)
    {
        const w = sideFiller(c, side);
        if (w <= 0)
        {
            continue;
        }
        const where = side === "left" ? "gauche" : "droit";
        const name = `${c.name}, fileur ${where}`;
        if (c.ends[side].type === "rounded")
        {
            b.errors.push(`${name} : un bout arrondi occupe déjà ce côté. Retirer le fileur ou le bout arrondi.`);
            continue;
        }
        if (w > FILLER_MAX)
        {
            b.errors.push(`${name} : ${w} mm, au-delà des ${FILLER_MAX} mm d'un fileur. Combler par un caisson ou une `
                + "étagère, ou réduire l'écart.");
            continue;
        }
        const left = side === "left";
        // standing in the plane of the fronts, u up, v across : the edge against the wall is scribed, never banded
        const strip = newPart({
            item: c.id, itemName: c.name, thickness: t, decor: front?.decor ?? c.decor, colour: front?.colour ?? null,
            id: `${c.id}/side-filler/${side}`, label: `Fileur ${where}`, role: "filler", length: c.height, width: w,
            edges: left ? ["u0", "u1", "v1"] : ["u0", "u1", "v0"],
            frame: { o: [left ? c.x - w : c.x + c.width, c.y, c.z + c.depth], u: Y, v: X, n: Z },
        });
        strip.notes.push(`Largeur théorique ${w} mm : mur rarement d'aplomb, chant côté mur à ajuster sur place`);
        b.parts.push(strip);
        if (w < CLEAT_THICKNESS)
        {
            strip.notes.push("Trop étroit pour un tasseau : coller le fileur sur le chant de la joue");
        }
        else
        {
            // solid wood against the outer face of the side, behind the strip, glued to it
            b.parts.push(newPart({
                item: c.id, itemName: c.name, decor: "CHENE_MASSIF", id: `${c.id}/side-filler/${side}/cleat`,
                label: `Tasseau du fileur ${where}`, role: "cleat", length: c.height, width: CLEAT_WIDTH,
                thickness: CLEAT_THICKNESS, edges: [],
                frame: { o: [left ? c.x : c.x + c.width, c.y, c.z + c.depth - CLEAT_WIDTH], u: Y, v: Z,
                         n: left ? neg(X) : X },
            }));
            strip.notes.push("Collé sur son tasseau, lui-même vissé sur la joue");
            b.hardware.push({ ref: "SCREW_4x30", qty: spread(c.height, 100, CLEAT_SCREW_PITCH).length, item: c.id,
                             itemName: c.name, target: null, note: `tasseau du fileur ${where} sur la joue`,
                             purpose: "cleat-screw" });
        }
        // the plinth carried on under the strip, a length cut from the same board
        if (c.base.type === "plinth")
        {
            const y0 = c.y - c.base.height + PLINTH_FOOT_GAP;
            const plinth = newPart({
                item: c.id, itemName: c.name, thickness: t, decor: c.decor, id: `${c.id}/side-filler/${side}/plinth`,
                label: `Plinthe du fileur ${where}`, role: "plinth", length: w, width: c.base.height - PLINTH_FOOT_GAP,
                edges: ["v1"],
                frame: { o: [left ? c.x - w : c.x + c.width, y0, c.z + c.depth - c.base.setback - t], u: X, v: Y, n: Z },
            });
            plinth.notes.push("Collée en bout de plinthe, ajustée au mur sur place");
            b.parts.push(plinth);
        }
    }
}
