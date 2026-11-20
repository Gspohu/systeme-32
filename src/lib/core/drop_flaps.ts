// A drop-down flap and the pull-out behind it : 2 flap hinges in the floor of the cell and in the flap (Häfele 2023
// p. 3.188), a gas stay on each side (Häfele France MB 5.313), a TIP-ON in the front edge of the panel over it

import type { Carcass, DropFront, Settings } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import type { Build, Hole, Part } from "./part_types";
import type { FaceRef } from "./locate";
import { byId } from "./edit";
import { panelBelow, sideFace } from "./locate";
import { boxOrigin, newPart } from "./part_base";
import { BOTTOM_RECESS, BOX_THICKNESS, buildPullOut, chooseRunner } from "./drawers";
import type { FrontPanel } from "./fronts";
import { fitTipOnHole } from "./doors";
import { X, Y, Z, at, neg, type Vec3 } from "./geometry";
import { crossedHoles } from "./drilling";
import { PILOT_DIAMETER, PILOT_SHORT } from "./pilots";
import { MOVENTO } from "../data/rules";
import { DIAM, round1 } from "./text";

// Häfele 342.78.700 overlay flap hinge (LGH-M 2017 p. MB 5.318), sold by 4 : a body in a Ø26 bore 15 deep in the
// floor, 10.5 off its front edge, the other Ø26 x 14 in the flap, 10.5 over its lower edge. Its STEP shut : x to the
// front, y across, z up, origin on the floor bore axis
export const FLAP_HINGE = {
    ref: "342.78.700", pack: 4, bore: 26, floorDepth: 15, flapDepth: 14, offEdge: 10.5,
    // Where the model has the flap : its back 13.09 in front of the floor bore, its bore 7.85 under the floor
    flapBack: 13.09, flapBore: -7.85,
    // Its HOSPA 3 drawn in the bodies, 20 off the joint and 13.5 either side : cores of 2.2, 12.1 into the floor and
    // 13.35 into the flap
    pilot: { offBore: 9.5, across: 13.5, diameter: 2.2, floor: 12.5, flap: 13.5 },
    // Height + 2, depth +-4 (MB 5.318), what it takes to bring the flap in line with the doors
    lift: [0, 2] as [number, number], depth: [-4, 4] as [number, number],
    // Its collars, x y z from and to in its frame : on the floor, up to 3.35 open or shut, and behind the flap
    floorCollar: [[-16.5, 10], [-19, 19], [0, 3.35]] as [number, number][],
    flapCollar: [[11.59, 13.09], [-19, 19], [-18.85, 8.65]] as [number, number][],
};
// Workshop choice : each hinge 100 in from the side of the cell, clear of the stays agaisnt them
const HINGE_INSET = 100;
// Häfele gas stay 365.01.901 (LGH-M 2017 p. MB 5.313), flap shut : pivots 238 and 65 over its lower edge, the
// cabinet one 18 behind its back. Strut 15, sockets 16.5. 2 past 400 high, 10 kg and 600 high at most
export const GAS_STAY = { ref: "365.01.901", sideUp: 238, flapUp: 65, sideBehind: 18,
                          // Off its STEP rebuilt (scripts/gas_stay_step.py), brackets laid flat : the ball 16 off the
                          // side, the flap one 14.5 behind the flap, not the 25 and 16 of the montage drawing
                          flapBehind: 14.5, offSide: 16,
                          strut: 15, socket: 16.5, pin: 10, maxHigh: 600, maxKg: 10,
                          // Flap plate 46 x 31 x 3, 2 screws 32 apart, 19 off the pivot. Cabinet plate 46 x 14 x 3
                          // from 1 to 15 in front of its ball, its foot 15 in front
                          plate: { long: 46, wide: 31, thick: 3, screws: 32, offPivot: 19 },
                          cabinet: { deep: 14, front: 1, foot: 15 } };
