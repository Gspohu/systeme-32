// Drawer boxes on Blum MOVENTO runners : sizing, runnr and TIP-ON choice, drilling (Blum KA-150 p. 418-437)

import type { Carcass, DrawerFront, Front, Settings } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import type { FrontPanel } from "./fronts";
import type { Build, Joint, Part } from "./part_types";
import type { FaceRef } from "./locate";
import { newPart } from "./part_base";
import { spread } from "./fittings";
import { fitJoints } from "./joints";
import { sideFace } from "./locate";
import { box } from "./fitted";
import { meets } from "./drilling";
import { X, Y, Z, neg } from "./geometry";
import { MOVENTO } from "../data/rules";
import { MOVENTO_760H, MOVENTO_766H, TIPON_BLUMOTION_SETS } from "../data/hardware";
import { decorById, materialOfDecor } from "../data/materials";
import { DIAM } from "./text";


// Workshop choices, not Blum values : box side thickness and minimum usable side height
export const BOX_THICKNESS = 16;
const MIN_BOX_HEIGHT = 60;
const BOTTOM_RECESS = 13;
// Ø8 x 35 dowels in 16 mm boards : 10 into a face leaves 6 of it, the holes 3 longer than the dowel for the glue
// (Dictum, 4 x 3 tips for dowelling), the split between face and edge is a workshop convention
const BOX_DOWEL_FACE = 10;
const BOX_DOWEL_EDGE = 28;

export interface RunnerChoice
{
    series: "760H" | "766H";
    nl: number;
    ref: string;
}


// The lighter series that carries the load, or the one the user asked for if it carries it
export function chooseRunner(depthAvailable: number, loadKg: number, asked?: "760H" | "766H"): RunnerChoice | null
{
    const auto = loadKg <= MOVENTO.maxLoad760 ? "760H" : loadKg <= MOVENTO.maxLoad766 ? "766H" : null;
    const max = asked === "760H" ? MOVENTO.maxLoad760 : MOVENTO.maxLoad766;
    const series = asked === undefined ? auto : loadKg <= max ? asked : null;
    if (series === null)
    {
        return null;
    }
    const list = series === "760H" ? MOVENTO_760H : MOVENTO_766H;
    let best: number | null = null;
    for (const nl of list)
    {
        if (nl + MOVENTO.depthMargin <= depthAvailable)
        {
            best = nl;
        }
    }
    if (best === null)
    {
        return null;
    }
    return { series, nl: best, ref: `${series}${String(best * 10).padStart(4, "0")}S` };
}


export function chooseTipOnSet(nl: number, drawerKg: number): string | null
{
    for (const s of TIPON_BLUMOTION_SETS)
    {
        if (nl >= s.nlMin && nl <= s.nlMax && drawerKg >= s.kgMin && drawerKg <= s.kgMax)
        {
            return s.ref;
        }
    }
    return null;
}


export function rearOffsets(r: RunnerChoice): number[]
{
    const table = r.series === "760H" ? MOVENTO.rearOffsets760 : MOVENTO.rearOffsets766;
    for (const g of table)
    {
        if (r.nl <= g.upTo)  
        {
            return g.offsets;
        }
    }
    return [];
}


// One drawer of a front : its slot in the cell, its runner, and the box sizes Blum derives from them
interface DrawerSlot
{
    c: Carcass;
    front: Front;
    spec: DrawerFront;
    nb: NodeBox;
    runner: RunnerChoice;
    fp: FrontPanel;
    index: number;
    name: string;
    tag: string;
    low: number;
    sideBottom: number;
    axis: number;
    hs: number;
    zFront: number;
    SKW: number;
    SKL: number;
}

interface DrawerBox
{
    sideL: Part;
    sideR: Part;
    endF: Part;
    endB: Part;
    bottomP: Part;
}


