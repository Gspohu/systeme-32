// Façades meeting other items across a corner : covered fronts, doors that cannot reach square, drawers blocked

import type { Carcass, Project, Wall } from "./model";
import type { FrontPanel } from "./fronts";
import type { Check } from "./analysis";
import type { Build } from "./parts";
import { boxesMeet, boxToRoom, boxToWall, roomBox, sideWallDepth, WALL_LABELS, type Box3 } from "./room";


interface Obstacle
{
    name: string;
    item: string;
    // room coordinates
    box: Box3;
}


// Front panel as it stands, thickness included, in the frame of its wall
export function frontSlab(c: Carcass, fp: FrontPanel): Box3
{
    return {
        min: [c.x + fp.rect.x, c.y + fp.rect.y, c.z + fp.z],
        max: [c.x + fp.rect.x + fp.rect.w, c.y + fp.rect.y + fp.rect.h, c.z + fp.z + fp.thickness],
    };
}


function obstacles(p: Project, b: Build): Obstacle[]
{
    const out: Obstacle[] = [];
    for (const it of p.items)
    {
        out.push({ name: it.name, item: it.id, box: roomBox(it, p.room) });
        if (it.kind !== "carcass")
        {
            continue;
        }
        for (const fp of b.fronts.get(it.id) ?? [])
        {
            out.push({ name: `la façade de ${it.name}`, item: it.id, box: boxToRoom(it.wall, p.room, frontSlab(it,
                fp)) });
        }
    }
    return out;
}


function clamp(v: number, lo: number, hi: number): number
{
    return Math.min(hi, Math.max(lo, v));
}


// Quarter disc swept by a door between shut and square, around its hinge line, against a box of its wall frame
export function sweepHits(hx: number, z0: number, w: number, side: "left" | "right", o: Box3): boolean
{
    const x0 = Math.max(o.min[0], side === "left" ? hx : hx - w);
    const x1 = Math.min(o.max[0], side === "left" ? hx + w : hx);
    const z1 = Math.min(o.max[2], z0 + w);
    const zA = Math.max(o.min[2], z0);
    if (x1 - x0 <= 0.5 || z1 - zA <= 0.5)
    {
        return false;
    }
    const dx = clamp(hx, x0, x1) - hx;
    const dz = clamp(z0, zA, z1) - z0;
    return dx * dx + dz * dz < (w - 0.5) * (w - 0.5);
}


function spanY(a: Box3, b: Box3): boolean
{
    return a.max[1] > b.min[1] + 0.5 && b.max[1] > a.min[1] + 0.5;
}


export function cornerChecks(p: Project, b: Build): Check[]
{
    const checks: Check[] = [];
    const all = obstacles(p, b);
    const r = p.room;
    for (const it of p.items)
    {
        const box = roomBox(it, r);
        const out = box.min[0] < -0.5 || box.min[2] < -0.5 || box.max[0] > r.width + 0.5 || box.max[2] > r.depth + 0.5
            || box.max[1] > r.height + 0.5;
        if (out)
        {
            checks.push({ level: "warning", item: it.id, target: null,
                          message: `${it.name} sort de la pièce (${r.width} x ${r.depth} x ${r.height} mm). Mesurer la `
                              + "pièce dans Réglages ou déplacer le meuble." });
        }
        // on a side wall of an alcove, past its return there is no wall left to fix to
        else if (it.wall !== "back" && box.max[2] > sideWallDepth(r, it.wall) + 0.5)
        {
            checks.push({ level: "warning", item: it.id, target: null,
                          message: `${it.name} dépasse le retour du ${WALL_LABELS[it.wall].toLowerCase()} `
                              + `(${sideWallDepth(r, it.wall)} mm depuis le fond) : rien pour le fixer au-delà.` });
        }
    }
    for (const c of p.items)
    {
        if (c.kind !== "carcass")
        {
            continue;
        }
        const wall: Wall = c.wall;
        const others: { name: string; box: Box3 }[] = [];
        for (const o of all)
        {
            if (o.item !== c.id)
            {
                others.push({ name: o.name, box: boxToWall(wall, r, o.box) });
            }
        }
        for (const fp of b.fronts.get(c.id) ?? [])
        {
            const slab = frontSlab(c, fp);
            const label = `${c.name}, ${fp.role === "door" ? "porte" : fp.role === "drawer" ? "tiroir" : "façade"} ${fp.number}`;
            let covered = false;
            for (const blocker of others)
            {
                if (covered || !boxesMeet(slab, blocker.box))
                {
                    continue;
                }
                covered = true;
                // shortest move along the wall that clears it, a filler of that width
                const shift = Math.min(blocker.box.max[0] - slab.min[0], slab.max[0] - blocker.box.min[0]);
                checks.push({ level: "error", item: c.id, target: fp.front,
                              message: `${label} traverse ${blocker.name} (${WALL_LABELS[wall].toLowerCase()}). Décaler l'un `
                                  + `des deux d'au moins ${Math.ceil(shift)} mm, par un fileur dans l'angle.` });
            }
            if (covered)
            {
                continue;
            }
            const z0 = slab.max[2];
            if (fp.role === "door" && fp.hinge !== null)
            {
                const hx = fp.hinge === "left" ? slab.min[0] : slab.max[0];
                // square to the carcass the door stands on its hinge line, its thickness on the hinge side
                const t = fp.thickness;
                const edge: Box3 = {
                    min: [fp.hinge === "left" ? hx - t : hx, slab.min[1], z0],
                    max: [fp.hinge === "left" ? hx : hx + t, slab.max[1], z0 + fp.rect.w],
                };
                const hit = others.find((o) =>
                {
                    return spanY(slab, o.box) && (sweepHits(hx, z0, fp.rect.w, fp.hinge!, o.box) || boxesMeet(edge,
                        o.box));
                });
                if (hit !== undefined)
                {
                    checks.push({ level: "warning", item: c.id, target: fp.front,
                                  message: `${label} heurte ${hit.name} avant d'ouvrir à l'équerre (poignée non comptée). `
                                      + "Changer le côté des charnières ou écarter les meubles par un fileur." });
                }
            }
            else if (fp.role === "drawer")
            {
                // a full extension runner brings the drawer out by about the depth of the carcass
                const pull: Box3 = { min: [slab.min[0], slab.min[1], z0], max: [slab.max[0], slab.max[1],
                    z0 + c.depth] };
                const hit = others.find((o) =>
                {
                    return boxesMeet(pull, o.box);
                });
                if (hit !== undefined)
                {
                    checks.push({ level: "warning", item: c.id, target: fp.front,
                                  message: `${label} heurte ${hit.name} en sortant. Écarter les meubles par un fileur `
                                      + "ou poser une porte." });
                }
            }
        }
    }
    return checks;
}
