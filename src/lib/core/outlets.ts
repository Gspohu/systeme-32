// Holes for a wall socket or a cable, cut through the back behind a cell or the pnel above, below or beside it

import type { Carcass, Item, Outlet } from "./model";
import type { ResolvedLayout } from "./layout";
import type { Build, Part } from "./parts";
import type { Outline, Vec3 } from "./geometry";
import { byId } from "./edit";
import { panelAbove, panelBelow, sideFace } from "./locate";
import { DIAM } from "./text";
import { LINING_PLAY } from "./curves";

// A starting value, the socket or the grommet bought give the real size (convention)
export const OUTLET_DEFAULT: Omit<Outlet, "id" | "cell"> = { panel: "back", shape: "rect", w: 80, h: 80, dx: 0, dy: 0 };


// A point of the room in the frame of the part : u and v of a flat board
function onPart(p: Part, q: Vec3): [number, number]
{
    const f = p.frame!;
    const d: Vec3 = [q[0] - f.o[0], q[1] - f.o[1], q[2] - f.o[2]];
    return [d[0] * f.u[0] + d[1] * f.u[1] + d[2] * f.u[2], d[0] * f.v[0] + d[1] * f.v[1] + d[2] * f.v[2]];
}


function holeOutline(shape: Outlet["shape"], a: [number, number], b: [number, number]): Outline
{
    const u0 = Math.min(a[0], b[0]);
    const u1 = Math.max(a[0], b[0]);
    const v0 = Math.min(a[1], b[1]);
    const v1 = Math.max(a[1], b[1]);
    if (shape === "round")
    {
        const cu = (u0 + u1) / 2;
        const cv = (v0 + v1) / 2;
        return { start: [cu, v1], segments: [
            { kind: "arc", x: cu, y: v0, cx: cu, cy: cv, ccw: true },
            { kind: "arc", x: cu, y: v1, cx: cu, cy: cv, ccw: true },
        ] };
    }
    return { start: [u0, v0], segments: [
        { kind: "line", x: u1, y: v0 },
        { kind: "line", x: u1, y: v1 },
        { kind: "line", x: u0, y: v1 },
        { kind: "line", x: u0, y: v0 },
    ] };
}


// The linings of the carcass doubling a board over a hole : parallel to it, against one of its faces, and over the
// whole hole
function liningsOver(c: Carcass, board: Part, near: Vec3, far: Vec3, b: Build): Part[]
{
    const f = board.frame!;
    const along = (q: Vec3, n: Vec3, o: Vec3): number => 
    {
        return (q[0] - o[0]) * n[0] + (q[1] - o[1]) * n[1] + (q[2] - o[2]) * n[2];   
    };
    return b.parts.filter((q) =>
    {
        if (q.item !== c.id || q.role !== "lining" || q.frame === null) 
        {
            return false;
        }
        const g = q.frame;
        const parallel = Math.abs(Math.abs(g.n[0] * f.n[0] + g.n[1] * f.n[1] + g.n[2] * f.n[2]) - 1) < 1e-9;
        // The gap between the two boards, whichever side of the board the lining stands on
        const gap = along(g.o, f.n, f.o);
        const against = gap > -q.thickness - LINING_PLAY - 0.01 && gap < board.thickness + q.thickness + LINING_PLAY + 0.01;
        const [a, z] = [onPart(q, near), onPart(q, far)];
        const over = [a, z].every(([u, v]) =>
        {
            return u >= -0.01 && u <= q.length + 0.01 && v >= -0.01 && v <= q.width + 0.01;
        });
        return parallel && against && over;
    });
}


// The box a cut out takes on its board, an arc swept whole : enough to say a point lies in it
function cutoutHolds(o: Outline, u: number, v: number): boolean
{
    const us = [o.start[0]];
    const vs = [o.start[1]];
    for (const s of o.segments)
    {
        us.push(s.x);
        vs.push(s.y);
        if (s.kind === "arc")
        {
            const r = Math.hypot(s.x - s.cx, s.y - s.cy);
            us.push(s.cx - r, s.cx + r);
            vs.push(s.cy - r, s.cy + r);
        }
    }
    return u >= Math.min(...us) && u <= Math.max(...us) && v >= Math.min(...vs) && v <= Math.max(...vs);
}