export function buildDrawers(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    const ordered: FrontPanel[] = [...(b.fronts.get(c.id) ?? [])];
    ordered.sort((a, q) =>
    {
        return a.index - q.index;
    });
    for (const front of c.fronts)
    {
        if (front.spec.type !== "drawers")
        {
            continue;
        }
        const spec: DrawerFront = front.spec;
        const chosen = runnerFor(c, lay, front, spec, b);
        if (chosen === null)
        {
            continue;
        }
        const { nb, runner } = chosen;
        const faces = [sideFace(c, lay, b, nb, "left"), sideFace(c, lay, b, nb, "right")];
        const mine = ordered.filter((p) =>
        {
            return p.front === front.id;
        });
        let slot = 0;
        while (slot < mine.length)
        {
            const fp = mine[slot]!;
            const below = mine[slot - 1];
            const above = mine[slot + 1];
            // slot boundaries : the cell panels for the end drawers, the middle of the front gap otherwise
            const low = below === undefined ? nb.y : (below.rect.y + below.rect.h + fp.rect.y) / 2;
            const high = above === undefined ? nb.y + nb.h : (fp.rect.y + fp.rect.h + above.rect.y) / 2;
            const sideBottom = low + MOVENTO.bottomAboveLower - BOTTOM_RECESS;
            const hs = Math.floor(high - MOVENTO.topBelowUpper - sideBottom);
            if (hs < MIN_BOX_HEIGHT)
            {
                b.errors.push(`${c.name}, tiroir ${fp.number} : ${hs} mm de hauteur de côté disponible, ${MIN_BOX_HEIGHT} mini. `
                    + "Réduire le nombre de tiroirs ou agrandir la case.");
                slot++;
                continue;
            }
            const d: DrawerSlot = {
                c, front, spec, nb, runner, fp, index: slot, name: `Tiroir ${fp.number}`, tag: `${c.id}/drawer/${fp.id}`,
                low, sideBottom, axis: low + MOVENTO.screwAxisAboveLower, hs,
                zFront: front.mount === "inset" ? c.depth - c.thickness : c.depth,
                SKW: nb.w - MOVENTO.innerWidthDeduction, SKL: runner.nl - MOVENTO.lengthDeduction,
            };
            const kit = drawerBox(d, b);
            joinBox(d, kit, s, b);
            screwFront(d, kit, s, b);
            drawerHardware(d, kit, fitRunners(d, kit, faces, b), b);
            slot++;
        }
    }
}


// The cell a drawer front fills and the MOVENTO runner it takes, or why it takes none
function runnerFor(c: Carcass, lay: ResolvedLayout, front: Front, spec: DrawerFront, b: Build):
    { nb: NodeBox; runner: RunnerChoice } | null
{
    const nb = lay.nodes.get(front.node);
    if (nb === undefined)
    {
        return null;
    }
    if (nb.kind !== "cell")
    {
        b.errors.push(`${c.name} : les tiroirs doivent occuper une case sans séparation intérieure.`);
        return null;
    }
    let lined = false;
    for (const l of c.linings)
    {
        lined = lined || l.cell === nb.id;
    }
    if (lined)
    {
        b.errors.push(`${c.name} : une case à tiroirs ne peut pas recevoir d'habillage intérieur.`);
        return null;
    }
    const depthAvail = c.depth - lay.zBack - (front.mount === "inset" ? c.thickness : 0);
    const runner = chooseRunner(depthAvail, spec.loadKg, spec.runner);
    if (runner === null && spec.runner === "760H" && spec.loadKg > MOVENTO.maxLoad760)
    {
        b.errors.push(`${c.name} : ${spec.loadKg} kg par tiroir pour des coulisses MOVENTO de `
            + `${MOVENTO.maxLoad760} kg (Blum p. 418). Choisir les coulisses 60/70 kg ou le choix automatique.`);
        return null;
    }
    if (runner === null && spec.loadKg > MOVENTO.maxLoad766)
    {
        b.errors.push(`${c.name} : ${spec.loadKg} kg par tiroir, ${MOVENTO.maxLoad766} kg maxi pour les coulisses `
            + "MOVENTO (Blum p. 418). Réduire la charge.");
        return null;
    }
    if (runner === null)
    {
        // the shortest runner of the series that would carry the load, read off the catalogue list
        const series = spec.runner ?? (spec.loadKg <= MOVENTO.maxLoad760 ? "760H" : "766H");
        const shortest = (series === "760H" ? MOVENTO_760H : MOVENTO_766H)[0]!;
        const lighter = series === "766H" && spec.loadKg <= MOVENTO.maxLoad760;
        b.errors.push(`${c.name} : aucune coulisse MOVENTO ${series} pour ${Math.round(depthAvail)} mm de profondeur `
            + `utile, la plus courte (NL ${shortest}) en demande ${shortest + MOVENTO.depthMargin}. Approfondir le `
            + `caisson${lighter ? ` ou choisir les coulisses ${MOVENTO.maxLoad760} kg (NL ${MOVENTO_760H[0]} mini)` : ""}.`);
        return null;
    }
    return { nb, runner };
}


