// LED lights under the panel above a cell : a strip in a profile screwed on the face or let into a groove, or round
// spots, their driver and the Wi-Fi controler that dims them

import type { Carcass, CellLight, Project, Settings } from "./model";
import { DIAM } from "./text";
import { topDoubling, type NodeBox, type ResolvedLayout } from "./layout";
import { meets } from "./drilling";
import type { Build, Part } from "./parts";
import { panelStartX } from "./dividers";
import type { Check } from "./check";
import { panelAbove } from "./locate";
import { byId } from "./edit";
import { at as at3, neg, X, Y, Z, type Vec3 } from "./geometry";
import { FIT_PLAY } from "./wardrobe";
import { WIFI_LED_CONTROLLER } from "../data/hardware";

// Häfele Loox recess profile 833.72.844 p. 5.203 : body 18 wide and 8.5 high overall, the flange bears on the face
export const LED_GROOVE_W = 18;
export const LED_GROOVE_D = 8.5;
export const LED_GROOVE_LABEL = "Rainure du profilé LED";
// Häfele Loox surface profile 833.72.840 p. 5.200 : 18 wide, 8.5 high, screwed on the face, its walls taken as 1 mm
export const LED_SURFACE = { high: 8.5, wall: 1 };
// The strip in it, 8 to 10 mm wide (data/hardware.ts) : 10 wide and 1.5 thick for its volume
export const LED_STRIP = { wide: 10, thick: 1.5 };
// p. 5.149 : the Loox 24 V constant voltage drivers, by the power they take, their housing L x W x H
export const LED_DRIVERS = [
    { watts: 15, size: [140, 43, 20], ref: "833.77.900" },
    { watts: 20, size: [128, 50.5, 14], ref: "833.77.912" },
    { watts: 30, size: [195, 43, 28], ref: "833.77.901" },
    { watts: 75, size: [208, 56.5, 30], ref: "833.77.914" },
] as const;
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
        const above = light.under === true ? panelUnder(c, nb, b) : panelAbove(c, lay, nb, b);
        if (above === null && light.under === true)
        {
            b.errors.push(`${where} sous le caisson : la case doit reposer sur le dessous, et le caisson sans socle `
                + "ni pieds. Choisir une case du bas ou poser l'éclairage dans la case.");
            continue;
        }
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
        const recess = light.recess === true;
        const deep = recess ? LED_GROOVE_D : LED_SURFACE.high;
        if (light.setback + LED_GROOVE_W > p.width || (recess && LED_GROOVE_D >= p.thickness) || p.frame === null)
        {
            b.errors.push(`${where} : le profilé ${LED_GROOVE_W} x ${deep} ne tient pas sous ${p.label.toLowerCase()} `
                + `(${Math.round(p.width)} x ${p.thickness}). Réduire le retrait.`);
            continue;
        }
        const from = nb.x + FIT_PLAY - panelStartX(p, c);
        const at = light.setback + LED_GROOVE_W / 2;
        if (recess)
        {
            p.grooves.push({ face: above.face, along: "u", at, from, to: from + plan.profile, width: LED_GROOVE_W,
                             depth: LED_GROOVE_D, label: LED_GROOVE_LABEL, weakens: true });
        }
        if (light.leadThrough === undefined)
        {
            p.holes.push({ u: from + 10, v: at, diameter: 0, depth: 0, face: above.face,
                           label: "Sortie du câble du ruban : percer au diamètre du connecteur choisi", purpose: "light-lead" });
        }
        // The profile and the strip in it, as they stand : in the board when let in, under its face when screwed on
        const f = p.frame;
        const out = above.face === "A" ? neg(f.n) : f.n;
        const face = at3(f, from + plan.profile / 2, at, above.face === "A" ? 0 : p.thickness);
        const shift = (k: number): Vec3 => { return [face[0] + out[0] * k, face[1] + out[1] * k, face[2] +
                                                     out[2] * k]; };
        const base = recess ? -LED_GROOVE_D : 0;
        const key = `${c.id}/light/${light.id}`;
        b.fitted.push({ key: `${key}/profile`, item: c.id, ref: recess ? "LED_PROFILE_RECESS" : "LED_PROFILE_SURFACE",
                        label: `${c.name} : profilé LED`, purpose: "light", shape: "box", centre: shift(base + deep / 2),
                        axes: [f.u, f.v, out], half: [plan.profile / 2, LED_GROOVE_W / 2, deep /
                                                      2], host: recess ? p.id : null,
                        hidden: false },
                      { key: `${key}/strip`, item: c.id, ref: "LED_STRIP_24V",
                       label: `${c.name} : ruban LED`, purpose: "light",
                        shape: "box", centre: shift(base + LED_SURFACE.wall + LED_STRIP.thick / 2), axes: [f.u,
                            f.v, out],
                        half: [plan.strip / 2, LED_STRIP.wide / 2, LED_STRIP.thick /
                               2], host: `${key}/profile`, hidden: false });
        // Out through the left side in line with the profile, drilled before the joints of the carcass : its
        // connectors step round the hole, the lead never gives way to them
        const ours = byId(b.parts, `${c.id}/side/L`);
        if (light.leadThrough === "left" && light.under !== true && ours !== undefined)
        {
            const mid = shift(base + deep / 2);
            // A side stopping under the top would leave a skin of board over the hole : kept a hole of wood off its end
            const u = Math.min(mid[1] - ours.frame!.o[1], ours.length - LEAD_HOLE / 2 - LEAD_EDGE);
            ours.holes.push({ u, v: c.z + c.depth - mid[2], diameter: LEAD_HOLE, depth: ours.thickness, face: "A",
                              label: `Passage du câble LED, ${DIAM}${LEAD_HOLE} traversant`, purpose: "light-lead" });
        }
        const line = (ref: string, note: string | null): void =>
        {
            b.hardware.push({ ref, qty: 1, item: c.id, itemName: c.name, target: p.id, note, purpose: "light" });
        };
        // The profile runs from side to side of the cell, its ends hidden against them : no end cap
        line(recess ? "LED_PROFILE_RECESS" : "LED_PROFILE_SURFACE", `coupé à ${Math.round(plan.profile)} mm`);
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
                              + `(${strips} éclairage(s), charge à 80 %)`, purpose: "light" });
    }
    if (wifi)
    {
        const W = WIFI_LED_CONTROLLER;
        const amps = watts / W.volts;
        b.hardware.push({ ref: W.ref, qty: 1, item: c.id, itemName: c.name, target: null,
                          note: `entre l'alimentation et les rubans, ${amps.toFixed(2)} A sur une voie, pilotage local`,
                          purpose: "light" });
        if (amps > W.ampsPerChannel)
        {
            b.errors.push(`${c.name}, éclairage : ${amps.toFixed(1)} A pour ${W.ampsPerChannel} A par voie du contrôleur `
                + "Wi-Fi (Shelly). Répartir les rubans sur plusieurs voies ou retirer un éclairage.");
        }
    }
}


