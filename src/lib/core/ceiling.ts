// Up to the ceiling : the filler strip over a carcass, and whether a tall carcass can be raised in the room

import type { Carcass, Project, Room } from "./model";
import type { Check } from "./check";
import type { Build, Edge } from "./part_types";
import { newPart } from "./part_base";
import { sideWallDepth } from "./room";
import { X, Y, Z, neg } from "./geometry";
import { spread } from "./fittings";
import { FRONT_GAP } from "../data/rules";


// The slat cleats of the same project, 40 x 20
export const CLEAT_WIDTH = 40;
// A filler sawn this much wider than finished, its edge against the wall or the ceiling recut to fit on site
// Workshop convention : cut to the exact gap, 25 mm left nothing to scribe (review of 2026-11-09)
export const FILLER_SCRIBE = 15;
// What a carcass stood up from its back keeps under the ceiling at least, for the hands and a ceiling not quite flat :
// the check and the gamme read this one value
export const STAND_UP_MARGIN = 50;
// Workshop conventions, the screws of the side fillers
const CEILING_CLEAT_SCREW_END = 100;
// How near a side wall an end stands to be against it
const WALL_TOUCH = 1;
const CEILING_CLEAT_SCREW_PITCH = 400;


export function fillerGap(c: Carcass, room: Room): number
{
    return room.height - (c.y + c.height);
}


export function buildCeilingFiller(c: Carcass, room: Room, b: Build): void
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
    const top = b.parts.find((q) => { return q.id === `${c.id}/top`; });
    if (flat && top !== undefined && top.frame !== null)
    {
        // Up through the top into the cleat from the cell under it, once the carcass stands : screwed down on the bench
        // the cleat went up with it and left 6 mm under the ceiling (T6 of the external review). The strip glued on
        // the front edge of the cleat after it
        const f = top.frame;
        for (const s of spots)
        {
            const world = [c.x + t + s, c.y + c.height, c.z + c.depth + FRONT_GAP - CLEAT_WIDTH / 2];
            const rel = [world[0]! - f.o[0], world[1]! - f.o[1], world[2]! - f.o[2]];
            const [u, v] = [f.u, f.v].map((a) => { return rel[0]! * a[0] + rel[1]! * a[1] + rel[2]! * a[2]; });
            top.holes.push({ u: u!, v: v!, diameter: 0, depth: 0, face: "A",
                             label: "Tasseau du fileur de plafond depuis le dessus : vis 4 x 30", purpose: "cleat-screw" });
        }
        b.hardware.push({ ref: "SCREW_4x30", qty: spots.length, item: c.id, itemName: c.name, target: null,
                          note: "tasseau du fileur de plafond, vissé par-dessous une fois la colonne posée",
                          purpose: "cleat-screw" });
        b.hardware.push({ ref: "GLUE_PU", qty: 1, item: c.id, itemName: c.name, target: strip.id,
                          note: "fileur de plafond collé sur le chant avant de son tasseau, une fois la colonne posée",
                          purpose: "cleat-screw" });
        strip.notes.push("Collé sur le chant avant du tasseau une fois la colonne en place et fixée : ajusté au plafond, "
            + "présenté à sec, puis dos poncé, colle polyuréthane, maintenu jusqu'à la prise");
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
        if (swing > h - STAND_UP_MARGIN)
        {
            // Past the ceiling it doesn't stand up at all, short of it only too close to stand up safely
            const how = swing > h ? `plus que les ${h} mm sous plafond`
                : `à moins de ${STAND_UP_MARGIN} mm des ${h} mm sous plafond`;
            checks.push({ level: "warning", item: c.id, target: null,
                          message: `${c.name} : couché sur le dos, il se relève en balayant ${Math.round(swing)} mm, ${how}. `
                              + "L'assembler debout sur place ou le scinder en deux caissons." });
        }
    }
    return checks;
}
