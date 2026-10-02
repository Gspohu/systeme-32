// LED lights under the panel above a cell : a strip in a recessed profile or round spots, their driver and the
// Wi-Fi controler that dims them

import type { Carcass, CellLight, Project, Settings } from "./model";
import { DIAM } from "./text";
import type { NodeBox, ResolvedLayout } from "./layout";
import type { Build, Part } from "./parts";
import { panelStartX } from "./dividers";
import type { Check } from "./analysis";
import { panelAbove } from "./locate";
import { FIT_PLAY } from "./wardrobe";
import { WIFI_LED_CONTROLLER } from "../data/hardware";

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
// TODO the generic driver now priced has one output, the six sockets are those of the Loox one the sizing came from
export const DRIVER_SOCKETS = 6;


export interface LightPlan
{
    profile: number;
    strip: number;
    watts: number;
}


// The strip keeps a whole cutting pitch clear of the profile ends and the lead
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
    let wifi = false;
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
                wifi = wifi || light.wifi === true;
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
        // the profile runs from side to side of the cell, its ends hidden against them : no end cap
        line("LED_PROFILE_RECESS", `coupé à ${Math.round(plan.profile)} mm`);
        line("LED_STRIP_24V", `${plan.strip} mm, ${light.kelvin} K, ${s.ledWattPerMetre} W/m`);
        line("LED_LEAD", null);
        watts += plan.watts;
        strips++;
        wifi = wifi || light.wifi === true;
    }
    if (strips > 0)
    {
        b.hardware.push({ ref: "LED_DRIVER_24V", qty: 1, item: c.id, itemName: c.name, target: null,
                          note: `${Math.ceil(watts / LED_DRIVER_LOAD)} W mini pour ${watts.toFixed(1)} W de LED `
                              + `(${strips} éclairage(s), charge à 80 %)` });
    }
    if (wifi)
    {
        const W = WIFI_LED_CONTROLLER;
        const amps = watts / W.volts;
        b.hardware.push({ ref: W.ref, qty: 1, item: c.id, itemName: c.name, target: null,
                          note: `entre l'alimentation et les rubans, ${amps.toFixed(2)} A sur une voie, pilotage local` });
        if (amps > W.ampsPerChannel)
        {
            b.errors.push(`${c.name}, éclairage : ${amps.toFixed(1)} A pour ${W.ampsPerChannel} A par voie du contrôleur `
                + "Wi-Fi (Shelly). Répartir les rubans sur plusieurs voies ou retirer un éclairage.");
        }
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


// More leads tahn a driver has sockets for
export function lightChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    for (const it of p.items)
    {
        if (it.kind !== "carcass")
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
    }
    return checks;
}
