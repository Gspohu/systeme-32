// Handles on the fronts opened by hand : bars on two feet, or the edge pull astride the edge of the front

import type { Carcass } from "./model";
import type { Build, Part } from "./parts";
import type { FrontPanel } from "./fronts";
import { byId } from "./edit";
import { X, Y, Z, add, neg, type Vec3 } from "./geometry";
import { BAR_HANDLE, BAR_HANDLES, EDGE_PULL, type BarHandle } from "../data/hardware";
import { DIAM } from "./text";

// Workshop conventions, in the drawings as such : a door or flap handle 40 in from its edge, a door gripped
// 1000 off the floor when it reaches it, 40 kept free at each end of a front
// TODO that grip height suits a standing adult, a child's room may want another
const HANDLE_EDGE = 40;
const GRIP_HEIGHT = 1000;
const END_MARGIN = 40;
// Clears an M4 pan head, 8 across at most (ISO 7045:2011 via the Fuller Fasteners table), and the screwdriver
const SCREW_HEAD_PASSAGE = 10;
// Aluminium in g/mm3 : the edge pull's wall comes out of its 35 g spread over its lenght and unfolded section
const ALUMINIUM = 2.7e-3;


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


function scaled(v: Vec3, k: number): Vec3
{
    return [v[0] * k, v[1] * k, v[2] * k];
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
        if (f.handle === "edge")
        {
            fitEdgePull(c, fp, part, b);
        }
        else
        {
            fitBar(c, fp, part, b);
        }
    }
}