// Workshop choices for the pull-out : spacers of the carcass board under its runners, clear of the stays, its box
// raised over the bracket of the stay standing on the open flap, its front back off the front edge, its sides
// holding bottles
const SPACER_HEIGHT = 80;
const SPACER_LAYERS = 2;
// The box 3 over the hinge collars, 3.35 proud of the floor and of the open flap. Its edge passes over the plate of
// the stay on the open flap too, the struts stay outside its sides
// TODO the stays are only built shut : their swing over the open flap, past the box, isn't checked
const PULL_OUT_CLEAR = 3;
const PULL_OUT_SETBACK = 30;
const PULL_OUT_SIDE = 150;
// The 4 x 30 of a spacer, slid by 10 at a time off a drilling of the side, never closer than 15 to an end
const SPACER_SCREW = { diameter: 4, length: 30 };
const SPACER_SLIDES = [0, 10, -10, 20, -20, 30, -30];
const SPACER_END = 15;


// The side each spacer is screwed into, read once every driling of that side is made
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
            // Its pilot in the side where it setled, bored in the workshop : nothing drilled on site
            side.part.holes.push(spacerPilot(side.part, onPart(side.part, at(spacer.frame!, h.u, clear, 0)), side.face,
                                             SPACER_SCREW.length - spacer.thickness, h.label));
        }
    }
}


function spacerPilot(q: Part, [u, v]: [number, number], face: "A" | "B", reach: number, label: string): Hole
{
    return { u, v, face, diameter: PILOT_DIAMETER, label: `${label} : avant-trou`, purpose: "spacer-pilot",
             depth: Math.max(1, Math.min(reach - PILOT_SHORT, q.thickness - PILOT_SHORT)) };
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
        if (fp.rect.h > GAS_STAY.maxHigh)
        {
            const high = String(Math.round(fp.rect.h * 10) / 10).replace(".", ",");
            b.warnings.push(`${name} : ${high} mm de haut, au-delà des ${GAS_STAY.maxHigh} mm `
                + `des compas ${GAS_STAY.ref} (Häfele MB 5.313). Essai de butée avant pose, comme le recommande Häfele.`);
        }
        if (front.mount === "inset")
        {
            b.errors.push(`${name} : les charnières ${FLAP_HINGE.ref} posent l'abattant en applique devant le fond. `
                + "Le passer en applique.");
            continue;
        }
        const floor = panelBelow(c, lay, nb, b);
        const faces = [sideFace(c, lay, b, nb, "left"), sideFace(c, lay, b, nb, "right")];
        if (floor === undefined || faces[0] === null || faces[1] === null)
        {
            b.errors.push(`${name} : panneau du bas ou face de côté introuvable pour ses charnières et ses compas.`);
            continue;
        }
        const { top } = floorEdge(floor);
        if (!hinges(c, nb, fp, floor, flap, b, name))
        {
            continue;
        }
        stays(c, nb, fp, faces as FaceRef[], flap, b);
        // Open, its back levels with the floor and its lower edge comes to the floor's front : it turns about the
        // middle of the drop d from the floor down to its lower edge, d / 2 under the floor and in front of its back
        const drop = top - (c.y + fp.rect.y);
        const pivot: Vec3 = [c.x + fp.rect.x, top - drop / 2, c.z + fp.z + drop / 2];
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
            fitTipOnHole(c, lay, b, nb, fp, "left", "956.1004", true);
        }
        const spec: DropFront = front.spec;
        if (spec.pullOut !== null)
        {
            pullOut(c, lay, s, b, fp, front, nb, faces as FaceRef[], spec.pullOut);
        }
    }
}


export function floorEdge(floor: Part): { front: number; top: number }
{
    const f = floor.frame!;
    const pts = [0, floor.thickness].flatMap((w) =>
    {
        return [at(f, 0, 0, w), at(f, floor.length, 0, w), at(f, 0, floor.width, w), at(f, floor.length, floor.width,
            w)];
    });
    return { front: Math.max(...pts.map((p) => { return p[2]; })), top: Math.max(...pts.map((p) => { return p[1]; })) };
}


