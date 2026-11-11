// A drop-down flap and the pull-out behind it : 2 flap hinges in the floor of the cell and in the flap, a braking
// stay on each side, a TIP-ON in the front edge of the panel over it (Häfele, HTH Furniture Fittings 2023 p. 3.185
// and 3.188)

import type { Carcass, DropFront, Settings } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import type { Build, Hole, Part } from "./part_types";
import type { FaceRef } from "./locate";
import { byId } from "./edit";
import { panelBelow, sideFace } from "./locate";
import { boxOrigin, newPart } from "./part_base";
import { BOTTOM_RECESS, buildPullOut, chooseRunner } from "./drawers";
import type { FrontPanel } from "./fronts";
import { fitTipOnHole } from "./doors";
import { X, Y, Z, at, neg, type Vec3 } from "./geometry";
import { crossedHoles } from "./drilling";
import { FLAP_HINGE_LEAF, FLAP_HINGE_TOP, MOVENTO } from "../data/rules";
import { DIAM } from "./text";

// Häfele 342.66.730 read on its STEP model, folded flap shut : x to the back, y along it, z up. No cup, the leaves
// at z -11.7 on the floor and x -11.7 on the flap. Its supplied screws at 30 degrees, counterbore 6.3, cone 60, hole 4.4
export const FLAP_HINGE = {
    ref: "342.66.730", floorZ: -11.7, flapX: -11.7,
    screws: [
        { at: [-7.37, 13.95, 1.2], way: [0, 0.5, -0.866] },
        { at: [-7.37, -13.95, 1.2], way: [0, -0.5, -0.866] },
        { at: [6.61, 0, 1.2], way: [0.5, 0, -0.866] },
        { at: [1.2, 13.95, 10.94], way: [-0.866, 0.5, 0] },
        { at: [1.2, -13.95, 10.94], way: [-0.866, -0.5, 0] },
        { at: [1.2, 0, 24.89], way: [-0.866, 0, 0.5] },
    ] as { at: Vec3; way: Vec3 }[],
    // Head 5.6 on the cone 1.49 in, measured on the model (0.02 mm3 of thread left). 13.34 of leaf on its axis, and its
    // shank of 3 meets the board at 30 degrees over 1.5 x tan 30 more (essai31)
    seat: 1.49, free: 13.34 + 1.5 * Math.tan(Math.PI / 6),
    // The boxes of the leaves in its frame, x, y, z from and to : the carcass leaf up to 1.2 where the flap stands on
    // it, its bosses up to 2.8 behind the back of the flap only
    floorLeaf: [[-16.1, 12.3], [-19, 19], [-11.7, 1.2]] as [number, number][],
    bosses: [[-11.7, 12.3], [-19, 19], [1.2, 2.8]] as [number, number][],
    flapLeaf: [[-11.7, 2.8], [-19, 19], [2.2, 30.6]] as [number, number][],
};
// Workshop choice : each hinge 100 in from the side of the cell, clear of the stays against them
const HINGE_INSET = 100;
// STARSTOP, p. 3.185 : the version for cells of 556 and more, its bracket on the side on the row 28 off the front
// edge, A = 372 over the floor, the one on the flap B = 150 over its lower edge. Brackets of 30 x 22 (holes 22
// apart, one over the other) and 45 x 32 (holes 32 apart, side by side)
export const STARSTOP = { left: "365.55.695", right: "365.55.685", minCell: 556, row: 28, sideUp: 372, flapUp: 150,
                          sideHoles: 22, flapHoles: 32, bracket: 45 };
// Workshop choices for the pull-out : spacers of the carcass board under its runners, clear of the stays, its box
// raised over the bracket of the stay standing on the open flap, its front back off the front edge, its sides
// holding bottles
const SPACER_HEIGHT = 80;
// The box 3 over the leaves, 14.5 proud of the floor and of the open flap, its front 3 behind the flap leaf. The edge
// of the box passes over the stay's bracket on the open flap too
// TODO the height of the STARSTOP bracket over the open flap, not in the 2023 catalogue : the box clears 17.5
const PULL_OUT_CLEAR = 3;
const PULL_OUT_SETBACK = 30;
const PULL_OUT_SIDE = 150;
// The 4 x 30 of a spacer, slid by 10 at a time off a drilling of the side, never closer than 15 to an end
const SPACER_SCREW = { diameter: 4, length: 30 };
const SPACER_SLIDES = [0, 10, -10, 20, -20, 30, -30];
const SPACER_END = 15;


// The side each spacer is screwed into, read once every drilling of that side is made
const spacers = new WeakMap<Part, FaceRef>();


