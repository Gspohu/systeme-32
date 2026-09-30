// Ventilation grills let into the plinth, spread evenly along it, each an opening cut in the board

import type { Carcass } from "./model";
import type { Build } from "./parts";
import type { Outline } from "./geometry";
import { byId } from "./edit";

// Häfele U.K. Furniture Fittings Technology 2018 p. 11.60 : 458 x 65 over its rim, set in a 448 x 55 opening of a
// board 10 to 20 mm thick, over 200 cm2 of air each
export const VENT_GRILL = { rimW: 458, rimH: 65, cutW: 448, cutH: 55, minBoard: 10, maxBoard: 20, areaCm2: 200 };


function rect(u0: number, v0: number, w: number, h: number): Outline
{
    return { start: [u0, v0], segments: [
        { kind: "line", x: u0 + w, y: v0 },
        { kind: "line", x: u0 + w, y: v0 + h },
        { kind: "line", x: u0, y: v0 + h },
        { kind: "line", x: u0, y: v0 },
    ] };
}


export function fitVentGrills(c: Carcass, b: Build): void
{
    const n = c.base.type === "plinth" ? Math.round(c.base.grills ?? 0) : 0;
    const plinth = byId(b.parts, `${c.id}/plinth`);
    if (n <= 0 || plinth === undefined)
    {
        return;
    }
    const g = VENT_GRILL;
    const where = `${c.name}, grilles de ventilation`;
    if (plinth.thickness < g.minBoard || plinth.thickness > g.maxBoard)
    {
        b.errors.push(`${where} : plinthe de ${plinth.thickness} mm, les grilles se clipsent sur ${g.minBoard} à `
            + `${g.maxBoard} mm (Häfele p. 11.60).`);
        return;
    }
    if (plinth.width < g.rimH || plinth.length / n < g.rimW)
    {
        b.errors.push(`${where} : ${n} grille(s) de ${g.rimW} x ${g.rimH} ne tiennent pas sur une plinthe de `
            + `${Math.round(plinth.length)} x ${Math.round(plinth.width)}. Moins de grilles ou une plinthe plus haute.`);
        return;
    }
    let i = 0;
    while (i < n)
    {
        const u = plinth.length * (i + 0.5) / n - g.cutW / 2;
        plinth.cutouts.push(rect(u, (plinth.width - g.cutH) / 2, g.cutW, g.cutH));
        i++;
    }
    plinth.notes.push(`${n} découpe(s) ${g.cutW} x ${g.cutH} pour grilles de ventilation, d'après le DXF`);
    b.hardware.push({ ref: "571.77.300", qty: n, item: c.id, itemName: c.name, target: plinth.id,
                      note: `plus de ${n * g.areaCm2} cm² de passage d'air, clipsée par l'arrière` });
}
