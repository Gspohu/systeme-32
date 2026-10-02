// Clothes rails and LED lights hung under the panel above a cell : geometry, marks, hardware and checks

import type { Carcass, CellLight, HangingRail, Project, Settings } from "./model";
import { DIAM } from "./text";
import type { NodeBox, ResolvedLayout } from "./layout";
import { findNode, subtreeIds } from "./layout";
import type { Build, Part } from "./parts";
import { panelStartX } from "./dividers";
import type { Check } from "./analysis";
import { panelAbove, sideFace } from "./locate";
import { ceilingAt } from "./slope";
import { GRAVITY } from "../data/rules";

// Häfele U.K. TCH Design 2017 p. 2.48 : the centre support 802.02.250 drops 66 mm to the bottom of its Ø 31 ring
export const RAIL_DROP = 66 - 31 / 2;
export const RAIL_D = 25;
// thinnest Ø 25 wall of the same catalogue, p. 2.49 (801.12.523)
export const RAIL_WALL = 0.6;
// EN 16122:2012 6.3.1, clothes rail supports loaded one hour (CATAS comparison table, RISE report 7F003676B)
export const RAIL_LOAD_KG_PER_DM = 4;
// the grade of the tube is not published : a welded precision tube of E195, the lowest usual grade, whose name
// gives its minimum yield on the finished tube (Helens, a tube maker)
// https://www.helens.se/fileadmin/user_upload/produktprogram-tekniskinfo/helens-welded-precision-steel-tubes-en.pdf
export const STEEL_FY = 195;
// Furnica walk-in wardrobe guide, a retailer : centre support past 900 mm, 550 mm inside depth at least
// https://furnica.com/blogs/guides/walk-in-wardrobe-fittings-hardware-guide
export const RAIL_CENTRE_FROM = 900;
export const HANGER_DEPTH_MIN = 550;
export const RAIL_BAR = 2500;
// Häfele U.K. TCH Design 2017 p. 2.40, Servetto 2004 pull down rail fitted at the rear : pivot 30 under the panel
// and 280 from the back, housing 830 high, the rail comes 642 lower and 365 past the front, 1.6 to 10 kg
export const LIFT = {
    pivotDrop: 30,
    pivotFromBack: 280,
    housing: 830,
    lowered: 642,
    reach: 365,
    maxKg: 10,
    // by internal width, the ranges overlap and the first that fits is taken
    models: [
        { min: 440, max: 610, ref: "805.20.326" },
        { min: 600, max: 1000, ref: "805.20.352" },
        { min: 770, max: 1200, ref: "805.20.356" },
    ],
};
// workshop conventions : 1 mm of play at each end of a tube or a profile, 3 mm of kerf per tube cut
export const FIT_PLAY = 1;
export const TUBE_KERF = 3;
// Häfele Loox recess profile 833.72.844 p. 5.203 : body 18 wide and 8.5 high overall, the flange bears on the face
export const LED_GROOVE_W = 18;
export const LED_GROOVE_D = 8.5;
// p. 5.138 : a 75 W driver takes at most 60 W of strip, 80 % of its rating
export const LED_DRIVER_LOAD = 0.8;
// p. 5.119, Loox 24V LED 3001 : press-fit in a 55 blind hole 11 deep, 65 rim, lead up through 8 mm
export const SPOT_HOLE = 55;
export const SPOT_DEPTH = 11;
export const SPOT_RIM = 65;
export const SPOT_LEAD_HOLE = 8;
// p. 5.149 : the Loox 24V driver has 6 sockets for lights
export const DRIVER_SOCKETS = 6;


export interface RailPlan   
{
    cell: NodeBox;
    // tube lenght, axis height from the bottom of the box, axis depth from the front edge of the sides
    length: number;
    axisY: number;
    axisV: number;
    centre: boolean;
    // from the cell floor to the underside of the tube
    clear: number;
    usableDepth: number;
}

export interface RailCheck
{
    span: number;
    stress: number;
    // what the centre support hangs on the panel above, N
    reaction: number;
}


