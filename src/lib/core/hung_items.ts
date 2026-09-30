// Items hung on the wall : the single shelf and the open box

import type { HangingBox, WallShelf } from "./model";
import { type Build, newPart } from "./parts";
import { X, Y, Z, neg, type Outline, type Segment } from "./geometry";


// Board seen from above, u along the wall, v from the front edge back : front corners rounded at will
export function shelfOutline(L: number, W: number, left: number, right: number): Outline
{
    const segments: Segment[] = [{ kind: "line", x: L - right, y: 0 }];
    if (right > 0)
    {
        segments.push({ kind: "arc", x: L, y: right, cx: L - right, cy: right, ccw: true });
    }
    segments.push({ kind: "line", x: L, y: W }, { kind: "line", x: 0, y: W }, { kind: "line", x: 0, y: left });
    if (left > 0)
    {
        segments.push({ kind: "arc", x: left, y: 0, cx: left, cy: left, ccw: true });
    }
    return { start: [left, 0], segments };
}


export function buildWallShelf(w: WallShelf, b: Build): void
{
    const desk = w.purpose === "desk";
    const part = newPart({
        item: w.id, itemName: w.name, thickness: w.thickness, decor: w.decor,
        id: `${w.id}/shelf`, label: desk ? "Plan de bureau" : "Étagère murale", role: "wallShelf", length: w.width,
        width: w.depth, edges: ["v0", "u0", "u1"],
        frame: { o: [w.x, w.y + w.thickness, w.z + w.depth], u: X, v: neg(Z), n: neg(Y) },
    });
    const { left, right } = w.corners;
    if (left < 0 || right < 0 || left > w.depth || right > w.depth || left + right > w.width)
    {
        b.errors.push(`${w.name} : rayons de coin ${left} et ${right} mm impossibles sur ${w.width} x ${w.depth}. `
            + "Les garder positifs, au plus la profondeur, et à eux deux au plus la largeur.");
    }
    else if (left > 0 || right > 0)
    {
        part.outline = shelfOutline(w.width, w.depth, left, right);
        part.notes.push("Coins arrondis : découpe d'après le DXF, chant cintré posé à la main");
    }
    // TODO : no concealed shelf bracket sourced yet, the analsis warns about it until one is chosen
    part.notes.push(desk ? "Appuis du plan : sur les caissons voisins ou fixation à choisir"
        : "Fixation invisible : quincaillerie non encore sourcée");
    b.parts.push(part);
}


export function buildBox(x: HangingBox, b: Build): void
{
    const t = x.thickness;
    const back = x.z + x.depth;
    const common = { item: x.id, itemName: x.name, thickness: t, decor: x.decor };
    const top = newPart({
        ...common, id: `${x.id}/top`, label: "Dessus", role: "top", length: x.width, width: x.depth,
        edges: ["v0", "u0", "u1"], frame: { o: [x.x, x.y + x.height - t, back], u: X, v: neg(Z), n: Y },
    });
    const bottom = newPart({
        ...common, id: `${x.id}/bottom`, label: "Dessous", role: "bottom", length: x.width, width: x.depth,
        edges: ["v0", "u0", "u1"], frame: { o: [x.x, x.y + t, back], u: X, v: neg(Z), n: neg(Y) },
    });
    const left = newPart({
        ...common, id: `${x.id}/side/L`, label: "Côté gauche", role: "side", length: x.height - 2 * t, width: x.depth,
        edges: ["v0"], frame: { o: [x.x + t, x.y + t, back], u: Y, v: neg(Z), n: neg(X) },
    });
    const right = newPart({
        ...common, id: `${x.id}/side/R`, label: "Côté droit", role: "side", length: x.height - 2 * t, width: x.depth,
        edges: ["v0"], frame: { o: [x.x + x.width - t, x.y + t, back], u: Y, v: neg(Z), n: X },
    });
    b.parts.push(top, bottom, left, right);
    // Sides between top and bottom : side ends butt against the inner faces of top and bottom
    b.joints.push({ edgePart: left.id, edge: "u0", facePart: bottom.id, face: "A", lineAxis: "u", line: t / 2, from: 0,
                   to: x.depth, edgeFrom: 0, reversed: false });
    b.joints.push({ edgePart: left.id, edge: "u1", facePart: top.id, face: "A", lineAxis: "u",
                   line: t / 2, from: 0, to: x.depth, edgeFrom: 0, reversed: false });
    b.joints.push({ edgePart: right.id, edge: "u0", facePart: bottom.id, face: "A", lineAxis: "u",
                   line: x.width - t / 2, from: 0, to: x.depth, edgeFrom: 0, reversed: false });
    b.joints.push({ edgePart: right.id, edge: "u1", facePart: top.id, face: "A", lineAxis: "u", line: x.width - t / 2,
                   from: 0, to: x.depth, edgeFrom: 0, reversed: false });
}