// The face of a part looking along a direction of the room : face A is at w = 0, its drilling runs along +n
function faceToward(q: Part, dir: Vec3): "A" | "B"
{
    const n = q.frame!.n;
    return n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? "A" : "B";
}


// What each hinge is set by to bring the flap where the doors are, along the depth and the height of its frame
export function hingeSetting(c: Carcass, fp: FrontPanel, floor: Part): { depth: number; lift: number; bore: number }
{
    const hinge = FLAP_HINGE;
    const { front, top } = floorEdge(floor);
    const bore = front - hinge.offEdge;
    return { bore, depth: c.z + fp.z - bore - hinge.flapBack,
             lift: c.y + fp.rect.y + hinge.offEdge - top - hinge.flapBore };
}


// 2 hinges 100 in from the sides, in their Ø26 bores drilled as the catalogue draws them : the floor one open on its
// front edge, the flap one on its lower edge. The drop of the flap and its gap to the floor are taken up by the
// hinge's own settings, the rest is refused
function hinges(c: Carcass, nb: NodeBox, fp: FrontPanel, floor: Part, flap: Part, b: Build, name: string): boolean
{
    const hinge = FLAP_HINGE;
    const { top } = floorEdge(floor);
    const { bore, depth, lift } = hingeSetting(c, fp, floor);
    const back = c.z + fp.z;
    const bottom = c.y + fp.rect.y;
    if (lift < hinge.lift[0] || lift > hinge.lift[1] || depth < hinge.depth[0] || depth > hinge.depth[1])
    {
        b.errors.push(`${name} : les charnières ${hinge.ref} devraient être réglées de ${round1(lift)} mm en hauteur `
            + `et ${round1(depth)} mm en profondeur, hors de leurs ${hinge.lift[1]} et ${hinge.depth[1]} mm `
            + "(Häfele MB 5.318). Revoir la hauteur ou le jeu de l'abattant.");
        return false;
    }
    const up = faceToward(floor, Y);
    const behind = faceToward(flap, neg(Z));
    const drill = (q: Part, p: Vec3, face: "A" | "B", diameter: number, deep: number, what: string): void =>
    {
        const [u, v] = onPart(q, p);
        q.holes.push({ u, v, diameter, depth: deep, face,
                      purpose: diameter === hinge.bore ? "flap-hinge" : "flap-hinge-pilot",
                       fixes: hinge.ref, label: `Charnière d'abattant ${hinge.ref} : ${what}` });
    };
    for (const [k, x] of [c.x + nb.x + HINGE_INSET, c.x + nb.x + nb.w - HINGE_INSET].entries())
    {
        drill(floor, [x, top, bore], up, hinge.bore, hinge.floorDepth,
              `logement ${DIAM}26 x ${hinge.floorDepth}, débouchant sur le chant`);
        drill(flap, [x, bottom + hinge.offEdge, back], behind, hinge.bore, hinge.flapDepth,
              `logement ${DIAM}26 x ${hinge.flapDepth}, débouchant sur le chant bas`);
        const pilot = hinge.pilot;
        for (const s of [-1, 1])
        {
            const across = x + s * pilot.across;
            drill(floor, [across, top, bore - pilot.offBore], up, pilot.diameter, pilot.floor,
                  "avant-trou de vis HOSPA 3");
            drill(flap, [across, bottom + hinge.offEdge + pilot.offBore, back], behind, pilot.diameter, pilot.flap,
                  "avant-trou de vis HOSPA 3");
        }
        // Its collars in the cell for the checks of clashes, the flap side moved by the settings
        const room = (p: Vec3, dx: number, dz: number): Vec3 => { return [x + p[1], top + p[2] + dz, bore +
            p[0] + dx]; };
        for (const [part, box, host, dx, dz] of [["fond", hinge.floorCollar, floor, 0, 0],
                                                  ["abattant", hinge.flapCollar, flap, depth, lift]] as const)
        {
            const mid = box.map(([a, z]) => { return (a + z) / 2; }) as Vec3;
            const half = box.map(([a, z]) => { return (z - a) / 2; });
            b.fitted.push({ key: `${c.id}/drop/${fp.id}/charniere${k}/${part}`, item: c.id, ref: hinge.ref,
                            label: `${c.name}, charnière d'abattant, côté ${part === "fond" ? "meuble" : "abattant"}`,
                            purpose: "flap-hinge", shape: "box", centre: room(mid, dx, dz), axes: [X, Y, Z],
                            half: [half[1]!, half[2]!, half[0]!], host: host.id, hidden: true });
        }
    }
    b.hardware.push({ ref: hinge.ref, qty: 2, item: c.id, itemName: c.name, target: flap.id, purpose: "flap-hinge",
                      note: `charnières d'abattant en applique, réglées de +${round1(lift)} mm en hauteur, vis HOSPA 3` });
    flap.notes.push(`Abattant en applique dans le plan des portes voisines, sur 2 charnières ${hinge.ref} `
        + `(Häfele MB 5.318) : logements ${DIAM}26 à ${hinge.offEdge} mm du chant avant du fond et du chant bas de l'abattant, réglage en hauteur `
        + `de +${round1(lift)} mm et en profondeur de ${round1(depth)} mm pour l'aligner sur les portes`);
    return true;
}