// Under this gap a board stands against the hole and nothing passes between them
const AGAINST_GAP = 1;
// The bite of a neighbour into a hole that still leaves it open, a pencil line of lay out
const BITE_ALLOWED = 1;

// A hole opening onto another board goes nowhere : that board takes the same hole, or the hole moves. Runs once every
// item is built, the board in the way is often another's
export function blockedOutlets(items: Item[], b: Build): void
{
    const wallOf = new Map(items.map((it) =>
    {
        return [it.id, it.kind === "device" ? null : it.wall];
    }));
    for (const hole of b.outlets)
    {
        const board = byId(b.parts, hole.board);
        if (board === undefined || board.frame === null)
        {
            continue;
        }
        const n = board.frame.n;
        const along = (q: Vec3): number =>
        {
            return (q[0] - hole.centre[0]) * n[0] + (q[1] - hole.centre[1]) * n[1] + (q[2] - hole.centre[2]) * n[2];
        };
        for (const q of b.parts)
        {
            if (q.id === board.id || q.frame === null || q.curve !== null || wallOf.get(q.item) !== wallOf.get(hole.item)
                || Math.abs(Math.abs(q.frame.n[0] * n[0] + q.frame.n[1] * n[1] + q.frame.n[2] * n[2]) - 1) > 1e-9)
            {
                continue;
            }
            // The hole centre lies on one face of its board : the slab it opens through, and what stands against it
            const w0 = along(q.frame.o);
            const w1 = w0 + (q.frame.n[0] * n[0] + q.frame.n[1] * n[1] + q.frame.n[2] * n[2]) * q.thickness;
            const lo = Math.min(w0, w1);
            const hi = Math.max(w0, w1);
            const gap = Math.max(lo - board.thickness, -board.thickness - hi);
            const [u, v] = onPart(q, hole.centre);
            const reach = hole.reach - BITE_ALLOWED;
            const over = u + reach > 0 && u - reach < q.length && v + reach > 0 && v - reach < q.width;
            // Half facing the hole of its neighbour is still blocked : the whole opening must find the other
            const open = q.cutouts.some((o) =>
            {
                return cutoutHolds(o, u - reach, v) && cutoutHolds(o, u + reach, v) && cutoutHolds(o, u, v - reach)
                    && cutoutHolds(o, u, v + reach);
            });
            if (gap <= AGAINST_GAP && over && !open)
            {
                b.errors.push(`${board.itemName}, ${board.label.toLowerCase()} : le trou de ${Math.round(2 * hole.reach)} mm `
                    + `donne sur ${q.label.toLowerCase()} de ${q.itemName}. Déplacer le trou ou percer aussi ce panneau.`);
            }
        }
    }
}


