// Items hung on the wall : the single shelf and the open box

import type { HangingBox, Settings, WallShelf } from "./model";
import { type Build, type Part, newPart } from "./parts";
import { X, Y, Z, neg, type Outline, type Segment } from "./geometry";
import { box } from "./fitted";
import { partMass, spread } from "./fittings";
import { CONCEALED_SHELF_SUPPORT } from "../data/rules";
import { DIAM } from "./text";

// Workshop convention, stated in the drawings as such : the end supports stand 100 in from the ends of the shelf
// TODO Häfele gives no end distance for its 283.33.910, a figure from the cabinet maker should replace this one
const SUPPORT_END_INSET = 100;


// Where the concealed supports of a shelf go, from its left end
export function shelfSupportPositions(width: number): number[]
{
    return spread(width, Math.min(SUPPORT_END_INSET, width / 4), CONCEALED_SHELF_SUPPORT.maxSpacing);
}


// the widest gap between two supports : the span its deflection is checked on
export function shelfSupportSpan(width: number): number
{
    const xs = shelfSupportPositions(width);
    let span = 0;
    for (let i = 1; i < xs.length; i++)
    {
        span = Math.max(span, xs[i]! - xs[i - 1]!);
    }
    return span;
}


// Häfele 283.33.910 pins drilled into the back edge, their plates screwed to the wall, the load read against
// the table of p. 7.142
function fitConcealedSupports(w: WallShelf, part: Part, s: Settings, b: Build): void
{
    const H = CONCEALED_SHELF_SUPPORT;
    if (w.thickness < H.minThickness)
    {
        b.errors.push(`${w.name} : ${w.thickness} mm d'épaisseur, ${H.minThickness} mini pour la fixation invisible `
            + `Häfele ${H.ref} (p. 7.142). Épaissir l'étagère.`);
        return;
    }
    if (s.wallType === "plasterboard")
    {
        b.errors.push(`${w.name} : la fixation invisible Häfele ${H.ref} se pose dans le bois ou la maçonnerie, pas `
            + "dans une plaque de plâtre (p. 7.142). Renforcer la cloison d'une fourrure bois ou changer le type "
            + "de mur.");
        return;
    }
    const xs = shelfSupportPositions(w.width);
    const mid = w.thickness / 2;
    xs.forEach((x, k) =>
    {
        // an edge hole sits on its edge : v1 is the back one, at the full width of the board
        part.holes.push({ u: x, v: part.width, diameter: H.pinDiameter, depth: H.pinDepth, face: "v1", w: mid,
                          label: `Fixation ${H.ref} : broche ${DIAM}${H.pinDiameter} x ${H.pinDepth}` });
        // one fitting : the pin runs on from the bottom of the plate pocket to the end of its hole
        const pin = box(`${w.id}/support${k}/broche`, w.id, H.ref, `${w.name}, broche ${k + 1}`,
                        [w.x + x - H.pinDiameter / 2, w.y + mid - H.pinDiameter / 2, w.z + H.pocket.depth],
                        [w.x + x + H.pinDiameter / 2, w.y + mid + H.pinDiameter / 2, w.z + H.pinDepth], true);
        const plate = box(`${w.id}/support${k}/platine`, w.id, H.ref, `${w.name}, platine ${k + 1}`,
                          [w.x + x - H.plate.width / 2, w.y + mid - H.plate.height / 2, w.z],
                          [w.x + x + H.plate.width / 2, w.y + mid + H.plate.height / 2, w.z + H.pocket.depth], true);
        pin.shape = "cylinder";
        pin.axes = [X, Y, Z];
        pin.half = [H.pinDiameter / 2, H.pinDiameter / 2, (H.pinDepth - H.pocket.depth) / 2];
        pin.host = part.id;
        plate.host = part.id;
        b.fitted.push(pin, plate);
    });
    part.pockets = xs.map((x) =>
    {
        return { edge: "v1" as const, at: x, length: H.pocket.width, across: H.pocket.height, w: mid,
                 depth: H.pocket.depth, label: `Entaille de la platine ${H.ref} (Häfele p. 7.142)` };
    });
    part.notes.push(`Fixations à ${SUPPORT_END_INSET} mm des bouts : convention d'atelier, Häfele ne la donne pas`);
    const n = xs.length;
    const line = (ref: string, qty: number, note: string | null): void =>
    {
        b.hardware.push({ ref, qty, item: w.id, itemName: w.name, target: part.id, note });
    };
    line(H.ref, n, `vendue par ${H.orderMultiple} chez Häfele`);
    line("WALL_SCREW_5x50", n * H.wallScrews, `${H.wallScrews} par platine`);
    line(s.wallType === "aerated" ? "PLUG_AERATED" : "PLUG_NYLON_8x40", n * H.wallScrews, null);
    // the load read on the table row of the same depth or the next deeper one, a deeper shelf carrying less
    const row = H.loads.find((r) =>
    {
        return w.depth <= r.depth + 0.01;
    });
    const own = partMass(part, true) / (w.width * w.depth * 1e-6);
    const load = s.shelfLoad * 100 + own;
    if (row === undefined)
    {
        b.errors.push(`${w.name} : ${w.depth} mm de profondeur, Häfele ne donne la charge de la ${H.ref} que jusqu'à `
            + `${H.loads[H.loads.length - 1]!.depth} mm (p. 7.142). Réduire la profondeur.`);
    }
    else if (load > row.kgPerM2)
    {
        b.errors.push(`${w.name} : ${load.toFixed(0)} kg/m² avec son poids, la fixation ${H.ref} en porte `
            + `${row.kgPerM2} à ${row.depth} mm de profondeur (Häfele p. 7.142). Réduire la profondeur ou la charge.`);
    }
    else
    {
        b.infos.push(`${w.name} : ${n} fixations invisibles Häfele ${H.ref}, ${load.toFixed(0)} kg/m² avec son poids `
            + `pour ${row.kgPerM2} admis à ${row.depth} mm de profondeur (p. 7.142).`);
    }
}


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


export function buildWallShelf(w: WallShelf, s: Settings, b: Build): void
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
    if (desk)
    {
        part.notes.push("Appuis du plan : sur les caissons voisins ou fixation à choisir");
    }
    else
    {
        fitConcealedSupports(w, part, s, b);
    }
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
