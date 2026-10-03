// Bar handles on the fronts opened by hand : which length, where, its two screw holes, its volume and its line

import type { Carcass } from "./model";
import type { Build } from "./parts";
import { byId } from "./edit";
import { X, Y, Z, type Vec3 } from "./geometry";
import { BAR_HANDLE, BAR_HANDLES, type BarHandle } from "../data/hardware";
import { DIAM } from "./text";

// Workshop conventions, in the drawings as such : a door or flap handle 40 in from its edge, a door gripped
// 1000 off the floor when it reaches it, 40 kept free at each end of a front
// TODO that grip height suits a standing adult, a child's room may want another
const HANDLE_EDGE = 40;
const GRIP_HEIGHT = 1000;
const END_MARGIN = 40;
// clears an M4 pan head, 8 across at most (ISO 7045:2011 via the Fuller Fasteners table), and the screwdriver
const SCREW_HEAD_PASSAGE = 10;


// The longest handle no longer than `room`, the shortest one when even that is too long
function pickHandle(room: number): BarHandle
{
    let best = BAR_HANDLES[0]!;
    for (const h of BAR_HANDLES)
    {
        if (h.length <= room)
        {
            best = h;
        }
    }
    return best;
}


export function fitHandles(c: Carcass, b: Build): void
{
    for (const fp of b.fronts.get(c.id) ?? [])
    {
        const f = byId(c.fronts, fp.front);
        const part = byId(b.parts, `${c.id}/front/${fp.id}`);
        if (f === undefined || part === undefined || f.opening !== "handle")
        {
            continue;
        }
        if (fp.role !== "door" && fp.role !== "drawer" && fp.role !== "flap")
        {
            continue;
        }
        const r = fp.rect;
        const vertical = fp.role === "door";
        // a drawer gets up to half its width, a door a quarter of its height
        const h = pickHandle(vertical ? r.h / 4 : r.w / 2);
        const span = vertical ? r.h : r.w;
        if (h.length > span - 2 * END_MARGIN)
        {
            b.infos.push(`${c.name}, ${part.label.toLowerCase()} : ${Math.round(span)} mm, trop court pour la plus `
                + `petite poignée (${BAR_HANDLES[0]!.length} mm). Passer en ouverture par pression ou poser un bouton.`);
            continue;
        }
        let cx: number;
        let cy: number;
        if (vertical)
        {
            cx = fp.hinge === "right" ? r.x + HANDLE_EDGE : r.x + r.w - HANDLE_EDGE;
            const lo = r.y + h.length / 2 + END_MARGIN;
            const hi = r.y + r.h - h.length / 2 - END_MARGIN;
            cy = Math.min(Math.max(GRIP_HEIGHT - c.y, lo), hi);
        }
        else
        {
            cx = r.x + r.w / 2;
            cy = fp.role === "flap" ? r.y + HANDLE_EDGE : r.y + r.h / 2;
        }
        const along: Vec3 = vertical ? Y : X;
        const across: Vec3 = vertical ? X : Y;
        const ends = [-h.centres / 2, h.centres / 2];
        // the part runs u up a door, along a drawer front or a flap : the holes land at the same u, v either way
        for (const d of ends)
        {
            const [hx, hy] = vertical ? [cx, cy + d] : [cx + d, cy];
            part.holes.push({ u: vertical ? hy - r.y : hx - r.x, v: vertical ? hx - r.x : hy - r.y,
                              diameter: BAR_HANDLE.screwHole, depth: fp.thickness, face: "B",
                              label: `Poignée ${h.ref} : ${DIAM}${BAR_HANDLE.screwHole} traversant, vis M4 x 25` });
            // behind a drawer front the box end takes the screw head : a clear hole lets it bear on the front
            const end = fp.role === "drawer" ? byId(b.parts, `${c.id}/drawer/${fp.id}/endF`) : undefined;
            if (end !== undefined && end.frame !== null)
            {
                const u = c.x + hx - end.frame.o[0];
                const v = c.y + hy - end.frame.o[1];
                if (u > SCREW_HEAD_PASSAGE / 2 && u < end.length - SCREW_HEAD_PASSAGE / 2 && v > SCREW_HEAD_PASSAGE / 2
                    && v < end.width - SCREW_HEAD_PASSAGE / 2)
                {
                    end.holes.push({ u, v, diameter: SCREW_HEAD_PASSAGE, depth: end.thickness, face: "A",
                                     label: `Passage de la vis M4 de poignée, ${DIAM}${SCREW_HEAD_PASSAGE} traversant` });
                }
            }
        }
        const z = c.z + fp.z + fp.thickness;
        const radius = BAR_HANDLE.diameter / 2;
        const key = `${c.id}/handle/${fp.id}`;
        // the feet are drawn at the bar diameter, the maker gives no other figure for them
        const leg = BAR_HANDLE.projection - BAR_HANDLE.diameter;
        b.fitted.push({
            key: `${key}/barre`, item: c.id, ref: h.ref, label: `${c.name}, poignée`, shape: "cylinder",
            centre: [c.x + cx, c.y + cy, z + BAR_HANDLE.projection - radius],
            axes: [across, Z, along], half: [radius, radius, h.length / 2], host: part.id, hidden: false,
        });
        ends.forEach((d, k) =>
        {
            const at: Vec3 = vertical ? [c.x + cx, c.y + cy + d, z + leg / 2] : [c.x + cx + d, c.y + cy, z + leg / 2];
            b.fitted.push({
                key: `${key}/pied${k}`, item: c.id, ref: h.ref, label: `${c.name}, pied de poignée`, shape: "cylinder",
                centre: at, axes: [X, Y, Z], half: [radius, radius, leg / 2], host: part.id, hidden: false,
            });
        });
        b.hardware.push({ ref: h.ref, qty: 1, item: c.id, itemName: c.name, target: fp.id,
                          note: vertical ? `axe à ${HANDLE_EDGE} mm du chant` : null });
        const half = h.length / 2;
        b.handles.push({ item: c.id, front: fp.id, ref: h.ref,
                         x0: vertical ? cx : cx - half, y0: vertical ? cy - half : cy,
                         x1: vertical ? cx : cx + half, y1: vertical ? cy + half : cy });
        part.notes.push(`Poignée ${h.ref} (entraxe ${h.centres}) : perçages d'après le gabarit, face visible`);
    }
}