// A gas stay on each side, flap shut : its bracket on the side of the cell, the other on the back of the flap. Häfele
// sets them by trial (the cabinet first, the flap bracket once the flap is open) : screw places, nothing drilled
function stays(c: Carcass, nb: NodeBox, fp: FrontPanel, faces: FaceRef[], flap: Part, b: Build): void
{
    const stay = GAS_STAY;
    const plate = stay.plate;
    const back = c.z + fp.z;
    const edge = c.y + fp.rect.y;
    for (const [k, fr] of faces.entries())
    {
        const left = k === 0;
        const hand = left ? "gauche" : "droit";
        const inward = left ? 1 : -1;
        const sideX = left ? nb.x : nb.x + nb.w;
        const axisX = sideX + inward * stay.offSide;
        const upper: Vec3 = [c.x + axisX, edge + stay.sideUp, back - stay.sideBehind];
        const lower: Vec3 = [c.x + axisX, edge + stay.flapUp, back - stay.flapBehind];
        fr.part.holes.push({ u: fp.rect.y + stay.sideUp - fr.uOrigin,
                             v: c.depth - (fp.z - stay.sideBehind) - fr.vOrigin,
                             diameter: 0, depth: 0, face: fr.face, purpose: "flap-screw", fixes: stay.ref,
                             label: `Compas ${stay.ref} ${hand} : axe de l'équerre de corps, posée par essai (Häfele)` });
        // The plate on the flap reachs 26 in from its pivot and 5 out, its screws 19 in
        const screwsX = axisX + inward * plate.offPivot - fp.rect.x;
        for (const du of [-plate.screws / 2, plate.screws / 2])
        {
            flap.holes.push({ u: stay.flapUp + du, v: screwsX, diameter: 0, depth: 0, face: "A", purpose: "flap-screw",
                              fixes: stay.ref,
                              label: `Compas ${stay.ref} ${hand} : équerre d'abattant, vissée abattant ouvert` });
        }
        const rise: Vec3 = [upper[0] - lower[0], upper[1] - lower[1], upper[2] - lower[2]];
        const len = Math.hypot(...rise);
        const axis: Vec3 = [rise[0] / len, rise[1] / len, rise[2] / len];
        const across: Vec3 = [0, axis[2], -axis[1]];
        const key = `${c.id}/drop/${fp.id}/compas-${hand}`;
        const plateX = c.x + axisX + inward * (plate.wide / 2 - 5);
        b.fitted.push(
            { key: `${key}/verin`, item: c.id, ref: stay.ref, label: `${c.name}, compas ${stay.ref} ${hand} : vérin`,
              purpose: "flap-stay", shape: "cylinder", centre: [lower[0] + rise[0] / 2, lower[1] + rise[1] / 2,
                                                                lower[2] + rise[2] / 2],
              axes: [X, across, axis], half: [stay.strut / 2, stay.strut / 2, len / 2 - stay.socket / 2], host: null,
              hidden: true },
            { key: `${key}/equerre-abattant`, item: c.id, ref: stay.ref, host: flap.id, hidden: true,
              label: `${c.name}, compas ${stay.ref} ${hand} : équerre d'abattant`, purpose: "flap-stay", shape: "box",
              centre: [plateX, lower[1], back - plate.thick / 2], axes: [X, Y, Z],
              half: [plate.wide / 2, plate.long / 2, plate.thick / 2] },
            // Its plate flat on the side, in front of the ball, as its STEP rebuilt draws it
            { key: `${key}/equerre-corps`, item: c.id, ref: stay.ref, host: fr.part.id, hidden: true,
              label: `${c.name}, compas ${stay.ref} ${hand} : équerre de corps`, purpose: "flap-stay",
              shape: "box", centre: [c.x + sideX + inward * plate.thick / 2, upper[1],
                                     upper[2] + stay.cabinet.front + stay.cabinet.deep / 2], axes: [X, Y, Z],
              half: [plate.thick / 2, plate.long / 2, stay.cabinet.deep / 2] },
            // Its foot and stud : from the plate past the ball, from behind the ball to the foot, as high as the
            // ball. The strut starts half a socket under it
            { key: `${key}/teton`, item: c.id, ref: stay.ref, host: null, hidden: true,
              label: `${c.name}, compas ${stay.ref} ${hand} : téton de l'équerre de corps (encombrement)`,
              purpose: "flap-stay", shape: "box",
              centre: [c.x + sideX + inward * (plate.thick + stay.offSide + stay.pin / 2) / 2, upper[1],
                       upper[2] + (stay.cabinet.foot - stay.pin / 2) / 2], axes: [X, Y, Z],
              half: [(stay.offSide + stay.pin / 2 - plate.thick) / 2, stay.pin / 2,
                     (stay.cabinet.foot + stay.pin / 2) / 2] },
        );
        b.hardware.push({ ref: stay.ref, qty: 1, item: c.id, itemName: c.name, target: flap.id, purpose: "flap",
                          note: `compas à vérin à gaz ${hand}, équerres fournies, disponibilité sur demande chez Häfele` });
    }
    flap.notes.push(`2 compas à vérin à gaz ${stay.ref} : axes à ${stay.sideUp} et ${stay.flapUp} mm du chant bas de `
        + `l'abattant, à ${stay.sideBehind} et ${stay.flapBehind} mm derrière lui, à ${stay.offSide} mm des joues `
        + "(Häfele MB 5.313, équerres posées à plat). "
        + "Position exacte à la pose : équerres de corps d'abord, équerres d'abattant vissées l'abattant ouvert. "
        + `${stay.maxKg} kg et ${stay.maxHigh} mm de haut au plus pour la paire : essai de butée avant pose`);
}