export function fitOutlets(c: Carcass, lay: ResolvedLayout, b: Build): void
{
    for (const hole of c.outlets)
    {
        const nb = lay.nodes.get(hole.cell);
        if (nb === undefined)
        {
            continue;
        }
        const where = `${c.name}, trou de prise`;
        const h = hole.shape === "round" ? hole.w : hole.h;
        const side = hole.panel === "left" || hole.panel === "right";
        // Across the cell on the back and on a shelf, frontwards on a side
        const cx = side ? (hole.panel === "left" ? nb.x : nb.x + nb.w) : nb.x + nb.w / 2 + hole.dx;
        let part: Part | undefined;
        let near: Vec3;
        let far: Vec3;
        let inside: boolean;
        if (hole.panel === "back")
        {
            part = byId(b.parts, `${c.id}/back`);
            const cy = nb.y + nb.h / 2 + hole.dy;
            near = [c.x + cx - hole.w / 2, c.y + cy - h / 2, c.z];
            far = [c.x + cx + hole.w / 2, c.y + cy + h / 2, c.z];
            inside = cy - h / 2 >= nb.y && cy + h / 2 <= nb.y + nb.h;
        }
        else if (hole.panel === "left" || hole.panel === "right")
        {
            part = sideFace(c, lay, b, nb, hole.panel)?.part;
            const cz = (lay.zBack + lay.zFront) / 2 + hole.dx;
            const cy = nb.y + nb.h / 2 + hole.dy;
            near = [c.x + cx, c.y + cy - h / 2, c.z + cz - hole.w / 2];
            far = [c.x + cx, c.y + cy + h / 2, c.z + cz + hole.w / 2];
            inside = cy - h / 2 >= nb.y && cy + h / 2 <= nb.y + nb.h && cz - hole.w / 2 >= lay.zBack
                && cz + hole.w / 2 <= lay.zFront;
        }
        else
        {
            part = hole.panel === "above" ? panelAbove(c, lay, nb, b)?.part : panelBelow(c, lay, nb, b);
            const cz = (lay.zBack + lay.zFront) / 2 + hole.dy;
            const y = part?.frame?.o[1] ?? c.y;
            near = [c.x + cx - hole.w / 2, y, c.z + cz - h / 2];
            far = [c.x + cx + hole.w / 2, y, c.z + cz + h / 2];
            inside = cz - h / 2 >= lay.zBack && cz + h / 2 <= lay.zFront;
        }
        inside = inside && (side || (cx - hole.w / 2 >= nb.x && cx + hole.w / 2 <= nb.x + nb.w));
        if (part === undefined || part.frame === null)
        {
            const missing = { back: "aucun panneau de fond", above: "aucun panneau fixe au-dessus",
                              below: "aucun panneau fixe au-dessous", left: "aucune joue ni aucun montant à gauche",
                              right: "aucune joue ni aucun montant à droite" }[hole.panel];
            b.errors.push(`${where} : ${missing} de la case à percer. Choisir un autre panneau ou retirer le trou.`);
            continue;
        }
        if (part.role === "top" && c.slope !== null)
        {
            b.errors.push(`${where} : un dessus en pente ne se perce pas ici. Percer le fond ou une tablette.`);
            continue;
        }
        if (!inside)
        {
            // The two sizes of the cell the hole lies across, a side seen across its depth, a shelf from above
            const deep = Math.round(lay.zFront - lay.zBack);
            const cell = hole.panel === "back" ? `${Math.round(nb.w)} x ${Math.round(nb.h)} mm`
                : side ? `${deep} de profondeur x ${Math.round(nb.h)} de haut` : `${Math.round(nb.w)} x ${deep} de profondeur`;
            b.errors.push(`${where} : ${hole.w} x ${h} mm décalé de ${hole.dx} / ${hole.dy} sort de sa case (${cell}). `
                + "Le réduire ou le recentrer.");
            continue;
        }
        part.cutouts.push(holeOutline(hole.shape, onPart(part, near), onPart(part, far)));
        // A lining ladi against that board, in this ecll or the next one, takes the same hole or it blocks it
        for (const lining of liningsOver(c, part, near, far, b))
        {
            lining.cutouts.push(holeOutline(hole.shape, onPart(lining, near), onPart(lining, far)));
            lining.notes.push(`Même découpe que ${part.label.toLowerCase()}, d'après le DXF`);
        }
        // Seen from the front : the back hole as cut, a shelf or a side one edge on over the thickness of its board
        const f = part.frame;
        const edgeOn = hole.panel !== "back";
        const x = side ? Math.min(f.o[0], f.o[0] + f.n[0] * part.thickness) - c.x : cx - hole.w / 2;
        const wide = side ? part.thickness : hole.w;
        const y = edgeOn && !side ? Math.min(f.o[1], f.o[1] + f.n[1] * part.thickness) - c.y : near[1] - c.y;
        const tall = edgeOn && !side ? part.thickness : h;
        const hidden = (b.fronts.get(c.id) ?? []).some((fp) =>
        {
            return x + wide / 2 > fp.rect.x && x + wide / 2 < fp.rect.x + fp.rect.w && y + tall / 2 > fp.rect.y
                && y + tall / 2 < fp.rect.y + fp.rect.h;
        });
        b.outlets.push({ item: c.id, id: hole.id, shape: edgeOn ? "rect" : hole.shape, x, y, w: wide, h: tall,
                         edgeOn, hidden, board: part.id, reach: Math.max(hole.w, h) / 2,
                         centre: [(near[0] + far[0]) / 2, (near[1] + far[1]) / 2, (near[2] + far[2]) / 2] });
        part.notes.push(hole.shape === "round" ? `Trou ${DIAM}${hole.w} pour prise ou câble, d'après le DXF`
            : `Découpe ${hole.w} x ${hole.h} pour prise, d'après le DXF`);
    }
}