// The bottom of the carcass seen from below, when the cell stands on it and nothing hides that face
function panelUnder(c: Carcass, nb: NodeBox, b: Build): { part: Part; face: "A" | "B" } | null
{
    if (nb.y > c.thickness + 0.01 || c.base.type === "plinth" || c.base.type === "feet")
    {
        return null;
    }
    const bottom = byId(b.parts, `${c.id}/bottom`);
    return bottom === undefined ? null : { part: bottom, face: "B" };
}


// Local carcass height of the face a light is let into : under the panel over its cell, or under the carcass
export function lightLevel(nb: NodeBox, l: CellLight): number
{
    return l.under === true ? 0 : nb.y + nb.h;
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
    // The setback runs to the edge of the rim, holes are too local to enter the span stiffness
    const v = l.setback + SPOT_RIM / 2;
    for (const x of spotCentres(nb, l))
    {
        const u = x - panelStartX(p, c);
        p.holes.push({ u, v, diameter: SPOT_HOLE, depth: SPOT_DEPTH, face: above.face,
                       label: `Logement de spot ${DIAM}${SPOT_HOLE} x ${SPOT_DEPTH}`, purpose: "spot" });
        p.holes.push({ u, v, diameter: SPOT_LEAD_HOLE, depth: p.thickness, face: above.face,
                       label: `Passage du câble ${DIAM}${SPOT_LEAD_HOLE}, débouchant`, purpose: "light-lead" });
    }
    b.hardware.push({ ref: "LED_SPOT_ROUND", qty: n, item: c.id, itemName: c.name, target: p.id,
                      note: `${l.kelvin} K, ${s.spotWatt} W chacun`, purpose: "light" });
    return n * s.spotWatt;
}


// The lead of a strip through 2 sides that touch, in line with its groove : the end of the profile hides the hole
// narrower than the 8.5 the groove goes in. Runs once every carcass is built, the other side of the hole being another's
const LEAD_HOLE = 8;
// Wood left between the lead hole and the end of a side, a workshop rule : as much as the hole
const LEAD_EDGE = 8;