// The five boards of the box, its sides on the runners and its bottom 13 up in grooves of glue and dowels
function drawerBox(d: DrawerSlot, b: Build): DrawerBox
{
    const { c, nb, name, tag, sideBottom, hs, zFront, SKW, SKL } = d;
    const [ox, oy, oz] = [c.x, c.y, c.z];
    const xl = nb.x + MOVENTO.sideInset - BOX_THICKNESS;
    const xIn = ox + xl + BOX_THICKNESS;
    const common = { item: c.id, itemName: c.name, decor: c.decor, thickness: BOX_THICKNESS };
    const sideL = newPart({
        ...common, id: `${tag}/sideL`, label: `${name}, côté gauche`, role: "boxSide",
        length: SKL, width: hs, edges: ["v1"],
        frame: { o: [xIn, oy + sideBottom, oz + zFront], u: neg(Z), v: Y, n: neg(X) },
    });
    const sideR = newPart({
        ...common, id: `${tag}/sideR`, label: `${name}, côté droit`, role: "boxSide",
        length: SKL, width: hs, edges: ["v1"],
        frame: { o: [xIn + SKW, oy + sideBottom, oz + zFront], u: neg(Z), v: Y, n: X },
    });
    const endF = newPart({
        ...common, id: `${tag}/endF`, label: `${name}, avant de caisson`, role: "boxEnd",
        length: SKW, width: hs, edges: ["v1"],
        frame: { o: [xIn, oy + sideBottom, oz + zFront - BOX_THICKNESS], u: X, v: Y, n: Z },
    });
    const endB = newPart({
        ...common, id: `${tag}/endB`, label: `${name}, arrière de caisson`, role: "boxEnd",
        length: SKW, width: hs, edges: ["v1"],
        frame: { o: [xIn, oy + sideBottom, oz + zFront - SKL + BOX_THICKNESS], u: X, v: Y, n: neg(Z) },
    });
    const bottomP = newPart({
        ...common, id: `${tag}/bottom`, label: `${name}, fond`, role: "boxBottom",
        length: SKW, width: SKL - 2 * BOX_THICKNESS, edges: [],
        frame: { o: [xIn, oy + sideBottom + BOTTOM_RECESS + BOX_THICKNESS, oz + zFront - BOX_THICKNESS],
                 u: X, v: neg(Z), n: neg(Y) },
    });
    // rear hook hole in the back end of each side : 6 dia, 10 deep, 7 from the outer face, 11 up
    for (const sp of [sideL, sideR])
    {
        sp.holes.push({
            u: SKL, v: MOVENTO.backHole.fromBottom, diameter: MOVENTO.backHole.diameter,
            depth: MOVENTO.backHole.depth, face: "u1", w: BOX_THICKNESS - MOVENTO.backHole.fromSide,
            label: "Crochet arrière MOVENTO (gabarit T65.1000.02)", purpose: "runner-hook",
        });
    }
    sideL.notes.push(`Côtés ${BOX_THICKNESS} mm maxi (Blum). Largeur intérieure SKW = LW - 42 = ${SKW} (+0 / -1,5)`);
    if (d.spec.cutlery?.[d.index] === true)
    {
        bottomP.notes.push("Range-couverts : insert à façonner (ORGA-LINE n'existe que pour TANDEMBOX)");
    }
    b.parts.push(sideL, sideR, endF, endB, bottomP);
    return { sideL, sideR, endF, endB, bottomP };
}


// the box glued on dowels into the inner faces of its sides : both ends, then the bottom on its line
// 13 up. Front and back edges of the bottom stay free, two sides hold it
function joinBox(d: DrawerSlot, k: DrawerBox, s: Settings, b: Build): void
{
    const { c, hs, SKL } = d;
    const T = BOX_THICKNESS;
    const joints: Joint[] = [];
    for (const [end, line] of [[k.endF, T / 2], [k.endB, SKL - T / 2]] as const)
    {
        joints.push({ edgePart: end.id, edge: "u0", facePart: k.sideL.id, face: "A", lineAxis: "u", line,
                      from: 0, to: hs, edgeFrom: 0, reversed: false },
                    { edgePart: end.id, edge: "u1", facePart: k.sideR.id, face: "A", lineAxis: "u", line,
                      from: 0, to: hs, edgeFrom: 0, reversed: false });
    }
    for (const [edge, side] of [["u0", k.sideL], ["u1", k.sideR]] as const)
    {
        joints.push({ edgePart: k.bottomP.id, edge, facePart: side.id, face: "A", lineAxis: "v",
                      line: BOTTOM_RECESS + T / 2, from: T, to: SKL - T, edgeFrom: 0, reversed: false });
    }
    fitJoints(joints, { ...s, joinery: "dowel", dowelFaceDepth: BOX_DOWEL_FACE, dowelEdgeDepth: BOX_DOWEL_EDGE },
              b, c.id, c.name, false);
}


