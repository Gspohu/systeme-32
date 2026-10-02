// Full analysis of a project : parts, hardware, masses and every manufacturing check

import type { Carcass, Item, Project } from "./model";
import { type Build, buildCarcass, emptyBuild } from "./parts";
import { buildBox, buildWallShelf } from "./hung_items";
import { buildCorner, buildEnds, buildLinings } from "./curves";
import { buildDrawers } from "./drawers";
import { antiTipPositions, fitBase, fitJoints, fitModularRows, fitShelfPins, fitSliding, fitWallFixing,
    partMass } from "./fittings";
import { fitDoors } from "./doors";
import { fitLifts, liftChecks } from "./lifts";
import { cornerChecks } from "./corner";
import { fitPanels } from "./cutouts";
import { buildShoeRacks } from "./shoes";
import { fitVentGrills } from "./vents";
import { buildLadder, ladderChecks } from "./ladder";
import { buildCeilingFiller, ceilingChecks } from "./ceiling";
import { deskChecks } from "./desk";
import { itemMass, shelfDeflection, tipping, topDrawerExtension, type Deflection, type Tipping } from "./mechanics";
import { frontFootInset } from "./feet";
import { solidChecks } from "./solid_checks";
import { letInFittings } from "./fitted";
import { findNode, subtreeIds } from "./layout";
import { screenSize } from "./extent";
import { boxesMeet, roomBox, type Box3 } from "./room";
import { buildSlats } from "./slats";
import { SEAT_LOAD_N, seatChecks } from "./seat";
import { slopeErrors } from "./slope";
import { buildLights, buildRails, packRailBars, wardrobeChecks } from "./wardrobe";
import { bounds, tessellate } from "./geometry";
import { MATERIALS, SHEET_LENGTH, SHEET_WIDTH } from "../data/materials";
import { GRAVITY, SHELF_DEFLECTION_LIMIT } from "../data/rules";


export type Level = "error" | "warning" | "info";

export interface Check
{
    level: Level;
    item: string | null;
    target: string | null;
    message: string;
}

export interface Analysis
{
    build: Build;
    checks: Check[];
    masses: Map<string, number>;
    deflections: Deflection[];  
    tippings: Tipping[];
}


function buildItem(it: Item, p: Project, b: Build, loads: Map<string, number>): void
{
    const s = p.settings;
    if (it.kind === "carcass")
    {
        const before = b.joints.length;
        buildCarcass(it, s, b);
        fitVentGrills(it, b);
        const lay = b.layouts.get(it.id)!;
        b.errors.push(...slopeErrors(it, lay, b.fronts.get(it.id) ?? []));
        buildLinings(it, lay, b);
        buildEnds(it, b);
        buildDrawers(it, lay, b);
        fitDoors(it, lay, s, b);
        fitLifts(it, lay, b);
        fitPanels(it, b);
        fitSliding(it, lay, s, b);
        fitShelfPins(it, lay, s, b);
        fitModularRows(it, lay, s, b);
        const clothes = buildRails(it, lay, b);
        buildLights(it, lay, s, b);
        buildShoeRacks(it, lay, b);
        fitJoints(b.joints.slice(before), s, b, it.id, it.name);
        let content = 0;
        for (const f of it.fronts)
        {
            if (f.spec.type === "drawers")
            {
                content += f.spec.loadKg * f.spec.count;
            }
        }
        let shelves = 0;
        for (const q of b.parts)
        {
            if (q.item === it.id && (q.role === "shelf" || q.role === "hdivider" || q.role === "bottom"))
            {
                shelves += q.length * q.width * 1e-4 * s.shelfLoad;
            }
        }
        // a person sat on it weighs on the feet like any load
        const person = it.seat === null ? 0 : SEAT_LOAD_N / GRAVITY;
        loads.set(it.id, content + shelves + person + clothes);
        fitBase(it, itemMass(b, it.id) + content + shelves + person + clothes, b);
        fitWallFixing(it, s, b);
        buildCeilingFiller(it, p.room, b);
    }
    else if (it.kind === "corner")
    {
        buildCorner(it, b);
    }
    else if (it.kind === "wallShelf")
    {
        buildWallShelf(it, b);
    }
    else if (it.kind === "slats")
    {
        buildSlats(it, s, b);
    }
    else if (it.kind === "ladder")
    {
        buildLadder(it, b);
    }
    else
    {
        const before = b.joints.length;
        buildBox(it, b);
        fitJoints(b.joints.slice(before), s, b, it.id, it.name);
        b.hardware.push({ ref: "48N0510.02", qty: 1, item: it.id, itemName: it.name, target: null, note: null });
        b.hardware.push({ ref: "48N0510.03", qty: 1, item: it.id, itemName: it.name, target: null, note: null });
    }
}