// Under a sloped top the tube hangs from the lower end of the ceiling it spans
export function railPlan(c: Carcass, lay: ResolvedLayout, r: HangingRail): RailPlan | null
{
    const nb = lay.nodes.get(r.cell);
    if (nb === undefined)
    {
        return null;
    }
    let ceiling = nb.y + nb.h;
    if (c.slope !== null)
    {
        ceiling = Math.min(ceiling, ceilingAt(c, nb.x), ceilingAt(c, nb.x + nb.w));
    }
    const length = nb.w - 2 * FIT_PLAY;
    const usableDepth = c.depth - lay.zBack;
    if (r.kind === "lift")
    {
        // the rail at rest on its pivot, the lift carries it without a centre support
        const pivot = ceiling - LIFT.pivotDrop;
        return { cell: nb, length, axisY: pivot, axisV: usableDepth - LIFT.pivotFromBack, centre: false,
                 clear: pivot - RAIL_D / 2 - nb.y, usableDepth };
    }
    const axisY = ceiling - RAIL_DROP;
    return { cell: nb, length, axisY, axisV: usableDepth / 2, centre: length > RAIL_CENTRE_FROM,
             clear: axisY - RAIL_D / 2 - nb.y, usableDepth };
}


export function railCheck(length: number, centre: boolean): RailCheck
{
    const w = RAIL_LOAD_KG_PER_DM * GRAVITY / 100;
    const inner = RAIL_D - 2 * RAIL_WALL;   
    const I = Math.PI * (RAIL_D ** 4 - inner ** 4) / 64;
    const span = centre ? length / 2 : length;
    // w L^2 / 8 at mid span, and over the centre support of two equal continous spans as well, which then
    // takes 10 w L / 8
    const stress = w * span ** 2 / 8 / (I / (RAIL_D / 2));
    return { span, stress, reaction: centre ? 1.25 * w * span : 0 };
}


function inDrawers(c: Carcass, cell: string): boolean
{
    for (const f of c.fronts)
    {
        const node = findNode(c.root, f.node);
        if (f.spec.type === "drawers" && node !== null && subtreeIds(node).includes(cell))
        {
            return true;
        }
    }
    return false;
}


// A pull down rail : one of the three sizes, room for its housing, both sides to screw it to, 10 kg at most
function fitLift(c: Carcass, lay: ResolvedLayout, nb: NodeBox, plan: RailPlan, b: Build): number
{
    const where = `${c.name}, ascenseur de penderie`;
    const model = LIFT.models.find((m) =>
    {
        return nb.w >= m.min && nb.w <= m.max;
    });
    const room = LIFT.pivotDrop + LIFT.housing;
    const sides = [sideFace(c, lay, b, nb, "left"), sideFace(c, lay, b, nb, "right")];
    if (model === undefined)
    {
        b.errors.push(`${where} : largeur intérieure ${Math.round(nb.w)} mm hors de ${LIFT.models[0]!.min} à `
            + `${LIFT.models[LIFT.models.length - 1]!.max} (Häfele Servetto 2004). Recouper la case.`);
        return 0;
    }
    if (nb.h < room || plan.usableDepth < LIFT.pivotFromBack)
    {
        b.errors.push(`${where} : case de ${Math.round(nb.h)} x ${Math.round(plan.usableDepth)} mm, le mécanisme `
            + `demande ${room} de haut et ${LIFT.pivotFromBack} de profondeur (Häfele p. 2.40). Agrandir la case.`);
        return 0;
    }
    if (sides[0] === null || sides[1] === null)
    {
        b.errors.push(`${where} : il faut une joue ou un montant pleine hauteur de chaque côté pour les deux `
            + "mécanismes. Recouper autrement.");
        return 0;
    }
    for (const f of sides)
    {
        f!.part.notes.push("Ascenseur de penderie : mécanisme vissé à l'arrière dans les trous de 32, fixations fournies");
    }
    b.hardware.push({ ref: model.ref, qty: 1, item: c.id, itemName: c.name, target: null,
                      note: `largeur intérieure ${Math.round(nb.w)} mm, ${LIFT.maxKg} kg maxi` });
    return LIFT.maxKg;
}


