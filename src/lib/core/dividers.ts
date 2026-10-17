// Shelves and uprights of a carcass, their joints with what they butt against, and where panels sit

import type { Carcass, Settings } from "./model";
import type { ResolvedLayout } from "./layout";
import { MIN_CELL, findNode, frontSetback, subtreeIds } from "./layout";
import { X, Y, Z, neg } from "./geometry";
import { byId } from "./edit";
import { ceilingAt, topAngle } from "./slope";
import type { Build, Part } from "./part_types";
import { boxOrigin, newPart } from "./part_base";
import { DIAM } from "./text";
import { decorById } from "../data/materials";


// Two faces meet when they are closer than this, in mm
const TOUCH = 0.01;


export function buildDividers(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    const [ox, oy, oz] = boxOrigin(c);
    const thick = c.thickness;
    const depth = c.depth;
    const zs = lay.zBack;
    let rank = 0;
    for (const div of lay.dividers)
    {
        rank++;
        let sb = frontSetback(div, s.shelfFrontSetback);
        if (sb < 0 || depth - zs - sb < MIN_CELL)
        {
            b.errors.push(`${c.name}, séparation ${rank} : retrait de ${sb} mm, la pièce garderait moins de `
                + `${MIN_CELL} mm de large sur ${depth - zs} mm de profondeur. Réduire le retrait.`);
            sb = 0;
        }
        // A divider of its own finish, else the carcass decor : a shelf is as thick as the layout made it's slot
        const look = { item: c.id, itemName: c.name, thickness: div.axis === "h" ? div.h : thick,
                       decor: div.finish?.decor ?? c.decor,
                       colour: div.finish?.colour ?? null };
        if (decorById(look.decor).thickness !== undefined && (div.axis === "v" || div.kind === "fixed"))
        {
            b.errors.push(`${c.name}, séparation ${rank} : le verre ne fait que des étagères réglables, pas une pièce `
                + "qui tient le caisson. Lui rendre un décor de panneau.");
            look.decor = c.decor;
        }
        if (div.axis === "v")
        {
            // An upright running up to a sloped top is cut from its longer face, the bevel taken off the other
            const underTop = c.slope !== null && div.y + div.h >= c.height - thick - TOUCH;
            const tallest = Math.max(ceilingAt(c, div.x), ceilingAt(c, div.x + div.w)) - div.y;
            const part = newPart({
                ...look,
                id: `${c.id}/div/${div.id}`, label: `Montant ${rank}`, role: "vdivider",
                length: underTop ? tallest : div.h, width: depth - zs - sb,
                edges: ["v0"],
                frame: { o: [ox + div.x, oy + div.y, oz + depth - sb], u: Y, v: neg(Z), n: X },
            });
            if (underTop)
            {
                part.notes.push("Tête coupée biaise dans la pente du dessus");
            }
            b.parts.push(part);
            attachEnds(c, lay, part, { ...div, sb }, "v", s, b);
        }
        else if (div.kind === "fixed")
        {
            const part = newPart({
                ...look,
                id: `${c.id}/div/${div.id}`, label: `Tablette fixe ${rank}`, role: "hdivider",
                length: div.w, width: depth - zs - sb, edges: ["v0"],
                frame: { o: [ox + div.x, oy + div.y + div.h, oz + depth - sb], u: X, v: neg(Z), n: neg(Y) },
            });
            b.parts.push(part);
            attachEnds(c, lay, part, { ...div, sb }, "h", s, b);
        }
        else
        {
            const clear = s.shelfSideClearance;
            const front = oz + depth - sb;
            // A glass shelf keeps its own thickness and rests on the underside of the slot the layout give it
            const glass = decorById(look.decor).thickness;
            const part = newPart({
                ...look, thickness: glass ?? div.h,
                id: `${c.id}/div/${div.id}`, label: `Étagère ${glass === undefined ? "" : "en verre "}réglable ${rank}`,
                role: "shelf", length: div.w - 2 * clear, width: depth - zs - sb,
                edges: glass === undefined ? ["v0"] : [],
                frame: { o: [ox + div.x + clear, oy + div.y + (glass ?? div.h), front], u: X, v: neg(Z), n: neg(Y) },
            });
            part.notes.push(glass === undefined ? `Posée sur 4 taquets ${DIAM}5, jeu latéral ${clear} mm par côté`
                : `Verre trempé à commander au miroitier, chants polis, posé sur 4 supports pour verre, jeu latéral ${clear} mm`);
            b.parts.push(part);
        }
        const last = b.parts[b.parts.length - 1]!;
        if (last.colour !== null)
        {
            last.notes.push(`Teinte ${last.colour}`);
        }
        if (sb > 0 && (div.axis === "v" || div.kind === "fixed"))
        {
            last.notes.push(`En retrait de ${sb} mm sur le chant avant du caisson`);
        }
    }
    recessedUprightChecks(c, lay, s, b);
}