// Where a point of the room falls along u and v of a part
function onPart(q: Part, p: Vec3): [number, number]
{
    const f = q.frame!;
    const d: Vec3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
    return [d[0] * f.u[0] + d[1] * f.u[1] + d[2] * f.u[2], d[0] * f.v[0] + d[1] * f.v[1] + d[2] * f.v[2]];
}


// Each screw of a spacer slid along it off what its side has there, once the joints are drilled : one ran into a
// Minifix housing (essai25), the housings come after the flaps
export function settleSpacerScrews(c: Carcass, b: Build): void
{
    for (const spacer of b.parts.filter((q) => { return q.item === c.id && spacers.has(q); }))
    {
        const side = spacers.get(spacer)!;
        for (const h of spacer.holes.filter((x) => { return x.purpose === "spacer-screw"; }))
        {
            const v = h.v;
            const clear = SPACER_SLIDES.map((d) => { return v + d; }).find((w) =>
            {
                const [su, sv] = onPart(side.part, at(spacer.frame!, h.u, w, 0));
                if (w <= SPACER_END || w >= spacer.width - SPACER_END)
                {
                    return false;
                }
                // Against every drilling of the side, those of its edges too : lowered with the drawer, a screw ran into
                // the passage of a Minifix bolt up the bottom edge (essai30)
                const probe: Hole = { u: su, v: sv, diameter: SPACER_SCREW.diameter, depth: SPACER_SCREW.length -
                                     spacer.thickness,
                                      face: side.face, label: "vis de cale", purpose: "spacer-screw" };
                side.part.holes.push(probe);
                const met = crossedHoles(side.part).some(([x, y]) => { return x === probe || y === probe; });
                side.part.holes.pop();
                return !met;
            });
            if (clear === undefined)
            {
                b.errors.push(`${c.name}, tiroir intérieur : une vis de la ${spacer.label.toLowerCase()} tombe sur un perçage `
                    + `de ${side.part.label.toLowerCase()}. Déplacer la cale ou ce perçage.`);
                continue;
            }
            h.v = clear;
        }
    }
}


export function fitDropFlaps(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    for (const fp of b.fronts.get(c.id) ?? [])
    {
        const front = byId(c.fronts, fp.front);
        const nb = lay.nodes.get(fp.node);
        const flap = byId(b.parts, `${c.id}/front/${fp.id}`);
        if (fp.role !== "drop" || front?.spec.type !== "drop" || nb === undefined || flap === undefined)
        {
            continue;
        }
        const name = `${c.name}, abattant ${fp.number}`;
        if (nb.h < STARSTOP.minCell)
        {
            b.errors.push(`${name} : case de ${Math.round(nb.h)} mm, ${STARSTOP.minCell} mini pour les compas STARSTOP `
                + "(Häfele p. 3.185). Agrandir la case.");
            continue;
        }
        const floor = panelBelow(c, lay, nb, b);
        const faces = [sideFace(c, lay, b, nb, "left"), sideFace(c, lay, b, nb, "right")];
        if (floor === undefined || faces[0] === null || faces[1] === null)
        {
            b.errors.push(`${name} : panneau du bas ou face de côté introuvable pour ses charnières et ses compas.`);
            continue;
        }
        hinges(c, nb, fp, floor, flap, b);
        stays(c, nb, fp.rect.x, faces as FaceRef[], flap, b);
        // Open, the leaves lie in line and the back of the flap levels with the floor. An inset flap h up and t thick
        // turns about (h - t) / 2 under the floor and in front of its back, an overlay one about its outer lower edge
        const inset = front.mount === "inset";
        const lift = (FLAP_HINGE_LEAF - fp.thickness) / 2;
        const pivot: Vec3 = inset ? [c.x + fp.rect.x, c.y + nb.y + lift, c.z + fp.z - lift]
            : [c.x + fp.rect.x, c.y + fp.rect.y, c.z + fp.z + fp.thickness];
        b.motions.push({
            item: c.id, front: fp.id, label: name, kind: "turn",
            pivot, axis: X, amount: 90,
            parts: [flap.id], fitted: [], rides: [],
            source: `charnières d'abattant ${FLAP_HINGE.ref} 90°`, remedy: "Dégager le devant de l'abattant.",
        });
        if (front.opening === "push")
        {
            b.hardware.push({ ref: "956.1004", qty: 1, item: c.id, itemName: c.name, target: fp.id,
                              note: "au milieu du chant haut de l'abattant, version avec aimant : le tient fermé",
                              purpose: "push-latch" });
            fitTipOnHole(c, lay, b, nb, fp, "left", "956.1004", true, front.mount === "inset" ? fp.thickness : 0);
        }
        const spec: DropFront = front.spec;
        if (spec.pullOut !== null)
        {
            pullOut(c, lay, s, b, fp, front, nb, faces as FaceRef[], spec.pullOut);
        }
    }
}


