// Seats : a carcass top someone sits on, checked for the seat static load of a seating test

import type { Carcass, Project } from "./model";
import type { ResolvedLayout } from "./layout";
import type { Build, Part } from "./parts";
import type { Check } from "./analysis";
import { byId } from "./edit";
import { itemExtent } from "./extent";
import { boxToRoom, roomBox } from "./room";
import { tipping } from "./mechanics";
import { frontFootInset } from "./feet";
import { MATERIALS } from "../data/materials";
import { GRAVITY } from "../data/rules";

// EN 16139:2013 level 1 seat static load, 10 times : report 5F013838C of SP Technical Research Institute
// of Sweden (2015-09-17), non-domestic seating for adulst up to 110 kg
export const SEAT_LOAD_N = 1600;
// same report, seat front edge static load : someone sat on the very edge, the case that tips a bench
export const SEAT_EDGE_N = 1300;
// EN 1995-1-1:2004 partial factor of a fundamental combination for particleboard, MDF and solid timber
// (COFORD table D.1, Irish NA), 1.0 being for accidental ones only. It divides a characteristic value, the
// makers publish a mean : a margin on the mean here
export const GAMMA_M = 1.3;


export interface SeatCheck
{
    // widest free span of the top between two supports reaching it, mm
    span: number;
    // bending stress under the load at mid span, and what the board may take, N/mm2
    stress: number;
    allowed: number;
    // deflection under the load, mm
    deflection: number;
}


// Free spans of the top : between the sides, cut by every upright that runs up to it
export function seatSpans(c: Carcass, lay: ResolvedLayout): number[]
{
    const t = c.thickness;
    const edges: [number, number][] = [];
    for (const d of lay.dividers)
    {
        if (d.axis === "v" && d.y + d.h >= c.height - t - 0.01)
        {
            edges.push([d.x, d.x + d.w]);
        }
    }
    edges.sort((a, b) =>
    {
        return a[0] - b[0];
    });
    const spans: number[] = [];
    let from = t;
    for (const [x0, x1] of edges) 
    {
        spans.push(x0 - from);
        from = x1;
    }
    spans.push(c.width - t - from);
    return spans;
}


// Point load at the middle of the widest span, the whole depth of the top working as a simple beam
export function checkSeat(c: Carcass, lay: ResolvedLayout, top: Part): SeatCheck
{
    const m = MATERIALS[top.material]!;
    const span = Math.max(...seatSpans(c, lay));
    const b = top.width;
    const t = top.thickness;
    const moment = SEAT_LOAD_N * span / 4;
    const stress = moment / (b * t * t / 6);
    const deflection = SEAT_LOAD_N * span ** 3 / (48 * m.modulus * (b * t ** 3 / 12));
    return { span, stress, allowed: m.strength / GAMMA_M, deflection };
}


// A seat holds a person, and nothing may stand on it
export function seatChecks(p: Project, b: Build): Check[]
{
    const checks: Check[] = [];
    for (const it of p.items)
    {
        const lay = it.kind === "carcass" && it.seat !== null ? b.layouts.get(it.id) : undefined;
        const top = byId(b.parts, `${it.id}/top`);
        if (it.kind !== "carcass" || it.seat === null || lay === undefined || top === undefined)
        {
            continue;
        }
        const r = checkSeat(it, lay, top);
        const figures = `portée libre ${Math.round(r.span)} mm, ${r.stress.toFixed(1)} N/mm² pour ${r.allowed.toFixed(1)} `
            + `admissibles, flèche ${r.deflection.toFixed(1)} mm`;
        if (r.stress > r.allowed)
        {
            checks.push({ level: "error", item: it.id, target: top.id,
                          message: `${it.name} : l'assise ne porte pas une personne (${SEAT_LOAD_N} N, essai EN 16139:2013), `
                              + `${figures}. Ajouter un montant sous l'assise ou épaissir le dessus.` });
        }
        else
        {
            checks.push({ level: "info", item: it.id, target: top.id,
                          message: `${it.name} : assise vérifiée sous ${SEAT_LOAD_N} N (EN 16139:2013 niveau 1), ${figures}. `
                              + "Marge : résistance moyenne du fabricant divisée par 1,3, le gamma M d'EN 1995-1-1:2004 qui "
                              + "vise normalement une valeur caractéristique, non publiée." });
        }
        top.notes.push(`Assise : ${SEAT_LOAD_N} N au milieu de la portée de ${Math.round(r.span)} mm, rien ne se pose dessus`);
        const edge = tipping(it, b, frontFootInset(it), 0);
        const fixed = it.fixToWall && it.base.type !== "wall";
        if (edge !== null && !fixed && edge.criticalKg < SEAT_EDGE_N / GRAVITY)
        {
            checks.push({ level: "error", item: it.id, target: null,
                          message: `${it.name} : une personne assise au bord (${SEAT_EDGE_N} N, essai EN 16139:2013) `
                              + `fait basculer l'assise, qui cède dès ${edge.criticalKg.toFixed(0)} kg. `
                              + "La fixer au mur ou l'approfondir." });
        }
        if (it.seat.cushion > 0)
        {
            checks.push({ level: "info", item: it.id, target: null,
                          message: `${it.name} : coussin ${it.width} x ${it.depth} x ${it.seat.cushion} mm à faire `
                              + "réaliser par un tapissier." });
        }
        const seatTop = itemExtent(it).y1;
        const plate = boxToRoom(it.wall, p.room, { min: [it.x, it.y, it.z], max: [it.x +
            it.width, seatTop, it.z + it.depth] });
        for (const o of p.items)
        {
            const e = roomBox(o, p.room);
            const acrossX = o.id !== it.id && e.min[0] < plate.max[0] && e.max[0] > plate.min[0];
            const acrossZ = e.min[2] < plate.max[2] && e.max[2] > plate.min[2];
            // standing on the top or sunk in the cushion
            const resting = e.min[1] >= it.y + it.height - 0.5 && e.min[1] <= seatTop + 0.5;
            if (acrossX && acrossZ && resting)
            {
                checks.push({ level: "error", item: o.id, target: null,
                              message: `${o.name} est posé sur l'assise de ${it.name}. Rien ne se pose sur une assise : `
                                  + "le déplacer." });
            }
        }
    }
    return checks;
}