// Returns the mass of clothes the rails carry at the test load, kg
export function buildRails(c: Carcass, lay: ResolvedLayout, b: Build): number
{
    let clothes = 0;
    for (const r of c.rails)
    {
        const plan = railPlan(c, lay, r);
        if (plan === null)
        {
            continue;
        }
        const nb = plan.cell;
        const where = `${c.name}, penderie`;
        if (inDrawers(c, r.cell))
        {
            b.errors.push(`${where} dans une case à tiroirs. Retirer la penderie ou les tiroirs.`);
            continue;
        }
        if (r.kind === "lift")
        {
            clothes += fitLift(c, lay, nb, plan, b);
            continue;
        }
        if (plan.clear < 0)
        {
            b.errors.push(`${where} : case trop basse pour le tube. L'agrandir ou retirer la penderie.`);
            continue;
        }
        if (plan.length > RAIL_BAR)
        {
            b.errors.push(`${where} de ${Math.round(plan.length)} mm, plus longue qu'une barre de ${RAIL_BAR} mm. `
                + "Recouper la case par un montant.");
            continue;
        }
        const sides = [sideFace(c, lay, b, nb, "left"), sideFace(c, lay, b, nb, "right")];
        if (sides[0] === null || sides[1] === null) 
        {
            b.errors.push(`${where} : il faut une joue ou un montant pleine hauteur de chaque côté de la case pour `
                + "visser les rosaces. Recouper autrement ou retirer la penderie.");
            continue;
        }
        const above = plan.centre ? panelAbove(c, lay, nb, b) : null;
        if (plan.centre && (above === null || (above.part.role === "top" && c.slope !== null)))
        {
            b.errors.push(`${where} de ${Math.round(plan.length)} mm : au-delà de ${RAIL_CENTRE_FROM} mm il faut un `
                + "support central vissé sous une tablette fixe ou un dessus plat. Fixer la tablette ou recouper la case.");
            continue;
        }
        for (const f of sides)
        {
            f!.part.holes.push({ u: plan.axisY - f!.uOrigin, v: plan.axisV, diameter: 0, depth: 0, face: f!.face,
                                 label: "Axe de tringle : rosace 803.53.220, 2 vis 4 x 16" });
        }
        let screws = 4;
        if (above !== null)
        {
            const u = nb.x + nb.w / 2 - panelStartX(above.part, c);
            above.part.holes.push({ u, v: plan.axisV, diameter: 0, depth: 0, face: above.face,
                                    label: "Support central de tringle 802.02.250, 3 vis 4 x 16" });
            const load = railCheck(plan.length, true).reaction;
            b.midLoads.set(above.part.id, (b.midLoads.get(above.part.id) ?? 0) + load);
            b.hardware.push({ ref: "802.02.250", qty: 1, item: c.id, itemName: c.name, target: above.part.id,
                              note: "bague fermée : l'enfiler sur le tube avant la pose" });
            screws += 3;
        }
        b.hardware.push({ ref: "803.53.220", qty: 2, item: c.id, itemName: c.name, target: null, note: null });
        b.hardware.push({ ref: "SCREW_4x16_RAIL", qty: screws, item: c.id, itemName: c.name, target: null, note: null });
        b.railCuts.push({ item: c.id, itemName: c.name, length: plan.length });
        clothes += RAIL_LOAD_KG_PER_DM * plan.length / 100;
    }
    return clothes;
}


export interface LightPlan  
{
    profile: number;
    strip: number;
    watts: number;
}


// The strip keeps a whole cutting pitch clear of the end caps and the lead
export function lightPlan(nb: NodeBox, s: Settings): LightPlan
{
    const profile = nb.w - 2 * FIT_PLAY;
    const pitch = s.ledCutPitch;
    const strip = Math.floor((profile - pitch) / pitch) * pitch;
    return { profile, strip, watts: strip / 1000 * s.ledWattPerMetre };
}