export function analyse(p: Project): Analysis
{
    const b = emptyBuild();
    const loads = new Map<string, number>();
    const checks: Check[] = [];
    for (const it of p.items)
    {
        let k = b.errors.length;
        try
        {
            buildItem(it, p, b, loads);
        }
        catch (e)
        {
            b.errors.push(`${it.name} : ${(e as Error).message}`);
        }
        while (k < b.errors.length)
        {
            checks.push({ level: "error", item: it.id, target: null, message: b.errors[k]! });
            k++;
        }
    }
    packRailBars(b);
    b.fitted.push(...letInFittings(b.parts));
    const masses = new Map<string, number>();
    for (const it of p.items)
    {
        masses.set(it.id, itemMass(b, it.id));
    }
    const partReport = partChecks(p, b);
    checks.push(...partReport.checks, ...frontChecks(p), ...itemChecks(p, masses, loads));
    const tippings: Tipping[] = [];
    for (const it of p.items)
    {
        if (it.kind !== "carcass")
        {
            continue;
        }
        const tp = tipping(it, b, frontFootInset(it), topDrawerExtension(it));
        if (tp !== null)
        {
            tippings.push(tp);
            const fixed = it.fixToWall && it.base.type !== "wall";
            const verdict = fixed
                ? `Retenu par ${antiTipPositions(it.width).length} équerre(s) anti-basculement fixées au mur.`
                : "Aucune fixation murale : cocher Fixation murale anti-basculement sur le caisson.";
            checks.push({
                level: "info", item: it.id, target: null,
                message: `${it.name} : basculement sous ${tp.pullKg.toFixed(1)} kg tirés horizontalement en haut, `
                    + `ou ${tp.criticalKg.toFixed(0)} kg posés sur le ${tp.leverFrom} (calcul statique à vide, `
                    + `pas un essai EN 14749:2016+A1:2022). ${verdict}`,
            });
        }
    }
    if (p.settings.wallType === "plasterboard" && anchored(p))
    {
        checks.push({ level: "warning", item: null, target: null,
                      message: "Équerres anti-basculement sur plaque de plâtre : la tenue dépend de la cheville et "
                          + "de la plaque. Vérifier la charge admise par la cheville choisie." });
    }
    checks.push(...seatChecks(p, b), ...screenChecks(p), ...wardrobeChecks(p, b), ...liftChecks(p, b),
                ...cornerChecks(p, b), ...ceilingChecks(p), ...deskChecks(p), ...ladderChecks(p), ...solidChecks(p, b));
    return { build: b, checks, masses, deflections: partReport.deflections, tippings };
}


function anchored(p: Project): boolean
{
    for (const it of p.items)
    {
        if (it.kind === "carcass" && it.fixToWall && it.base.type !== "wall")
        {
            return true;
        }
    }
    return false;
}


