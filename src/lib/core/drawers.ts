// Drawer boxes on Blum MOVENTO runners : sizing, runnr and TIP-ON choice, drilling (Blum KA-150 p. 418-437)

import type { Carcass, DrawerFront } from "./model";
import type { ResolvedLayout } from "./layout";
import type { FrontPanel } from "./fronts";
import { type Build, newPart } from "./parts";
import { sideFace } from "./locate";
import { X, Y, Z, neg } from "./geometry";
import { MOVENTO } from "../data/rules";
import { MOVENTO_760H, MOVENTO_766H, TIPON_BLUMOTION_SETS } from "../data/hardware";
import { decorById, materialOfDecor } from "../data/materials";
import { DIAM } from "./text";


// Workshop choices, not Blum values : box side thickness and minimum usable side height
export const BOX_THICKNESS = 16;
const MIN_BOX_HEIGHT = 60;
const BOTTOM_RECESS = 13;

export interface RunnerChoice
{
    series: "760H" | "766H";
    nl: number;
    ref: string;
}


export function chooseRunner(depthAvailable: number, loadKg: number): RunnerChoice | null
{
    const series = loadKg <= MOVENTO.maxLoad760 ? "760H" : loadKg <= MOVENTO.maxLoad766 ? "766H" : null;
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


export function buildDrawers(c: Carcass, lay: ResolvedLayout, b: Build): void
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
        const nb = lay.nodes.get(front.node);
        if (nb === undefined)
        {
            continue;
        }
        if (nb.kind !== "cell")
        {
            b.errors.push(`${c.name} : les tiroirs doivent occuper une case sans séparation intérieure.`);
            continue;
        }
        let lined = false;
        for (const l of c.linings)
        {
            lined = lined || l.cell === nb.id;
        }
        if (lined)
        {
            b.errors.push(`${c.name} : une case à tiroirs ne peut pas recevoir d'habillage intérieur.`);
            continue;
        }
        const ft = c.thickness;
        const depthAvail = c.depth - lay.zBack - (front.mount === "inset" ? ft : 0);
        const runner = chooseRunner(depthAvail, spec.loadKg);
        if (runner === null)
        {
            b.errors.push(`${c.name} : aucune coulisse MOVENTO pour ${Math.round(depthAvail)} mm de profondeur utile et `
                + `${spec.loadKg} kg. Augmenter la profondeur (NL mini 250 + 3) ou réduire la charge (70 kg maxi).`);
            continue;
        }
        const leftFace = sideFace(c, lay, b, nb, "left");
        const rightFace = sideFace(c, lay, b, nb, "right");
        const LW = nb.w;
        const SKW = LW - MOVENTO.innerWidthDeduction;
        const SKL = runner.nl - MOVENTO.lengthDeduction;
        const mine: FrontPanel[] = [];
        for (const p of ordered)
        {
            if (p.front === front.id)
            {
                mine.push(p);
            }
        }
        const zFront = front.mount === "inset" ? c.depth - ft : c.depth;
        const mat = materialOfDecor(decorById(c.decor));
        let slot = 0;
        while (slot < mine.length)
        {
            const fp = mine[slot]!;
            const below = mine[slot - 1];
            const above = mine[slot + 1];
            const name = `Tiroir ${slot + 1}`;
            // slot boundaries : the cell panels for the end drawers, the middle of the front gap otherwise
            const low = below === undefined ? nb.y : (below.rect.y + below.rect.h + fp.rect.y) / 2;
            const high = above === undefined ? nb.y + nb.h : (fp.rect.y + fp.rect.h + above.rect.y) / 2;
            const sideBottom = low + MOVENTO.bottomAboveLower - BOTTOM_RECESS;
            const axis = low + MOVENTO.screwAxisAboveLower;
            const hs = Math.floor(high - MOVENTO.topBelowUpper - sideBottom);
            const tag = `${c.id}/drawer/${fp.id}`;
            if (hs < MIN_BOX_HEIGHT)
            {
                b.errors.push(`${c.name}, tiroir ${slot + 1} : ${hs} mm de hauteur de côté disponible, ${MIN_BOX_HEIGHT} mini. `
                    + "Réduire le nombre de tiroirs ou agrandir la case.");
                slot++;
                continue;
            }
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
                    label: "Crochet arrière MOVENTO (gabarit T65.1000.02)",
                });
            }
            sideL.notes.push(`Côtés ${BOX_THICKNESS} mm maxi (Blum). Largeur intérieure SKW = LW - 42 = ${SKW} (+0 / -1,5)`);
            if (spec.cutlery?.[slot] === true)
            {
                bottomP.notes.push("Range-couverts : insert à façonner (ORGA-LINE n'existe que pour TANDEMBOX)");
            }
            b.parts.push(sideL, sideR, endF, endB, bottomP);

            // runner screws on both faces bounding the cell
            const offs = [...MOVENTO.frontHoles];
            for (const o of rearOffsets(runner))
            {
                offs.push(37 + o);
            }
            const shift = front.mount === "inset" ? ft : 0;
            for (const fr of [leftFace, rightFace])
            {
                if (fr === null)
                {
                    b.errors.push(`${c.name} : face de fixation des coulisses introuvable pour le tiroir ${slot + 1}.`);
                    continue;
                }
                for (const o of offs)  
                {
                    fr.part.holes.push({ u: axis - fr.uOrigin, v: o + shift, diameter: 0, depth: 0, face: fr.face,
                                        label: `Coulisse ${runner.ref} : vis ${DIAM}3,5 x 15 (609.1500)` });
                }
                if (MOVENTO.undimensionedRearHole(runner.series, runner.nl))
                {
                    fr.part.notes.push(`Coulisse ${runner.ref} : une vis arrière supplémentaire non cotée au catalogue `
                        + "(Blum p. 419)");
                }
            }


            let boxKg = 0;
            for (const p of [sideL, sideR, endF, endB, bottomP])
            {
                boxKg += p.length * p.width * p.thickness * 1e-9 * mat.density;
            }
            const frontKg = fp.rect.w * fp.rect.h * fp.thickness * 1e-9 * materialOfDecor(decorById(fp.decor)).density;
            const drawerKg = boxKg + frontKg + spec.loadKg;
            b.hardware.push({ ref: runner.ref, qty: 1, item: c.id, itemName: c.name, target: fp.id,
                             note: "paire gauche/droite" });
            b.hardware.push({ ref: "T51.7601", qty: 1, item: c.id, itemName: c.name, target: fp.id,
                             note: "paire d'accouplements" });
            b.hardware.push({ ref: "609.1500", qty: 2 * offs.length, item: c.id, itemName: c.name, target: fp.id,
                             note: "fixation des coulisses" });
            if (front.opening === "push")
            {
                if (runner.nl < 270)
                {
                    b.errors.push(`${c.name}, tiroir ${slot + 1} : TIP-ON BLUMOTION exige NL 270 mini (NL ${runner.nl}).`);
                }
                const set = chooseTipOnSet(runner.nl, drawerKg);
                if (set === null)
                {
                    b.errors.push(`${c.name}, tiroir ${slot + 1} : pas de set TIP-ON BLUMOTION pour NL ${runner.nl} `
                        + `et ${drawerKg.toFixed(1)} kg.`);
                }
                else
                {
                    b.hardware.push({ ref: set, qty: 1, item: c.id, itemName: c.name,
                                     target: fp.id, note: `tiroir de ${drawerKg.toFixed(1)} kg chargé` });
                }
                if (LW >= 265 && LW <= 313)
                {
                    b.hardware.push({ ref: "T60.300D", qty: 1, item: c.id, itemName: c.name, target: fp.id,
                                     note: `à recouper à ${Math.round(LW - 241)} mm` });
                }
                else if (LW >= 314)
                {
                    b.hardware.push({ ref: "T60.000D", qty: 2, item: c.id, itemName: c.name, target: fp.id,
                                     note: "tringle de synchronisation : voir Blum p. 436" });
                }
                endB.notes.push("TIP-ON BLUMOTION : dégagement de 125 mm à l'arrière du tiroir");
            }
            slot++;
        }
    }
}