export function buildLights(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    let watts = 0;
    let strips = 0;
    for (const light of c.lights)
    {
        const nb = lay.nodes.get(light.cell);
        if (nb === undefined)
        {
            continue;
        }
        const where = `${c.name}, éclairage`;
        const above = panelAbove(c, lay, nb, b);
        if (above === null)
        {
            b.errors.push(`${where} sous une étagère réglable : le câble ne suit pas. Passer la tablette en fixe.`);
            continue;
        }
        if (above.part.role === "top" && c.slope !== null)
        {
            b.errors.push(`${where} sous un dessus en pente, non géré. Le poser sous une tablette fixe.`);
            continue;
        }
        if (light.kind === "spots")
        {
            const w = fitSpots(c, nb, light, above, s, b);
            if (w > 0)
            {
                watts += w;
                strips++;
            }
            continue;
        }
        const plan = lightPlan(nb, s);
        if (plan.strip <= 0)
        {
            b.errors.push(`${where} : case trop étroite pour un ruban coupé tous les ${s.ledCutPitch} mm. Retirer l'éclairage.`);
            continue;
        }
        const p = above.part;
        if (light.setback + LED_GROOVE_W > p.width || LED_GROOVE_D >= p.thickness)
        {
            b.errors.push(`${where} : la rainure ${LED_GROOVE_W} x ${LED_GROOVE_D} ne tient pas dans ${p.label.toLowerCase()} `
                + `(${Math.round(p.width)} x ${p.thickness}). Réduire le retrait.`);
            continue;
        }
        const from = nb.x + FIT_PLAY - panelStartX(p, c);
        const at = light.setback + LED_GROOVE_W / 2;
        p.grooves.push({ face: above.face, along: "u", at, from, to: from + plan.profile, width: LED_GROOVE_W,
                         depth: LED_GROOVE_D, label: "Rainure du profilé LED", weakens: true });
        p.holes.push({ u: from + 10, v: at, diameter: 0, depth: 0, face: above.face,
                       label: "Sortie du câble du ruban : percer au diamètre du connecteur choisi" });
        const line = (ref: string, note: string | null): void =>
        {
            b.hardware.push({ ref, qty: 1, item: c.id, itemName: c.name, target: p.id, note });
        };
        line("LED_PROFILE_RECESS", `coupé à ${Math.round(plan.profile)} mm`);
        line("LED_END_CAPS", null);
        line("LED_STRIP_24V", `${plan.strip} mm, ${light.kelvin} K, ${s.ledWattPerMetre} W/m`);
        line("LED_LEAD", null);
        watts += plan.watts;
        strips++;
    }
    if (strips > 0)
    {
        b.hardware.push({ ref: "LED_DRIVER_24V", qty: 1, item: c.id, itemName: c.name, target: null,
                          note: `${Math.ceil(watts / LED_DRIVER_LOAD)} W mini pour ${watts.toFixed(1)} W de LED `
                              + `(${strips} éclairage(s), charge à 80 %)` });
    }
}


// Spot centres across a cell, local carcass x, one equal share of the width each
export function spotCentres(nb: NodeBox, l: CellLight): number[]
{
    const n = Math.max(1, Math.round(l.spots));
    const out: number[] = [];
    let i = 0;
    while (i < n)
    {
        out.push(nb.x + nb.w * (i + 0.5) / n);
        i++;
    }
    return out;
}


// Round spots spread evenly across the cell, each in its blind hole with the lead going up, returns their watts
function fitSpots(c: Carcass, nb: NodeBox, l: CellLight, above: { part: Part; face: "A" | "B" }, s: Settings,
    b: Build): number
{
    const where = `${c.name}, spots`;
    const p = above.part;
    const n = Math.max(1, Math.round(l.spots));
    const pitch = nb.w / n;
    if (pitch < SPOT_RIM)
    {
        b.errors.push(`${where} : ${n} spots de ${DIAM}${SPOT_RIM} ne tiennent pas sur ${Math.round(nb.w)} mm. `
            + `En poser ${Math.max(1, Math.floor(nb.w / SPOT_RIM))} au plus.`);
        return 0;
    }
    if (l.setback + SPOT_RIM > p.width)
    {
        b.errors.push(`${where} : à ${l.setback} mm du chant, les spots sortent de ${p.label.toLowerCase()} `
            + `(${Math.round(p.width)} mm). Réduire le retrait.`);
        return 0;
    }
    if (SPOT_DEPTH >= p.thickness)
    {
        b.errors.push(`${where} : ${p.label.toLowerCase()} de ${p.thickness} mm trop mince pour un logement de `
            + `${SPOT_DEPTH} mm. Épaissir le panneau.`);
        return 0;
    }
    // the setback runs to the edge of the rim, holes are too local to enter the span stiffness
    const v = l.setback + SPOT_RIM / 2;
    for (const x of spotCentres(nb, l))
    {
        const u = x - panelStartX(p, c);
        p.holes.push({ u, v, diameter: SPOT_HOLE, depth: SPOT_DEPTH, face: above.face,
                       label: `Logement de spot ${DIAM}${SPOT_HOLE} x ${SPOT_DEPTH}` });
        p.holes.push({ u, v, diameter: SPOT_LEAD_HOLE, depth: p.thickness, face: above.face,
                       label: `Passage du câble ${DIAM}${SPOT_LEAD_HOLE}, débouchant` });
    }
    b.hardware.push({ ref: "LED_SPOT_ROUND", qty: n, item: c.id, itemName: c.name, target: p.id,
                      note: `${l.kelvin} K, ${s.spotWatt} W chacun` });
    return n * s.spotWatt;
}


