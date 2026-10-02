// Holes for a wall socket or a cable, cut through the back behind a cell or the pnel above or below it

import type { Carcass, Outlet } from "./model";
import type { ResolvedLayout } from "./layout";
import type { Build, Part } from "./parts";
import type { Outline, Vec3 } from "./geometry";
import { byId } from "./edit";
import { panelAbove, panelBelow } from "./locate";
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
        const cx = nb.x + nb.w / 2 + hole.dx;
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
        else
        {
            part = hole.panel === "above" ? panelAbove(c, lay, nb, b)?.part : panelBelow(c, lay, nb, b);
            const cz = (lay.zBack + lay.zFront) / 2 + hole.dy;
            const y = part?.frame?.o[1] ?? c.y;
            near = [c.x + cx - hole.w / 2, y, c.z + cz - h / 2];
            far = [c.x + cx + hole.w / 2, y, c.z + cz + h / 2];
            inside = cz - h / 2 >= lay.zBack && cz + h / 2 <= lay.zFront;
        }
        inside = inside && cx - hole.w / 2 >= nb.x && cx + hole.w / 2 <= nb.x + nb.w;
        if (part === undefined || part.frame === null)
        {
            b.errors.push(`${where} : aucun panneau ${hole.panel === "back" ? "de fond" : hole.panel === "above"
                ? "fixe au-dessus" : "fixe au-dessous"} de la case à percer. Choisir un autre panneau ou retirer le trou.`);
            continue;
        }
        if (part.role === "top" && c.slope !== null)
        {
            b.errors.push(`${where} : un dessus en pente ne se perce pas ici. Percer le fond ou une tablette.`);
            continue;
        }
        if (!inside)
        {
            b.errors.push(`${where} : ${hole.w} x ${h} mm décalé de ${hole.dx} / ${hole.dy} sort de sa case `
                + `(${Math.round(nb.w)} mm de large). Le réduire ou le recentrer.`);
            continue;
        }
        part.cutouts.push(holeOutline(hole.shape, onPart(part, near), onPart(part, far)));
        part.notes.push(hole.shape === "round" ? `Trou ${DIAM}${hole.w} pour prise ou câble, d'après le DXF`
            : `Découpe ${hole.w} x ${hole.h} pour prise, d'après le DXF`);
    }
}