// Joints of a divider with whatever it butts against at both ends. Both pieces may stand back from the front :
// the joint runs over the depth they share, each span measured from the front edge of its own piece
function attachEnds(c: Carcass, lay: ResolvedLayout, part: Part,
                    d: { x: number; y: number; w: number; h: number; split: string; sb: number }, axis: "h" | "v",
                    s: Settings, b: Build): void
{
    const t = c.thickness;
    const full = c.depth - lay.zBack;
    const span = (face: Part): { from: number; to: number; edgeFrom: number } =>
    {
        const q = lay.dividers.find((x) =>
        {
            return `${c.id}/div/${x.id}` === face.id;
        });
        const faceSb = q === undefined ? 0 : frontSetback(q, s.shelfFrontSetback);
        const shared = Math.max(d.sb, faceSb);
        return { from: shared - faceSb, to: full - faceSb, edgeFrom: shared - d.sb };
    };
    if (axis === "v")
    {
        // Bottom end on the panel below, top end under the panel above
        const below = d.y <= t + TOUCH ? byId(b.parts, `${c.id}/bottom`) : panelAtY(c, lay, d.y, d.x, b, "below");
        const above = d.y + d.h >= c.height - t - TOUCH
            ? byId(b.parts, `${c.id}/top`)
            : panelAtY(c, lay, d.y + d.h, d.x, b, "above");
        if (below !== undefined)
        {
            // On a horizontal panel u runs along x from its own strt
            const line = d.x + t / 2 - panelStartX(below, c);
            b.joints.push({ edgePart: part.id, edge: "u0", facePart: below.id, face: "A", lineAxis: "u",
                           line, ...span(below), reversed: false });
        }
        if (above !== undefined)
        {
            // The u of a sloped top runs along the slope
            const along = above.role === "top" ? Math.cos(topAngle(c)) : 1;
            const line = (d.x + t / 2 - panelStartX(above, c)) / along;
            b.joints.push({ edgePart: part.id, edge: "u1", facePart: above.id, face: above.role === "top" ? "A" : "B",
                           lineAxis: "u", line, ...span(above), reversed: false });
        }
        return;
    }
    const leftP = d.x <= t + TOUCH ? byId(b.parts, `${c.id}/side/L`) : panelAtX(c, lay, d.x, d.y, b, "left");
    const rightP = d.x + d.w >= c.width - t - TOUCH
        ? byId(b.parts, `${c.id}/side/R`)
        : panelAtX(c, lay, d.x + d.w, d.y, b, "right");
    if (leftP !== undefined)
    {
        const line = d.y + d.h / 2 - panelStartY(leftP, c);
        b.joints.push({ edgePart: part.id, edge: "u0", facePart: leftP.id, face: leftP.role === "side" ? "A" : "B",
                       lineAxis: "u", line, ...span(leftP), reversed: false });
    }
    if (rightP !== undefined)
    {
        const line = d.y + d.h / 2 - panelStartY(rightP, c);
        b.joints.push({ edgePart: part.id, edge: "u1", facePart: rightP.id, face: "A", lineAxis: "u", line,
                       ...span(rightP), reversed: false });
    }
}


// Hinges, runners, rails and pins of the lines are all drilled from the front edge of a side, and a recessed
// upright no longer has it where they expect. Only the pins of an adjustable shelf know where its front is
function recessedUprightChecks(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    // TODO hinges and runners on a recessed upright would need their own front reference, refused until a piece asks
    for (const q of lay.dividers)
    {
        const sb = frontSetback(q, s.shelfFrontSetback);
        if (q.axis !== "v" || sb <= 0)
        {
            continue;
        }
        for (const nb of lay.nodes.values())
        {
            const beside = Math.abs(nb.x + nb.w - q.x) < TOUCH ? "right"
                : Math.abs(q.x + q.w - nb.x) < TOUCH ? "left" : null;
            if (nb.kind !== "cell" || beside === null || nb.y >= q.y + q.h - TOUCH || nb.y + nb.h <= q.y + TOUCH)
            {
                continue;
            }
            const what: string[] = [];
            for (const f of c.fronts)
            {
                const node = findNode(c.root, f.node);
                if (f.spec.type !== "sliding" && node !== null && subtreeIds(node).includes(nb.id))
                {
                    what.push("une façade");
                }
            }
            if (c.rails.some((r) => { return r.cell === nb.id; }))
            {
                what.push("une penderie");
            }
            if (c.shoeRacks.some((r) => { return r.cell === nb.id; }))
            {
                what.push("un range-chaussures");
            }
            if (c.modularCells.includes(nb.id))
            {
                what.push("une série de trous");
            }
            if (c.outlets.some((o) => { return o.cell === nb.id && o.panel === beside; }))
            {
                what.push("un passe-câble");
            }
            if (what.length > 0)
            {
                b.errors.push(`${c.name} : le montant en retrait de ${sb} mm borde une case qui porte `
                    + `${[...new Set(what)].join(", ")}, percée depuis le devant d'un côté plein. Remettre le montant `
                    + "au nu ou retirer ce qu'elle porte.");
            }
        }
    }
}


export function panelStartX(p: Part, c: Carcass): number
{
    return p.frame === null ? 0 : p.frame.o[0] - c.x;
}


function panelStartY(p: Part, c: Carcass): number
{
    return p.frame === null ? 0 : p.frame.o[1] - c.y;
}


// Fixed horizontal panel whose face is at height y and spans x (local coordinates)
export function panelAtY(c: Carcass, lay: ResolvedLayout, y: number, x: number, b: Build,
    where: "below" | "above"): Part | undefined
{
    for (const q of lay.dividers)
    {
        const face = where === "below" ? q.y + q.h : q.y;
        if (q.axis === "h" && q.kind === "fixed" && x >= q.x - TOUCH && x <= q.x + q.w + TOUCH
            && Math.abs(face - y) < TOUCH)
        {
            return byId(b.parts, `${c.id}/div/${q.id}`);
        }
    }
    return undefined;
}


function panelAtX(c: Carcass, lay: ResolvedLayout, x: number, y: number, b: Build,
    where: "left" | "right"): Part | undefined
{
    const t = c.thickness;
    for (const q of lay.dividers)
    {
        const face = where === "left" ? q.x + t : q.x;
        if (q.axis === "v" && y >= q.y - TOUCH && y <= q.y + q.h + TOUCH && Math.abs(face - x) < TOUCH)
        {
            return byId(b.parts, `${c.id}/div/${q.id}`);   
        }
    }
    return undefined;
}
