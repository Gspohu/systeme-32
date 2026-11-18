// Side fillers : a strip in the plane of the fronts closing the gap between a carcass and the wall of an alcove

import type { Carcass } from "./model";
import type { Build } from "./part_types";
import { newPart, PLINTH_TOP_GAP } from "./part_base";
import { plinthFootGap } from "./curves";
import { END_TO_END } from "./io/cad_hardware";
import { DIAM } from "./text";
import { X, Y, Z, neg } from "./geometry";
import { sideFiller } from "./extent";
import { spread } from "./fittings";
import { CLEAT_WIDTH, FILLER_SCRIBE } from "./ceiling";
import { FRONT_GAP } from "../data/rules";


// Workshop conventions : a strip closes 150 mm at most, past that a carcass or a shelf. A cleat screwed every 800
// at most, half the rows of the 400 it had : far too many for a hidden strip
const FILLER_MAX = 150;
const CLEAT_SCREW_PITCH = 800;
// The 2 dowels of a plinth carried on under the strip : 25 off its edges, 18 deep in each end for 35 long
const END_DOWEL_INSET = 25;
const END_DOWEL_DEPTH = 18;


export function buildSideFillers(c: Carcass, b: Build): void
{
    const board = c.thickness;
    const front = c.fronts[0];
    for (const side of ["left", "right"] as const)
    {
        const fillerWidth = sideFiller(c, side);
        if (fillerWidth <= 0)
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
        if (fillerWidth > FILLER_MAX)
        {
            b.errors.push(`${name} : ${fillerWidth} mm, au-delà des ${FILLER_MAX} mm d'un fileur. Combler par un caisson ou une `
                + "étagère, ou réduire l'écart.");
            continue;
        }
        const left = side === "left";
        // Standing in the plane of the fronts, u up, v across : the edge against the wall is scribed, nevr banded
        const strip = newPart({
            item: c.id, itemName: c.name, thickness: board, decor: front?.decor ?? c.decor, colour: front?.colour ?? null,
            id: `${c.id}/side-filler/${side}`, label: `Fileur ${where}`, role: "filler", length: c.height,
            width: fillerWidth,
            edges: left ? ["u0", "u1", "v1"] : ["u0", "u1", "v0"],
            frame: { o: [left ? c.x - fillerWidth : c.x + c.width, c.y, c.z + c.depth + FRONT_GAP], u: Y, v: X, n: Z },
        });
        strip.scribe = FILLER_SCRIBE;
        strip.notes.push(`Largeur finie ${fillerWidth} mm, débitée à ${fillerWidth + FILLER_SCRIBE} mm : mur rarement `
            + "d'aplomb, chant côté mur recoupé sur place");
        b.parts.push(strip);
        if (fillerWidth < board)
        {
            strip.notes.push("Trop étroit pour un tasseau : coller le fileur sur le chant de la joue");
        }
        else
        {
            // A strip of the carcass board against the outer face of the side, behind the filler : hidden, whole
            // in the length of the side, out of the offcuts of the cutting plan
            const rows = spread(c.height, 100, CLEAT_SCREW_PITCH);
            const cleat = newPart({
                item: c.id, itemName: c.name, decor: c.decor, id: `${c.id}/side-filler/${side}/cleat`,
                label: `Tasseau du fileur ${where}`, role: "cleat", length: c.height, width: CLEAT_WIDTH, thickness: board,
                edges: [],
                frame: { o: [left ? c.x : c.x + c.width, c.y, c.z + c.depth + FRONT_GAP - CLEAT_WIDTH], u: Y, v: Z,
                         n: left ? neg(X) : X },
            });
            cleat.notes.push(`Bande de ${CLEAT_WIDTH} mm débitée dans le panneau de la caisse, cachée derrière le fileur`);
            for (const s of rows)
            {
                // Through the cleat into the side, its head on the face toward the wall : seen by no one, where a head
                // inside the carcass shows when the door opens
                cleat.holes.push({ u: s, v: CLEAT_WIDTH / 2, diameter: 0, depth: 0, face: "B",
                                   label: `Tasseau du fileur ${where} dans la joue : vis 4 x 30`, purpose: "cleat-screw" });
            }
            b.parts.push(cleat);
            // Glued on the front edge of its cleat, as the ceiling filler is (ceiling.ts) : screwed from the back
            // edge of the cleat, the screws stood in the gap between the side and the wall, shut once the carcass is in
            strip.notes.push("Collé sur le chant avant de son tasseau une fois le meuble en place et fixé : recoupé au mur, "
                + "présenté à sec, puis dos poncé, colle polyuréthane, maintenu jusqu'à la prise");
            b.hardware.push({ ref: "SCREW_4x30", qty: rows.length, item: c.id,
                             itemName: c.name, target: null, note: `tasseau du fileur ${where} sur la joue`,
                             purpose: "cleat-screw" });
            b.hardware.push({ ref: "GLUE_PU", qty: 1, item: c.id, itemName: c.name, target: strip.id,
                              note: `fileur ${where} collé sur le chant avant de son tasseau, une fois le meuble posé`,
                              purpose: "cleat-screw" });
        }
        // The plinth carried on under the strip, a length cut from the same board
        if (c.base.type === "plinth")
        {
            const foot = plinthFootGap(c);
            const y0 = c.y - c.base.height + foot;
            const plinth = newPart({
                item: c.id, itemName: c.name, thickness: board, decor: c.decor, id: `${c.id}/side-filler/${side}/plinth`,
                label: `Plinthe du fileur ${where}`, role: "plinth", length: fillerWidth,
                width: c.base.height - foot - PLINTH_TOP_GAP,
                edges: ["v1"],
                frame: { o: [left ? c.x - fillerWidth : c.x + c.width, y0, c.z + c.depth - c.base.setback - board], u: X,
                         v: Y, n: Z },
            });
            plinth.notes.push("Collée et tourillonnée en bout de plinthe, ajustée au mur sur place");
            b.parts.push(plinth);
            // 2 dowels across the butt, half their length in each end, glued
            const main = b.parts.find((q) => { return q.id === `${c.id}/plinth`; });
            for (const v of [END_DOWEL_INSET, plinth.width - END_DOWEL_INSET])
            {
                plinth.holes.push({ u: left ? fillerWidth : 0, v, w: board / 2, diameter: 8, depth: END_DOWEL_DEPTH,
                                   face: left ? "u1" : "u0",
                                    label: `Tourillon ${DIAM}8 x 35${END_TO_END}`, purpose: "dowel" });
                main?.holes.push({ u: left ? 0 : main.length, v, w: board / 2, diameter: 8, depth: END_DOWEL_DEPTH,
                                   face: left ? "u0" : "u1", label: `Tourillon ${DIAM}8 x 35`, purpose: "dowel" });
            }
            b.hardware.push({ ref: "DOWEL_8x35", qty: 2, item: c.id, itemName: c.name, target: plinth.id,
                              note: `plinthe du fileur ${where}, collés`, purpose: "dowel" });
        }
    }
}