export function fitLightLeads(p: Project, b: Build): void
{
    for (const c of p.items)
    {
        if (c.kind !== "carcass")
        {
            continue;
        }
        for (const light of c.lights)
        {
            if (light.leadThrough !== "left" || light.under === true || light.kind !== "strip")
            {
                continue;
            }
            const next = p.items.find((q) =>
            {
                return q.kind === "carcass" && q.wall === c.wall && q.freeStanding !== true
                    && Math.abs(q.x + q.width - c.x) < 0.5 && q.y <= c.y && q.y + q.height >= c.y + c.height;
            });
            const ours = byId(b.parts, `${c.id}/side/L`);
            const theirs = next === undefined ? undefined : byId(b.parts, `${next.id}/side/R`);
            if (next?.kind !== "carcass" || ours === undefined || theirs === undefined)
            {
                b.errors.push(`${c.name}, éclairage : aucun caisson à gauche pour passer le câble. Choisir une autre sortie.`);
                continue;
            }
            // Our side was drilled with the light, the side of the next carcass takes the same point of the room
            const own = ours.holes.find((h) => { return h.purpose === "light-lead"; });
            if (own === undefined)
            {
                b.errors.push(`${c.name}, éclairage : aucun passage de câble percé dans la joue gauche. Choisir une autre sortie.`);
                continue;
            }
            // Heights read off the frame of each side : one standing between a top and a bottom starts a board up
            const y = ours.frame!.o[1] + own.u;
            const z = c.z + c.depth - own.v;
            const up = y - theirs.frame!.o[1];
            if (meets(theirs, "A", up, next.z + next.depth - z, LEAD_HOLE, theirs.thickness))
            {
                b.errors.push(`${c.name}, éclairage : le passage du câble tombe sur un perçage de ${next.name}. Déplacer le ruban.`);
                continue;
            }
            own.label = `Passage du câble LED vers ${next.name}, ${DIAM}${LEAD_HOLE} traversant`;
            theirs.holes.push({ u: up, v: next.z + next.depth - z, diameter: LEAD_HOLE, depth: theirs.thickness,
                               face: "A",
                                label: `Passage du câble LED vers ${c.name}, ${DIAM}${LEAD_HOLE} traversant`, purpose: "light-lead" });
            const back = byId(b.parts, `${next.id}/back`);
            back?.notes.push(`Alimentation et contrôleur de ${c.name} vissés au fond, derrière la porte de la case, près du `
                + "passage de câble");
            if (back?.frame !== null && back !== undefined)
            {
                fitDriver(c, next, back, y, p.settings, b);
            }
            for (const h of b.hardware)
            {
                if (h.item === c.id && h.purpose === "light" && (h.ref === "LED_DRIVER_24V" ||
                                                                 h.ref === WIFI_LED_CONTROLLER.ref))
                {
                    h.note = `${h.note ?? ""}, vissé au fond de ${next.name}`;
                }
            }
        }
    }
}


// The driver, sized by the strips it feeds, and the Wi-Fi controller beside it : on the inner face of the back of the
// next carcass, under the lead, off its side
const DRIVER_OFF_SIDE = 20;
const DRIVER_UNDER_LEAD = 120;
// Shelly product page : 42 x 37 x 12
const CONTROLLER_SIZE = [42, 37, 12] as const;

function fitDriver(c: Carcass, next: Carcass, back: Part, leadY: number, s: Settings, b: Build): void
{
    const lay = b.layouts.get(c.id);
    let watts = 0;
    let wifi = false;
    for (const light of c.lights)
    {
        const nb = lay?.nodes.get(light.cell);
        if (light.kind === "strip" && nb !== undefined)
        {
            watts += lightPlan(nb, s).watts;
            wifi = wifi || light.wifi === true;
        }
    }
    const need = watts / LED_DRIVER_LOAD;
    const driver = LED_DRIVERS.find((d) => { return d.watts >= need; }) ?? LED_DRIVERS[LED_DRIVERS.length - 1]!;
    const f = back.frame!;
    const inner = Math.max(at3(f, 0, 0, 0)[2], at3(f, 0, 0, back.thickness)[2]);
    const right = next.x + next.width - next.thickness - DRIVER_OFF_SIDE;
    const y = leadY - DRIVER_UNDER_LEAD;
    const [L, W, H] = driver.size;
    b.fitted.push({ key: `${c.id}/light/driver`, item: next.id, ref: "LED_DRIVER_24V",
                    label: `${next.name} : alimentation de ${c.name} (Loox ${driver.ref}, ${driver.watts} W)`, purpose: "light",
                    shape: "box", centre: [right - L / 2, y, inner + H / 2], axes: [X, Y, Z], half: [L / 2, W / 2,
                        H / 2],
                    host: null, hidden: true });
    if (wifi)
    {
        const [l, w, h] = CONTROLLER_SIZE;
        b.fitted.push({ key: `${c.id}/light/controller`, item: next.id, ref: WIFI_LED_CONTROLLER.ref,
                        label: `${next.name} : contrôleur Wi-Fi de ${c.name}`, purpose: "light", shape: "box",
                        centre: [right - L - DRIVER_OFF_SIDE - l / 2, y, inner + h / 2], axes: [X, Y, Z], half: [l /
                            2, w / 2, h / 2],
                        host: null, hidden: true });
    }
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