// Each hinge in the frame of its model : x towards the back, y along the floor, z up, its origin where the model has
// it. The back of the inset flap at FLAP_HINGE.flapX, the floor of the cell at FLAP_HINGE.floorZ. y runs to the left
// with x to the back, the frame turned and not mirrored
function hingeFrame(c: Carcass, nb: NodeBox, fp: FrontPanel, x: number): (p: Vec3) => Vec3
{
    const o: Vec3 = [c.x + x, c.y + nb.y - FLAP_HINGE.floorZ, c.z + fp.z + FLAP_HINGE.flapX];
    return (p: Vec3): Vec3 => { return [o[0] - p[1], o[1] + p[2], o[2] - p[0]]; };
}


// 2 hinges screwed on the faces by their own screws, set at 30 degrees through the leaves (cad_hardware.ts), nothing
// drilled for them. Their leaves stand in the cell for the checks of clashes : the pull-out runs over them
function hinges(c: Carcass, nb: NodeBox, fp: FrontPanel, floor: Part, flap: Part, b: Build): void
{
    for (const [k, x] of [nb.x + HINGE_INSET, nb.x + nb.w - HINGE_INSET].entries())
    {
        const room = hingeFrame(c, nb, fp, x);
        for (const [name, box, host] of [["meuble", FLAP_HINGE.floorLeaf, floor], ["bossages", FLAP_HINGE.bosses, floor],
                                         ["abattant", FLAP_HINGE.flapLeaf, flap]] as const)
        {
            const mid = box.map(([a, z]) => { return (a + z) / 2; }) as Vec3;
            const half = box.map(([a, z]) => { return (z - a) / 2; });
            b.fitted.push({ key: `${c.id}/drop/${fp.id}/charniere${k}/aile-${name}`, item: c.id, ref: FLAP_HINGE.ref,
                            label: `${c.name}, charnière d'abattant, ${name === "meuble" ? "aile du meuble"
                                : name === "bossages" ? "bossages des vis" : "aile de l'abattant"}`,
                            purpose: "flap-hinge", shape: "box", centre: room(mid), axes: [X, Y, Z],
                            half: [half[1]!, half[2]!, half[0]!], host: host.id, hidden: true });
        }
    }
    // Found in no shop on 2026-11-08, its neighbour 342.66.709 in stock : kept for its drawing, the cabinet maker
    // confirms it
    b.hardware.push({ ref: FLAP_HINGE.ref, qty: 2, item: c.id, itemName: c.name, target: flap.id,
                      note: "en applique, abattant intérieur posé sur l'aile du meuble, vis fournies, référence à confirmer "
                          + "chez Häfele", purpose: "flap-hinge" });
    flap.notes.push(`Abattant intérieur entre les montants, posé sur les ailes des charnières ${FLAP_HINGE.ref} : son `
        + `chant bas ${FLAP_HINGE_LEAF} mm au-dessus du fond de la case. Charnières en applique, sans cuvette, vissées `
        + "par leurs 6 vis fournies chacune, à 30 degrés à travers les ailes, 3 dans le fond et 3 dans l'abattant, rien "
        + "à percer. Vis fournies et référence à confirmer chez Häfele");
}


// A braking stay on each side : its bracket on the side of the cell, the other on the flap
function stays(c: Carcass, nb: NodeBox, flapX: number, faces: FaceRef[], flap: Part, b: Build): void
{
    for (const [k, fr] of faces.entries())
    {
        const left = k === 0;
        const ref = left ? STARSTOP.left : STARSTOP.right;
        const u = nb.y + STARSTOP.sideUp - fr.uOrigin;
        for (const du of [-STARSTOP.sideHoles / 2, STARSTOP.sideHoles / 2])
        {
            fr.part.holes.push({ u: u + du, v: STARSTOP.row - fr.vOrigin, diameter: 0, depth: 0, face: fr.face,
                                 label: `Compas STARSTOP ${ref} : équerre de côté, vis selon la notice`, purpose: "flap-screw",
                                 fixes: ref });
        }
        // The bracket on the flap in line with the one on the side, half its width in from the side of the cell
        const x = left ? nb.x + STARSTOP.bracket / 2 : nb.x + nb.w - STARSTOP.bracket / 2;
        for (const dv of [-STARSTOP.flapHoles / 2, STARSTOP.flapHoles / 2])
        {
            flap.holes.push({ u: STARSTOP.flapUp, v: x - flapX + dv, diameter: 0, depth: 0, face: "A",
                              label: `Compas STARSTOP ${ref} : équerre d'abattant, vis selon la notice`, purpose: "flap-screw",
                              fixes: ref });
        }
        // The version for cells of 556 shown discontinued by a US shop on 2026-11-08, still in the 2023 catalogue
        b.hardware.push({ ref, qty: 1, item: c.id, itemName: c.name, target: flap.id,
                          note: `compas à frein ${left ? "gauche" : "droit"}, disponibilité à confirmer chez Häfele`, purpose: "flap" });
    }
    flap.notes.push(`Compas à frein STARSTOP ${STARSTOP.left} et ${STARSTOP.right} : équerres à ${STARSTOP.sideUp} mm `
        + `au-dessus du fond sur la rangée à ${STARSTOP.row} mm et à ${STARSTOP.flapUp} mm du chant bas de l'abattant. Cote `
        + "C à régler par essai de montage, charge admise non publiée et disponibilité de la version 556 à confirmer "
        + "auprès de Häfele (2023 p. 3.185)");
}