// The pull-out : a spacer on each side under its runner, its box between the stays
function pullOut(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build, fp: Parameters<typeof buildPullOut>[3],
    front: Parameters<typeof buildPullOut>[4], nb: NodeBox, sides: FaceRef[],
    { loadKg, boxDecor }: { loadKg: number; boxDecor?: string }): void
{
    const board = c.thickness;
    // The setback off the front edge, and behind the struts of the gas stays, flap shut : the box and its spacers ran
    // into them in the clash check of the dresser
    const zFront = Math.min(c.depth - PULL_OUT_SETBACK, fp.z - GAS_STAY.sideBehind - GAS_STAY.strut / 2 -
                            PULL_OUT_CLEAR);
    // Its runners end at the back of its box end, where the couplings screw into that end as into a front
    const runnerFront = zFront - BOX_THICKNESS;
    const runner = chooseRunner(runnerFront - lay.zBack, loadKg);
    if (runner === null)
    {
        b.errors.push(`${c.name}, tiroir intérieur : aucune coulisse MOVENTO pour ${Math.round(runnerFront - lay.zBack)} mm `
            + "de profondeur. Approfondir le caisson.");
        return;
    }
    const [ox, oy, oz] = boxOrigin(c);
    // The underside of the box sides PULL_OUT_CLEAR over the hinge collars, the runner that much lower (Blum : the
    // bottom of the sides bottomAboveLower over the runner, the bottom of the box BOTTOM_RECESS up them), and the
    // spacer centred on the runner screws standing on the floor, not in it
    const low = Math.max(nb.y + FLAP_HINGE.floorCollar[2]![1] + PULL_OUT_CLEAR -
                         (MOVENTO.bottomAboveLower - BOTTOM_RECESS),
                         nb.y + SPACER_HEIGHT / 2 - MOVENTO.screwAxisAboveLower);
    const y0 = low + MOVENTO.screwAxisAboveLower - SPACER_HEIGHT / 2;
    const faces: FaceRef[] = [];
    let screws = 0;
    for (const [k, side] of sides.entries())
    {
        const left = k === 0;
        // Face B looks into the cell on the left, face A on the right : screwed through into what it lies on from there
        const face = left ? "B" as const : "A" as const;
        // 2 layers of the carcass board : with one, the box side stood 8.5 mm into the swing of the strut, the flap
        // open (V1 of the external review)
        let under: FaceRef = side;
        for (let layer = 0; layer < SPACER_LAYERS; layer++)
        {
            const x = left ? nb.x + layer * board : nb.x + nb.w - (layer + 1) * board;
            const tag = `${left ? "L" : "R"}${layer === 0 ? "" : layer + 1}`;
            const name = `Cale de coulisse ${left ? "gauche" : "droite"}${layer === 0 ? "" : `, ${layer +
                1}e épaisseur`}`;
            const spacer = newPart({
                item: c.id, itemName: c.name, thickness: board, decor: c.decor, id: `${c.id}/pull-out/${fp.id}/spacer/${tag}`,
                label: name, role: "cleat", length: SPACER_HEIGHT, width: runner.nl,
                edges: [], frame: { o: [ox + x, oy + y0, oz + runnerFront], u: Y, v: neg([0, 0, 1]), n: X },
            });
            // The second layer's screws a third along from the first's : they would meet head on
            const along = layer === 0 ? [30, runner.nl / 2, runner.nl - 30] : [runner.nl / 4, 3 * runner.nl / 4];
            for (const u of [8, SPACER_HEIGHT - 8])
            {
                for (const v of along)
                {
                    spacer.holes.push({ u, v, diameter: 0, depth: 0, face,
                                       label: `${name} dans ${under.part.label.toLowerCase()} : vis 4 x 30`,
                                        purpose: "spacer-screw" });
                    screws++;
                }
            }
            spacers.set(spacer, under);
            spacer.notes.push(`Bande de ${SPACER_HEIGHT} mm débitée dans le panneau de la caisse : écarte la coulisse du `
                + "compas");
            b.parts.push(spacer);
            under = { part: spacer, face, uOrigin: y0, vOrigin: 0 };
        }
        faces.push(under);
    }
    b.hardware.push({ ref: "SCREW_4x30", qty: screws, item: c.id, itemName: c.name, target: fp.id,
                      note: "cales de coulisse du tiroir intérieur", purpose: "spacer-screw" });
    buildPullOut(c, s, b, fp, front, nb, { loadKg, faces, spacer: SPACER_LAYERS * board, low, zFront, hs: PULL_OUT_SIDE,
                                         runner, boxDecor });
}