// the front set in place then screwed from inside the box, two rows clear of a handle at mid height
function screwFront(d: DrawerSlot, k: DrawerBox, s: Settings, b: Build): void
{
    const { c, fp, hs, SKW } = d;
    let screws = 0;
    for (const u of spread(SKW, s.connectorInset, 256))
    {
        for (const v of [hs / 4, 3 * hs / 4])
        {
            k.endF.holes.push({ u, v, diameter: 0, depth: 0, face: "A", label: "Vis 4 x 30 dans la façade",
                                purpose: "front-screw" });
            screws++;
        }
    }
    b.hardware.push({ ref: "SCREW_4x30", qty: screws, item: c.id, itemName: c.name, target: fp.id,
                     note: "façade réglée puis vissée depuis le caisson", purpose: "front-screw" });
    b.parts.find((q) =>
    {
        return q.id === `${c.id}/front/${fp.id}`;
    })?.notes.push(`Vissée depuis l'avant du caisson, ${screws} vis 4 x 30 sans pré-perçage`);
}


// How the drawer pulls out, the space Blum keeps for its runners and their screws in the faces bounding the
// cell : the number of screw places on each face
function fitRunners(d: DrawerSlot, k: DrawerBox, faces: (FaceRef | null)[], b: Build): number
{
    const { c, front, nb, runner, fp, name, tag, low, sideBottom, axis, zFront } = d;
    const [ox, oy, oz] = [c.x, c.y, c.z];
    // MOVENTO pulls out over its whole nominal length, the front and its box together
    b.motions.push({
        item: c.id, front: fp.id, label: `${c.name}, ${name.toLowerCase()}`, kind: "slide", pivot: [0, 0, 0],
        axis: Z, amount: runner.nl,
        parts: [`${c.id}/front/${fp.id}`, k.sideL.id, k.sideR.id, k.endF.id, k.endB.id,
                k.bottomP.id], fitted: [], rides: [],
        source: `coulisses ${runner.ref} sorties de ${runner.nl} mm`,
        remedy: "Déplacer ce qui gêne ou réduire la profondeur du tiroir.",
    });
    // the space Blum reserves for each runner (p. 419) : 21 against the cell side, under the drawer side
    // over NL from the front of the box
    // TODO the runner profile itself is not dimensionned on p. 419, only the space it takes
    const zs: [number, number] = [oz + zFront - runner.nl, oz + zFront];
    for (const [side, x0] of [["gauche", ox + nb.x], ["droite", ox + nb.x + nb.w - MOVENTO.sideInset]] as const)
    {
        b.fitted.push(box(`${tag}/coulisse-${side}`, c.id, runner.ref, `${name}, coulisse ${side}`, "runner",
                          [x0, oy + low, zs[0]], [x0 + MOVENTO.sideInset, oy + sideBottom, zs[1]], true));
    }

    // runner screws on both faces bounding the cell
    const offs = [...MOVENTO.frontHoles];
    for (const o of rearOffsets(runner))
    {
        offs.push(37 + o);
    }
    const shift = front.mount === "inset" ? c.thickness : 0;
    for (const fr of faces)
    {
        if (fr === null)
        {
            b.errors.push(`${c.name} : face de fixation des coulisses introuvable pour le tiroir ${fp.number}.`);
            continue;
        }
        const u = axis - fr.uOrigin;   
        const hits = (set: number[]): boolean =>
        {
            return set.some((o) =>
            {
                return meets(fr.part, fr.face, u, o + shift, 4, 15);
            }); 
        };
        let set = offs;
        if (hits(offs))
        {
            // a runner already screwed on the other face of a mid panel, at the asme heigth
            const known = runner.series === "760H" && offs.every((o) =>
            {
                return MOVENTO.alternateKnown760.includes(o);
            });   
            set = known ? offs.map((o) =>
            {
                return o + MOVENTO.alternateStep760;  
            }) : offs;
            if (!known || hits(set))
            {
                b.errors.push(`${c.name}, ${fr.part.label} : les vis de la coulisse ${runner.ref} du tiroir ${fp.number} `
                    + "rencontrent celles de l'autre face. Décaler un des tiroirs en hauteur ou épaissir le montant.");   
            }
            else
            {
                fr.part.notes.push(`Coulisse ${runner.ref} du tiroir ${fp.number} : vissée dans les deuxièmes trous `
                    + `du profil, ${MOVENTO.alternateStep760} mm en arrière des positions du catalogue, l'autre face `  
                    + "portant déjà des vis à cette hauteur");  
            }
        }
        for (const o of set)
        {  
            fr.part.holes.push({ u, v: o + shift, diameter: 0, depth: 0, face: fr.face,
                                label: `Coulisse ${runner.ref} : vis ${DIAM}3,5 x 15 (609.1500)`,
                                purpose: "runner-screw", fixes: runner.ref });
        }
        if (MOVENTO.undimensionedRearHole(runner.series, runner.nl))
        {
            fr.part.notes.push(`Coulisse ${runner.ref} : une vis arrière supplémentaire non cotée au catalogue `
                + "(Blum p. 419)");
        }
    }
    return offs.length;
}