// The pull-out : a spacer on each side under its runner, its box between the stays
function pullOut(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build, fp: Parameters<typeof buildPullOut>[3],
    front: Parameters<typeof buildPullOut>[4], nb: NodeBox, sides: FaceRef[],
    { loadKg, boxDecor }: { loadKg: number; boxDecor?: string }): void
{
    const t = c.thickness;
    // Behind the flap leaf of an inset flap, else the setback off the front edge
    // The flap leaf stands 14.5 behind the back of the flap, as high as the carcass leaf rises
    const zFront = front.mount === "inset" ? fp.z - FLAP_HINGE_TOP - PULL_OUT_CLEAR : c.depth - PULL_OUT_SETBACK;
    const runner = chooseRunner(zFront - lay.zBack, loadKg);
    if (runner === null)
    {
        b.errors.push(`${c.name}, tiroir intérieur : aucune coulisse MOVENTO pour ${Math.round(zFront - lay.zBack)} mm de `
            + "profondeur. Approfondir le caisson.");
        return;
    }
    const [ox, oy, oz] = boxOrigin(c);
    // The underside of the box sides PULL_OUT_CLEAR over the leaves, the runner that much lower (Blum : the
    // bottom of the
    // sides bottomAboveLower over the runner, the bottom of the box BOTTOM_RECESS up them)
    const low = nb.y + FLAP_HINGE_TOP + PULL_OUT_CLEAR - (MOVENTO.bottomAboveLower - BOTTOM_RECESS);
    const y0 = low + MOVENTO.screwAxisAboveLower - SPACER_HEIGHT / 2;
    const faces: FaceRef[] = [];
    for (const [k, side] of sides.entries())
    {
        const left = k === 0;
        const x = left ? nb.x : nb.x + nb.w - t;
        const spacer = newPart({
            item: c.id, itemName: c.name, thickness: t, decor: c.decor, id: `${c.id}/pull-out/${fp.id}/spacer/${left ? "L" : "R"}`,
            label: `Cale de coulisse ${left ? "gauche" : "droite"}`, role: "cleat", length: SPACER_HEIGHT, width: runner.nl,
            edges: [], frame: { o: [ox + x, oy + y0, oz + zFront], u: Y, v: neg([0, 0, 1]), n: X },
        });
        // Face B looks into the cell on the left, face A on the right : screwed through into the side from there
        const face = left ? "B" as const : "A" as const;
        for (const u of [8, SPACER_HEIGHT - 8])
        {
            for (const v of [30, runner.nl / 2, runner.nl - 30])
            {
                spacer.holes.push({ u, v, diameter: 0, depth: 0, face,
                                   label: `Cale de coulisse dans ${side.part.label.toLowerCase()} : vis 4 x 30`,
                                    purpose: "spacer-screw" });
            }
        }
        spacers.set(spacer, side);
        spacer.notes.push(`Bande de ${SPACER_HEIGHT} mm débitée dans le panneau de la caisse : écarte la coulisse du compas`);
        b.parts.push(spacer);
        faces.push({ part: spacer, face, uOrigin: y0, vOrigin: 0 });
    }
    b.hardware.push({ ref: "SCREW_4x30", qty: 12, item: c.id, itemName: c.name, target: fp.id,
                      note: "cales de coulisse du tiroir intérieur", purpose: "spacer-screw" });
    buildPullOut(c, s, b, fp, front, nb, { loadKg, faces, spacer: t, low, zFront, hs: PULL_OUT_SIDE, runner,
                                         boxDecor });
}