// First fit decreasing over the whole project, each bar booked on the item of its longest cut
export function packRailBars(b: Build): void
{
    const cuts = [...b.railCuts].sort((x, y) => { return y.length - x.length; });
    const bars: { left: number; item: string; itemName: string; lengths: number[] }[] = [];
    for (const cut of cuts)
    {
        const need = cut.length + TUBE_KERF;
        let bar = bars.find((x) => { return x.left >= need; });
        if (bar === undefined)
        {
            bar = { left: RAIL_BAR, item: cut.item, itemName: cut.itemName, lengths: [] };
            bars.push(bar);
        }
        bar.left -= need;
        bar.lengths.push(Math.round(cut.length));
    }
    for (const bar of bars)
    {
        b.hardware.push({ ref: "RAIL_TUBE_25", qty: 1, item: bar.item, itemName: bar.itemName, target: null,
                          note: `coupes ${bar.lengths.join(" + ")} mm` });
    }
}


export function wardrobeChecks(p: Project, b: Build): Check[]
{
    const checks: Check[] = [];
    for (const it of p.items)
    {
        const lay = it.kind === "carcass" ? b.layouts.get(it.id) : undefined;
        if (it.kind !== "carcass" || lay === undefined)
        {
            continue;
        }
        let leads = 0;
        for (const l of it.lights)
        {
            leads += l.kind === "spots" ? Math.max(1, Math.round(l.spots)) : 1;
        }
        if (leads > DRIVER_SOCKETS)
        {
            checks.push({ level: "warning", item: it.id, target: null,
                          message: `${it.name} : ${leads} câbles LED pour les ${DRIVER_SOCKETS} prises d'une alimentation `
                              + "Loox (Häfele p. 5.149). Prévoir un répartiteur ou une seconde alimentation." });
        }
        for (const r of it.rails)
        {
            const plan = railPlan(it, lay, r);
            if (plan === null)
            {
                continue;
            }
            if (r.kind === "lift")
            {
                const test = RAIL_LOAD_KG_PER_DM * plan.length / 100;
                if (test > LIFT.maxKg)
                {
                    checks.push({ level: "warning", item: it.id, target: null,
                                  message: `${it.name} : ascenseur de penderie limité à ${LIFT.maxKg} kg, EN 16122:2012 `
                                      + `éprouve une tringle fixe de cette longueur à ${test.toFixed(0)} kg. N'y suspendre `
                                      + "que des vêtements légers." });
                }
                const low = it.y + plan.axisY - LIFT.housing - LIFT.lowered;
                checks.push({ level: "info", item: it.id, target: null,
                              message: `${it.name} : tringle descendue à ${Math.round(low)} mm du sol, ${LIFT.reach} mm `
                                  + "devant le caisson (Häfele p. 2.40)." });
                continue;
            }
            const k = railCheck(plan.length, plan.centre);
            const figures = `portée ${Math.round(k.span)} mm, ${k.stress.toFixed(0)} N/mm² pour ${STEEL_FY} `
                + "(tube soudé E195 supposé)";
            if (k.stress > STEEL_FY)
            {
                checks.push({ level: "error", item: it.id, target: null,
                              message: `${it.name} : le tube de penderie plie sous ${RAIL_LOAD_KG_PER_DM} kg/dm `
                                  + `(EN 16122:2012), ${figures}. Recouper la case par un montant.` });
                continue;
            }
            if (plan.usableDepth < HANGER_DEPTH_MIN)
            {
                checks.push({ level: "warning", item: it.id, target: null,
                              message: `${it.name} : penderie dans ${Math.round(plan.usableDepth)} mm de profondeur utile, `
                                  + `un cintre en demande ${HANGER_DEPTH_MIN} (guide Furnica). Approfondir le caisson.` });
            }
            const centre = plan.centre ? ", support central" : "";
            checks.push({ level: "info", item: it.id, target: null,
                          message: `${it.name} : tringle de ${Math.round(plan.length)} mm${centre}, ${figures}, `
                              + `${Math.round(plan.clear)} mm de hauteur libre dessous.` });
        }
    }
    return checks;
}