// The drawer's own weight with its load, its runner, coupling and screw lines, and a TIP-ON BLUMOTION set
function drawerHardware(d: DrawerSlot, k: DrawerBox, screwPlaces: number, b: Build): void
{
    const { c, front, spec, nb, runner, fp } = d;
    const LW = nb.w;
    const mat = materialOfDecor(decorById(c.decor));
    let boxKg = 0;
    for (const p of [k.sideL, k.sideR, k.endF, k.endB, k.bottomP])
    {
        boxKg += p.length * p.width * p.thickness * 1e-9 * mat.density;
    }
    const frontKg = fp.rect.w * fp.rect.h * fp.thickness * 1e-9 * materialOfDecor(decorById(fp.decor)).density;
    const drawerKg = boxKg + frontKg + spec.loadKg;
    b.hardware.push({ ref: runner.ref, qty: 1, item: c.id, itemName: c.name, target: fp.id,
                     note: "paire gauche/droite", purpose: "runner" });
    b.hardware.push({ ref: "T51.7601", qty: 1, item: c.id, itemName: c.name, target: fp.id,
                     note: "paire d'accouplements", purpose: "runner-coupling" });
    b.hardware.push({ ref: "609.1500", qty: 2 * screwPlaces, item: c.id, itemName: c.name, target: fp.id,
                     note: "fixation des coulisses", purpose: "runner-screw" });
    if (front.opening !== "push")
    {
        return;
    }
    if (runner.nl < 270)
    {
        b.errors.push(`${c.name}, tiroir ${fp.number} : TIP-ON BLUMOTION exige NL 270 mini (NL ${runner.nl}).`);
    }
    const set = chooseTipOnSet(runner.nl, drawerKg);
    if (set === null)
    {
        b.errors.push(`${c.name}, tiroir ${fp.number} : pas de set TIP-ON BLUMOTION pour NL ${runner.nl} `
            + `et ${drawerKg.toFixed(1)} kg.`);
    }
    else
    {
        b.hardware.push({ ref: set, qty: 1, item: c.id, itemName: c.name,
                         target: fp.id, note: `tiroir de ${drawerKg.toFixed(1)} kg chargé`, purpose: "push-latch" });
    }
    if (LW >= 265 && LW <= 313)
    {
        b.hardware.push({ ref: "T60.300D", qty: 1, item: c.id, itemName: c.name, target: fp.id,
                         note: `à recouper à ${Math.round(LW - 241)} mm`, purpose: "push-latch" });
    }
    else if (LW >= 314)
    {
        b.hardware.push({ ref: "T60.000D", qty: 2, item: c.id, itemName: c.name, target: fp.id,
                         note: "tringle de synchronisation : voir Blum p. 436", purpose: "push-latch" });
    }
    k.endB.notes.push("TIP-ON BLUMOTION : dégagement de 125 mm à l'arrière du tiroir");
}
