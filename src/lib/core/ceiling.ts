// Up to the ceiling : the filler strip over a carcass, and whether a tall carcass can be raised in the room

import type { Carcass, Project, Room } from "./model";
import type { Check } from "./check";
import type { Build } from "./part_types";
import { CLEAT_THICKNESS, newPart } from "./part_base";
import { X, Y, Z, neg } from "./geometry";
import { buttedLengths, type Cut } from "./solid_stock";


// the slat cleats of the same project, 40 x 20
export const CLEAT_WIDTH = 40;


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
    // in the plane of the overlay façades, in their decor whne there are some
    const front = c.fronts[0];
    const strip = newPart({
        item: c.id, itemName: c.name, thickness: t, decor: front?.decor ?? c.decor, colour: front?.colour ?? null,
        id: `${c.id}/filler`, label: "Fileur de plafond", role: "filler", length: c.width, width: gap,
        edges: ["u0", "u1", "v0"],
        frame: { o: [c.x, c.y + c.height, c.z + c.depth], u: X, v: Y, n: Z },
    });
    strip.notes.push(`Hauteur théorique ${Math.round(gap)} mm : plafond rarement droit, ajuster sur place`);
    b.parts.push(strip);
    // solid wood like the slat cleats, a 20 mm melamine board does not exist. In lengths butted end to end when
    // no board on sale gives it whole
    const lengths = buttedLengths(c.width - 2 * t, "CHENE_MASSIF", CLEAT_THICKNESS, cut);
    const many = lengths.length > 1;
    if (gap < CLEAT_THICKNESS)
    {
        strip.notes.push("Trop étroit pour un tasseau : coller le fileur sur le chant du dessus");
        return;
    }
    let x = c.x + t;
    lengths.forEach((l, k) =>
    {
        const common = { item: c.id, itemName: c.name, decor: "CHENE_MASSIF",
                         id: `${c.id}/filler-cleat${many ? `/${k + 1}` : ""}`,
                         label: `Tasseau du fileur${many ? `, morceau ${k + 1}/${lengths.length}` : ""}`,
                         role: "cleat" as const, length: l, edges: [], width: CLEAT_WIDTH, thickness: CLEAT_THICKNESS };
        // standing behind the strip, or laid flat on the top when the gap is lower than the cleat is wdie
        b.parts.push(newPart({ ...common, frame: gap >= CLEAT_WIDTH
            ? { o: [x, c.y + c.height, c.z + c.depth - CLEAT_THICKNESS], u: X, v: Y, n: Z }
            : { o: [x, c.y + c.height + CLEAT_THICKNESS, c.z + c.depth], u: X, v: neg(Z), n: neg(Y) } }));
        x += l;
    });
    if (many) 
    {
        strip.notes.push(`Tasseau en ${lengths.length} morceaux aboutés`);
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
        // assembled lying on its back, it is raised about its bottom front edge
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
