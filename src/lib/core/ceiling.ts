// Up to the ceiling : the filler strip over a carcass, and whether a tall carcass can be raised in the room

import type { Carcass, Project, Room } from "./model";
import type { Check } from "./check";
import type { Build, Edge } from "./part_types";
import { newPart } from "./part_base";
import { sideWallDepth } from "./room";
import { X, Y, Z, neg } from "./geometry";
import type { Cut } from "./solid_stock";
import { spread } from "./fittings";
import { FRONT_GAP } from "../data/rules";


// The slat cleats of the same project, 40 x 20
export const CLEAT_WIDTH = 40;
// A filler sawn this much wider than finished, its edge against the wall or the ceiling recut to fit on site
// Workshop convention : cut to the exact gap, 25 mm left nothing to scribe (review of 2026-11-09)
export const FILLER_SCRIBE = 15;
// Workshop conventions, the screws of the side fillers
const CEILING_CLEAT_SCREW_END = 100;
// How near a side wall an end stands to be against it
const WALL_TOUCH = 1;
const CEILING_CLEAT_SCREW_PITCH = 400;
// Its long screw runs in the width of the cleat, 10 in the strip of 19, along it from the screw into the top
export const CLEAT_TO_STRIP = { hole: 5, along: 25 };


export function fillerGap(c: Carcass, room: Room): number
{
    return room.height - (c.y + c.height);
}


export function buildCeilingFiller(c: Carcass, room: Room, b: Build, cut: Cut): void
{
    if (!c.ceilingFiller)
    {
        return;
    }
    const name = `${c.name}, fileur de plafond`;
    const gap = fillerGap(c, room);
    if (c.slope !== null || c.seat !== null)
    {
        b.errors.push(`${name} : pas de fileur sur un dessus en pente ni sur une assise. Le décocher.`);
        return;
    }
    if (gap < 1)
    {
        b.errors.push(`${name} : le caisson touche le plafond (${room.height} mm). Le décocher ou baisser le caisson.`);
        return;
    }
    const t = c.thickness;
    // In the plane of the overlay façades, in their decor whne there are some
    const front = c.fronts[0];
    // An end against a side wall is seen by no one : no edging there
    const reach = c.z + c.depth + FRONT_GAP + t;
    const walled = (side: "left" | "right"): boolean =>
    {
        const at = side === "left" ? c.x <= WALL_TOUCH : c.x + c.width >= room.width - WALL_TOUCH;
        return at && (room.walls ?? []).includes(side) && sideWallDepth(room, side) >= reach;
    };
    const edges: Edge[] = [...(walled("left") ? [] : ["u0" as const]), ...(walled("right") ? [] : ["u1" as const]),
                           "v0"];
    const strip = newPart({
        item: c.id, itemName: c.name, thickness: t, decor: front?.decor ?? c.decor, colour: front?.colour ?? null,
        id: `${c.id}/filler`, label: "Fileur de plafond", role: "filler", length: c.width, width: gap,
        edges,
        frame: { o: [c.x, c.y + c.height, c.z + c.depth + FRONT_GAP], u: X, v: Y, n: Z },
    });
    strip.scribe = FILLER_SCRIBE;
    strip.notes.push(`Hauteur finie ${Math.round(gap)} mm, débitée à ${Math.round(gap) + FILLER_SCRIBE} mm : plafond rarement `
        + "droit, chant du haut recoupé sur place");
    b.parts.push(strip);
    if (gap < t)
    {
        strip.notes.push("Trop étroit pour un tasseau : coller le fileur sur le chant du dessus");
        return;
    }
    // A strip of the carcass board, hidden behind the filler, whole between the sides out of the offcuts
    const l = c.width - 2 * t;
    const common = { item: c.id, itemName: c.name, decor: c.decor, id: `${c.id}/filler-cleat`,
                    label: "Tasseau du fileur",
                     role: "cleat" as const, length: l, edges: [], width: CLEAT_WIDTH, thickness: t };
    // Standing behind the strip, or laid flat on the top when the gap is lower than the cleat is wdie
    const flat = gap < CLEAT_WIDTH;
    const part = newPart({ ...common, frame: !flat
        ? { o: [c.x + t, c.y + c.height, c.z + c.depth + FRONT_GAP - t], u: X, v: Y, n: Z }
        : { o: [c.x + t, c.y + c.height + t, c.z + c.depth + FRONT_GAP], u: X, v: neg(Z), n: neg(Y) } });
    part.notes.push(`Bande de ${CLEAT_WIDTH} mm débitée dans le panneau de la caisse, cachée derrière le fileur`);
    b.parts.push(part);
    const spots = spread(l, CEILING_CLEAT_SCREW_END, CEILING_CLEAT_SCREW_PITCH);
    // TODO a cleat standing behind a strip higher than 40 takes no screw yet : the fixing check names it
    if (flat)
    {
        // Down through the cleat into the top, nothing of it seen from the room, before the carcass is set. The strip
        // glued on the front edge of the cleat once it stands : on it before, the carcass wouldn't pass under the
        // ceiling, and the back edge of the cleat is against the wall then
        for (const s of spots)
        {
            part.holes.push({ u: s, v: CLEAT_WIDTH / 2, diameter: 0, depth: 0, face: "A",
                              label: "Tasseau du fileur dans le dessus : vis 4 x 30", purpose: "cleat-screw" });
        }
        b.hardware.push({ ref: "SCREW_4x30", qty: spots.length, item: c.id, itemName: c.name, target: null,
                          note: "tasseau du fileur de plafond dans le dessus, avant de poser la colonne", purpose: "cleat-screw" });
        b.hardware.push({ ref: "GLUE_PU", qty: 1, item: c.id, itemName: c.name, target: strip.id,
                          note: "fileur de plafond collé sur le chant avant de son tasseau, une fois la colonne posée",
                          purpose: "cleat-screw" });
        strip.notes.push("Collé sur le chant avant du tasseau une fois la colonne en place : ajusté au plafond, dos poncé, "
            + "colle polyuréthane, maintenu jusqu'à la prise");
    }
}


export function ceilingChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    const h = p.room.height;
    for (const c of p.items)
    {
        if (c.kind !== "carcass" || c.base.type === "wall")
        {
            continue;
        }
        // Assembled lying on its back, it's raised about its bottom front edge
        const swing = Math.hypot(c.height, c.depth);
        if (swing > h)
        {
            checks.push({ level: "warning", item: c.id, target: null,
                          message: `${c.name} : couché sur le dos, il se relève en balayant ${Math.round(swing)} mm, plus que `
                              + `les ${h} mm sous plafond. L'assembler debout sur place ou le scinder en deux caissons.` });
        }
    }
    return checks;
}