function fitBar(c: Carcass, fp: FrontPanel, part: Part, b: Build): void
{
    const r = fp.rect;
    const vertical = fp.role === "door";
    // A drawer gets up to half its width, a door a quarter of its height
    const h = pickHandle(vertical ? r.h / 4 : r.w / 2);
    const span = vertical ? r.h : r.w;
    if (h.length > span - 2 * END_MARGIN)
    {
        b.infos.push(`${c.name}, ${part.label.toLowerCase()} : ${Math.round(span)} mm, trop court pour la plus `
            + `petite poignée (${BAR_HANDLES[0]!.length} mm). Passer en ouverture par pression ou poser un bouton.`);
        return;
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
    // The part runs u up a doro, along a drawer front or a flap : the holes land at the same u, v either way
    for (const d of ends)
    {
        const [hx, hy] = vertical ? [cx, cy + d] : [cx + d, cy];
        part.holes.push({ u: vertical ? hy - r.y : hx - r.x, v: vertical ? hx - r.x : hy - r.y,
                          diameter: BAR_HANDLE.screwHole, depth: fp.thickness, face: "B",
                          label: `Poignée ${h.ref} : ${DIAM}${BAR_HANDLE.screwHole} traversant, vis M4 x 25`,
                          purpose: "handle-screw", fixes: h.ref });
        // Behind a drawer front the box end takes the screw head : a clear hole lets it bear on the front
        const end = fp.role === "drawer" ? byId(b.parts, `${c.id}/drawer/${fp.id}/endF`) : undefined;
        if (end !== undefined && end.frame !== null)
        {
            const u = c.x + hx - end.frame.o[0];
            const v = c.y + hy - end.frame.o[1];
            if (u > SCREW_HEAD_PASSAGE / 2 && u < end.length - SCREW_HEAD_PASSAGE / 2 && v > SCREW_HEAD_PASSAGE / 2
                && v < end.width - SCREW_HEAD_PASSAGE / 2)
            {
                end.holes.push({ u, v, diameter: SCREW_HEAD_PASSAGE, depth: end.thickness, face: "A",
                                 label: `Passage de la vis M4 de poignée, ${DIAM}${SCREW_HEAD_PASSAGE} traversant`,
                                 purpose: "screw-passage" });
            }
        }
    }
    const z = c.z + fp.z + fp.thickness;
    const radius = BAR_HANDLE.diameter / 2;
    const key = `${c.id}/handle/${fp.id}`;
    // The feet are drawn at the bar diameter, the maker gives no other figure for them
    const leg = BAR_HANDLE.projection - BAR_HANDLE.diameter;
    b.fitted.push({
        key: `${key}/barre`, item: c.id, ref: h.ref, label: `${c.name}, poignée`, purpose: "handle", shape: "cylinder",
        centre: [c.x + cx, c.y + cy, z + BAR_HANDLE.projection - radius],
        axes: [across, Z, along], half: [radius, radius, h.length / 2], host: part.id, hidden: false,
    });
    ends.forEach((d, k) =>   
    {
        const at: Vec3 = vertical ? [c.x + cx, c.y + cy + d, z + leg / 2] : [c.x + cx + d, c.y + cy, z + leg / 2];
        b.fitted.push({
            key: `${key}/pied${k}`, item: c.id, ref: h.ref, label: `${c.name}, pied de poignée`, purpose: "handle",
            shape: "cylinder",
            centre: at, axes: [X, Y, Z], half: [radius, radius, leg / 2], host: part.id, hidden: false,
        });
    });
    b.hardware.push({ ref: h.ref, qty: 1, item: c.id, itemName: c.name, target: fp.id,
                      note: vertical ? `axe à ${HANDLE_EDGE} mm du chant` : null, purpose: "handle" });
    const half = h.length / 2;
    b.handles.push({ item: c.id, front: fp.id, ref: h.ref,
                     x0: vertical ? cx : cx - half, y0: vertical ? cy - half : cy,  
                     x1: vertical ? cx : cx + half, y1: vertical ? cy + half : cy });
    part.notes.push(`Poignée ${h.ref} (entraxe ${h.centres}) : perçages d'après le gabarit, face visible`);
}


// The Oslo pull on the top edge of a drawer, the bottom one of a flap, the free one of a door. In its section
// a tab drops behind the front, a sole lies on the edge, a lip leans out and down over the face for the fingers
function fitEdgePull(c: Carcass, fp: FrontPanel, part: Part, b: Build): void
{
    const pull = EDGE_PULL;
    const rect = fp.rect;
    const thick = fp.thickness;
    const who = `${c.name}, ${part.label.toLowerCase()}`;
    const vertical = fp.role === "door";
    const span = vertical ? rect.h : rect.w;
    if (pull.length > span - 2 * END_MARGIN)
    {
        b.infos.push(`${who} : ${Math.round(span)} mm, trop court pour la poignée Oslo (${pull.length} mm). Passer en `
            + "ouverture par pression ou en poignée barre.");
        return;
    }
    const wall = pull.massG / ALUMINIUM / pull.length / (pull.depth + 2 * pull.height);
    if (thick + wall >= pull.depth || thick <= pull.screw - wall)
    {
        b.errors.push(`${who} : façade de ${thick} mm, la poignée Oslo prend le chant sur ${pull.depth} mm et se `
            + `visse par des vis de ${pull.screw} mm. Choisir la poignée barre ou une façade de `
            + `${Math.ceil(pull.screw)} à ${Math.floor(pull.depth - 2 * wall)} mm.`);
        return;
    }
    // The edge it sits on, the axis it rnus along and the way out of the front across that edge
    let runs: Vec3 = X;
    let out: Vec3 = Y;
    let edge = rect.y + rect.h;
    let along = rect.x + rect.w / 2;
    if (vertical)
    {
        runs = Y;
        out = fp.hinge === "right" ? neg(X) : X;
        edge = fp.hinge === "right" ? rect.x : rect.x + rect.w;
        along = Math.min(Math.max(GRIP_HEIGHT - c.y, rect.y + pull.length / 2 + END_MARGIN),
                         rect.y + rect.h - pull.length / 2 - END_MARGIN);
    }
    else if (fp.role === "flap")
    {
        out = neg(Y);
        edge = rect.y;
    }
    const base: Vec3 = vertical ? [c.x + edge, c.y + along, c.z + fp.z] : [c.x + along, c.y + edge, c.z + fp.z];
    // A point a along the pull, n out past the edge, z out from the back of the front
    const pt = (a: number, n: number, z: number): Vec3 =>
    {
        return add(add(add(base, scaled(runs, a)), scaled(out, n)), scaled(Z, z));
    };
    const high = pull.height;
    const zOut = pull.depth - wall;


    // The lip from the front corner of the sole to the outter bottom of the section
    const dn = -(high - wall);
    const dz = zOut - (wall / 2) - thick;
    const lipLength = Math.hypot(dn, dz);
    const lipDir = add(scaled(out, dn / lipLength), scaled(Z, dz / lipLength));
    const lipNormal = add(scaled(out, dz / lipLength), scaled(Z, -dn / lipLength));
    const key = `${c.id}/handle/${fp.id}`;
    const common = { item: c.id, ref: pull.ref, purpose: "handle" as const, shape: "box" as const, host: part.id,
                     hidden: false };
    b.fitted.push(
        { ...common, key: `${key}/patte`, label: `${c.name}, patte de poignée`,
          centre: pt(0, (wall - high) / 2, -wall / 2),
          axes: [runs, out, Z], half: [pull.length / 2, (high - wall) / 2, wall / 2] },
        { ...common, key: `${key}/semelle`, label: `${c.name}, poignée`, centre: pt(0, wall / 2, (thick - wall) / 2),
          axes: [runs, out, Z], half: [pull.length / 2, wall / 2, (thick + wall) / 2] },
        { ...common, key: `${key}/levre`, label: `${c.name}, lèvre de poignée`,
          centre: pt(0, wall / 2 + dn / 2, thick + dz / 2), axes: [runs, lipDir, lipNormal],
          half: [pull.length / 2, lipLength / 2, wall / 2] },
    );
    // The two screws come from inside, throught the tab into the back of the front
    for (const d of [-pull.centres / 2, pull.centres / 2])
    {
        const n = (wall - high) / 2;
        const [hx, hy] = vertical ? [edge + out[0] * n, along + d] : [along + d, edge + out[1] * n];
        part.holes.push({ u: vertical ? hy - rect.y : hx - rect.x, v: vertical ? hx - rect.x : hy - rect.y,
                          diameter: 0, depth: 0, face: "A",
                          label: `Poignée Oslo ${pull.ref} : vis de ${pull.screw} fournie, par l'arrière`,
                          purpose: "handle-screw", fixes: pull.ref });
    }
    b.hardware.push({ ref: pull.ref, qty: 1, item: c.id, itemName: c.name, target: fp.id,
                      note: `à cheval sur le chant ${vertical ? "libre" : fp.role === "flap" ? "bas" : "haut"}, centrée`,
                      purpose: "handle" });
    const half = pull.length / 2;
    b.handles.push({ item: c.id, front: fp.id, ref: pull.ref,
                     x0: vertical ? edge : along - half, y0: vertical ? along - half : edge,
                     x1: vertical ? edge : along + half, y1: vertical ? along + half : edge });
    part.notes.push(`Poignée Oslo ${pull.ref} posée sur le chant, vissée depuis l'intérieur (entraxe ${pull.centres})`);
}
