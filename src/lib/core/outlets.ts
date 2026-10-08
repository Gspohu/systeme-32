// Holes for a wall socket or a cable, cut through the back behind a cell or the pnel above, below or beside it

import type { Carcass, Outlet } from "./model";
import type { ResolvedLayout } from "./layout";
import type { Build, Part } from "./parts";
import type { Outline, Vec3 } from "./geometry";
import { byId } from "./edit";
import { panelAbove, panelBelow, sideFace } from "./locate";
import { DIAM } from "./text";

// a starting value, the socket or the grommet bought give the real size (convention)
export const OUTLET_DEFAULT: Omit<Outlet, "id" | "cell"> = { panel: "back", shape: "rect", w: 80, h: 80, dx: 0, dy: 0 };


// a point of the room in the frame of the part : u and v of a flat board
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
        // the gap between the two boards, whichever side of the board the lining stands on
        const gap = along(g.o, f.n, f.o);
        const against = gap > -q.thickness - 0.01 && gap < board.thickness + q.thickness + 0.01;
        const [a, z] = [onPart(q, near), onPart(q, far)];
        const over = [a, z].every(([u, v]) =>
        {
            return u >= -0.01 && u <= q.length + 0.01 && v >= -0.01 && v <= q.width + 0.01;
        });
        return parallel && against && over;
    });
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
        // across the cell on the back and on a shelf, frontwards on a side
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
            // the two sizes of the cell the hole lies across, a side seen across its depth, a shelf from above
            const deep = Math.round(lay.zFront - lay.zBack);
            const cell = hole.panel === "back" ? `${Math.round(nb.w)} x ${Math.round(nb.h)} mm`
                : side ? `${deep} de profondeur x ${Math.round(nb.h)} de haut` : `${Math.round(nb.w)} x ${deep} de profondeur`;
            b.errors.push(`${where} : ${hole.w} x ${h} mm décalé de ${hole.dx} / ${hole.dy} sort de sa case (${cell}). `
                + "Le réduire ou le recentrer.");
            continue;
        }
        part.cutouts.push(holeOutline(hole.shape, onPart(part, near), onPart(part, far)));
        // a lining ladi against that board, in this ecll or the next one, takes the same hole or it blocks it
        for (const lining of liningsOver(c, part, near, far, b))
        {
            lining.cutouts.push(holeOutline(hole.shape, onPart(lining, near), onPart(lining, far)));
            lining.notes.push(`Même découpe que ${part.label.toLowerCase()}, d'après le DXF`);
        }
        // seen from the front : the back hole as cut, a shelf or a side one edge on over the thickness of its board
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
                         edgeOn, hidden });
        part.notes.push(hole.shape === "round" ? `Trou ${DIAM}${hole.w} pour prise ou câble, d'après le DXF`
            : `Découpe ${hole.w} x ${hole.h} pour prise, d'après le DXF`);
    }
}
