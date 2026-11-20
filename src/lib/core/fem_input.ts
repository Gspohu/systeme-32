// What a finite element run of a piece reads, written out whole by scripts/fem_charges.ts and fingerprinted on those
// very bytes : the run hashes the file it reads, the software the same text, a result is cited only on its own input

import type { Project, Screen } from "./model";
import type { Build } from "./part_types";
import { drilledHoles, exportedParts } from "./io/export_selection";
import { decorById, materialOfDecor } from "../data/materials";
import { PANEL_POISSON } from "../data/rules";


// A screen weighs on the piece only set down on it : on the wall or on its arm, the wall carry it
export function setDown(sc: Screen): boolean
{
    return !sc.wallMounted && sc.arm === null && sc.massKg !== null && sc.frame !== null;
}


export function femInput(p: Project, b: Build): unknown
{
    // An item by its rank in the project, never by its id : a template makes new ids each time it's built
    const rank = new Map(p.items.map((it, k) => { return [it.id, `i${k}`]; }));
    const materials: Record<string, object> = {};
    const parts = exportedParts(b).map((q) =>
    {
        const stock = materialOfDecor(decorById(q.decor));
        materials[stock.id] = { label: stock.label, modulus: stock.modulus, density: stock.densityCheck,
                                source: stock.source };
        return { item: rank.get(q.item) ?? q.item, itemName: q.itemName, label: q.label, role: q.role,
                 length: q.length, width: q.width, thickness: q.thickness, frame: q.frame, outline: q.outline,
                 material: stock.id,
                 holes: drilledHoles(q).map((h) =>
                 {
                     return { u: h.u, v: h.v, w: h.w, diameter: h.diameter, depth: h.depth, face: h.face,
                              purpose: h.purpose };
                 }) };
    });
    const fitted = b.fitted.filter((f) => { return f.purpose === "foot" && f.host === null; }).map((f) =>
    {
        return { purpose: f.purpose, centre: f.centre };
    });
    // What stands on the piece and weighs on it, over its footprint : the devices, and a screen set down
    const loads: { name: string; massKg: number; lo: number[]; hi: number[]; source: string }[] = [];
    for (const it of p.items)
    {
        if (it.kind === "device")
        {
            loads.push({ name: it.name, massKg: it.massKg, source: it.source, lo: [it.x, it.y, it.z],
                         hi: [it.x + it.width, it.y + it.height, it.z + it.depth] });
        }
    }
    const sc = p.screen;
    if (sc !== null && setDown(sc))
    {
        const half = sc.frame!.w / 2;
        loads.push({ name: "écran", massKg: sc.massKg!, source: sc.source,
                     lo: [sc.cx - half, sc.bottom, sc.z - sc.frame!.d], hi: [sc.cx + half, sc.bottom + sc.frame!.h,
                                                                           sc.z] });
    }
    // Each board takes its own material : the modulus and the check density the software works with
    const table = { poisson: PANEL_POISSON,
                    poissonSource: "Sekino et Sasaki 2004, doi 10.2472/jsms.53.396, valeur haute de la plage, celle "
                        + "du logiciel",
                    materials: Object.fromEntries(Object.keys(materials).sort().map((id) =>
                    {
                        return [id, materials[id]];
                    })) };
    // kg/dm2 on every floor and shelf : the test load the checks of the software use
    return { parts, fitted, loads, materials: table, shelfLoad: p.settings.shelfLoad };
}


// The text the run reads : femInput written out, byte for byte what fem_charges.ts puts in the file
export function femText(input: unknown): string
{
    return JSON.stringify(input);
}

// FNV-1a over 64 bits of the UTF-8 bytes of that text, what scripts/fem_meuble.py works out on the file it reads
export function femFingerprint(input: unknown): string
{
    let hash = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(femText(input)))
    {
        hash ^= BigInt(byte);
        hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return hash.toString(16).padStart(16, "0");
}