function partChecks(p: Project, b: Build): { checks: Check[]; deflections: Deflection[] }
{
    const checks: Check[] = [];
    const deflections: Deflection[] = [];
    const s = p.settings;
    const maxL = SHEET_LENGTH - 2 * s.trim;
    const maxW = SHEET_WIDTH - 2 * s.trim;
    // one warning per item and unverified thickness, not one per part
    const unverified = new Map<string, { item: string; itemName: string; label: string; thickness: number; count: number }>();
    for (const part of b.parts)
    {
        if (part.role === "batten" || part.role === "skin")
        {
            continue;
        }
        const name = `${part.itemName}, ${part.label.toLowerCase()}`;
        const bb = bounds(tessellate(part.outline));
        const L = bb.maxX - bb.minX;
        const W = bb.maxY - bb.minY;
        const fits = part.grain ? L <= maxL && W <= maxW : (L <= maxL && W <= maxW) || (W <= maxL && L <= maxW);
        if (part.material === "glass")
        {
            checks.push({ level: "warning", item: part.item, target: part.id,
                          message: `${name} : flèche calculée, mais pas la résistance du verre (norme de calcul non consultée). `
                              + "Faire valider l'épaisseur et la charge par le miroitier." });
        }
        else if (!fits)
        {
            checks.push({ level: "error", item: part.item, target: part.id,
                          message: `${name} : ${Math.round(L)} x ${Math.round(W)} mm ne tient pas dans un panneau `
                              + `${SHEET_LENGTH} x ${SHEET_WIDTH} délignés (sens du fil respecté). Scinder la pièce.` });
        }
        const mat = MATERIALS[part.material];
        if (mat !== undefined && !mat.thicknesses.includes(part.thickness))
        {
            const key = `${part.item}|${mat.id}|${part.thickness}`;
            const u = unverified.get(key) ?? { item: part.item, itemName: part.itemName, label: mat.label,
                                              thickness: part.thickness, count: 0 };
            u.count += part.quantity;
            unverified.set(key, u);
        }
        const kg = partMass(part, false) / part.quantity;
        if (kg > s.handlingKg)
        {
            const people = Math.ceil(kg / s.handlingKg);
            checks.push({ level: "warning", item: part.item, target: part.id,
                          message: `${name} : ${kg.toFixed(1)} kg, à manutentionner à ${people} personnes `
                              + `(limite ${s.handlingKg} kg, R4541-9).` });
        }
        const hung = b.midLoads.get(part.id) ?? 0;
        // a top is only checked for what a rail hangs from it, never for the shelf load
        const top = part.role === "top";
        if (part.role !== "shelf" && part.role !== "hdivider" && part.role !== "wallShelf" && !(top && hung > 0))
        {
            continue;
        }  
        const d = shelfDeflection(part, top ? 0 : s.shelfLoad, hung);
        if (d === null)
        {
            continue;
        }
        deflections.push(d);
        if (d.instant > d.limit)
        {
            const rail = hung > 0 ? `${Math.round(hung)} N du support de tringle` : "";
            const load = top ? `${rail} et son poids` : `${s.shelfLoad} kg/dm²${rail === "" ? "" : ` et ${rail}`}`;
            // the standard sets no limit for a top, the one of the selves is borrowed
            const origin = top ? "limite des tablettes d'EN 16122:2012 reprise par convention" : "UNI 11663 / EN 16122:2012";
            checks.push({ level: "error", item: part.item, target: part.id,
                          message: `${name} : flèche ${d.instant.toFixed(1)} mm sous ${load}, `
                              + `${d.limit.toFixed(1)} mm maxi (${SHELF_DEFLECTION_LIMIT * 100} % de la portée, ${origin}). `
                              + "Réduire la portée ou ajouter un montant." });
        }
        else if (d.final > d.limit)
        {
            // the 0.5 % limit applies to the test deflection, the creep figure is information only
            checks.push({ level: "info", item: part.item, target: part.id,
                          message: `${name} : flèche ${d.instant.toFixed(1)} mm à l'essai (conforme), environ `
                              + `${d.final.toFixed(1)} mm à long terme avec le fluage (kdef `
                              + `${MATERIALS[part.material]!.kdef} en classe de service 1, EN 1995-1-1:2004). `
                              + "Aucune limite normative sur ce chiffre." });
        }
    }
    for (const u of unverified.values())
    {
        checks.push({ level: "warning", item: u.item, target: null,
                      message: `${u.itemName} : ${u.count} pièce(s) en ${u.thickness} mm, épaisseur non vérifiée pour `
                          + `${u.label}. Confirmer la disponibilité chez le fournisseur.` });
    }
    return { checks, deflections };
}


function frontChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    for (const it of p.items)
    {
        if (it.kind !== "carcass")
        {
            continue;
        }
        const seen = new Set<string>();
        for (const f of it.fronts)
        {
            if (seen.has(f.node))
            {
                checks.push({ level: "error", item: it.id, target: f.id,
                              message: `${it.name} : deux façades sur la même zone. En retirer une.` });
            }
            seen.add(f.node);
        }
        for (const f of it.fronts)
        {
            const node = findNode(it.root, f.node);
            if (node === null)
            {
                checks.push({ level: "error", item: it.id, target: f.id,   
                              message: `${it.name} : façade rattachée à une zone supprimée. La déplacer ou la retirer.` });
                continue;
            }
            const inside = new Set(subtreeIds(node));
            inside.delete(f.node);
            for (const g of it.fronts)
            {
                if (g.id !== f.id && inside.has(g.node))
                {
                    checks.push({ level: "error", item: it.id, target: g.id,
                                  message: `${it.name} : une façade en recouvre une autre. Retirer celle de la zone `
                                      + "intérieure ou celle qui l'englobe." });
                }
            }
        }
    }
    return checks;
}



function itemChecks(p: Project, masses: Map<string, number>, loads: Map<string, number>): Check[]
{
    const checks: Check[] = [];
    const boxes: { it: Item; box: Box3 }[] = [];
    for (const it of p.items)
    {
        boxes.push({ it, box: roomBox(it, p.room) });
    }
    let i = 0;
    while (i < boxes.length)
    {
        let j = i + 1;
        while (j < boxes.length)
        {
            const a = boxes[i]!;
            const c = boxes[j]!;
            // a round corner is meant to sit in the notch between the boxes it joins
            if (a.it.kind !== "corner" && c.it.kind !== "corner" && boxesMeet(a.box, c.box))
            {
                checks.push({ level: "error", item: c.it.id, target: null,
                              message: `${a.it.name} et ${c.it.name} se chevauchent. Déplacer l'un des deux.` });
            }
            j++;
        }
        i++;
    }
    for (const { it } of boxes)
    {
        const m = masses.get(it.id) ?? 0;
        const load = loads.get(it.id) ?? 0;
        const loaded = load > 0 ? `, ${(m + load).toFixed(0)} kg chargé (charges d'essai)` : "";
        checks.push({ level: "info", item: it.id, target: null,
                     message: `${it.name} : ${m.toFixed(1)} kg à vide${loaded}.` });
        if (it.kind === "wallShelf")
        {
            const text = it.purpose === "desk"
                ? "appuis non vérifiés, le poser sur des caissons ou choisir une fixation avec l'ébéniste."
                : "fixation invisible non encore sourcée, à choisir avec l'ébéniste selon le support mural.";
            checks.push({ level: "warning", item: it.id, target: null, message: `${it.name} : ${text}` });
        }
    }
    return checks;
}


function screenChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    const sc = p.screen;
    if (sc === null)
    {
        return checks;
    }
    const { w, h } = screenSize(sc);
    const rect = { x0: sc.cx - w / 2, x1: sc.cx + w / 2, y0: sc.bottom, y1: sc.bottom + h };
    let support = false;
    for (const it of p.items)
    {
        const bx = roomBox(it, p.room);
        const hit = rect.x0 < bx.max[0] && rect.x1 > bx.min[0] && rect.y0 < bx.max[1] - 0.5 && rect.y1 > bx.min[1] + 0.5
            && bx.max[2] > sc.z;
        if (hit)
        {
            checks.push({ level: "error", item: it.id, target: null,
                          message: `L'écran ${sc.diagonalInch}" (${Math.round(w)} x ${Math.round(h)} mm) touche ${it.name}. `
                              + "Réduire la diagonale ou élargir la niche." });
        }
        support = support || (Math.abs(bx.max[1] - sc.bottom) < 1 && bx.min[0] <= sc.cx && bx.max[0] >= sc.cx);
    }   
    if (!sc.wallMounted && !support && sc.bottom > 0.5)
    {
        checks.push({ level: "warning", item: null, target: null,
                      message: "L'écran n'est posé sur aucun meuble. Le poser sur le meuble bas ou le déclarer fixé au mur." });
    }
    return checks;
}
