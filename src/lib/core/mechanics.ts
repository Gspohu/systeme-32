// Masses, shelf deflection with creep and tipping of standing carcasses

import type { Carcass } from "./model";
import type { Build, Part } from "./parts";
import { at, type Vec3 } from "./geometry";
import { MATERIALS } from "../data/materials";
import { GRAVITY, SHELF_DEFLECTION_LIMIT } from "../data/rules";
import { partMass } from "./fittings";
import { type CalcNote, valueOf, workOut } from "./calc_notes";

export interface Deflection
{
    part: string;
    span: number;
    // Instantaneous deflection under the test load plus self weight, mm
    instant: number;
    // Long term deflection with creep, instant x (1 + kdef)
    final: number;
    limit: number;
    // Worked out on a fixity nothing proves, the least it bends
    lowerBound?: boolean;
    // The calculation it comes out of, printed and put in the FreeCAD sheet as live formulas
    note?: CalcNote;
}


// Simply supported span under a uniform load and a point load at mid span, Euler-Bernoulli : worked out in its note
// the check reading what the note found
export function shelfDeflection(p: Part, loadKgPerDm2: number, midN = 0, span = p.length): Deflection | null
{
    const m = MATERIALS[p.material];
    if (m === undefined)
    {
        return null;
    }
    // A groove along the span comes off the whole thickness : the grooved section hold what is left, its stiffness can
    // only be higher
    let groove = 0;
    for (const g of p.grooves)
    {
        if (g.weakens === true && g.along === "u")
        {
            groove += g.width;
        }
    }
    const note = workOut({
        id: `fleche/${p.id}`, title: `Flèche de ${p.label}`, subject: { kind: "part", id: p.id, item: p.item },
        method: "Poutre sur deux appuis simples, charge répartie et charge ponctuelle à mi-portée (Euler-Bernoulli)",
        hypotheses: ["Appuis simples aux deux bouts, sans encastrement",
                     "Section pleine, moins les rainures le long de la portée",
                     "Charge d'essai répartie sur toute la tablette (EN 16122:2012)"],
        inputs: [
            // Its own length, or a span the software measured between supports : only the first is a size of the part
            { name: "portee", label: "Portée", value: span, unit: "mm", source: "Modèle",
              ...span === p.length ? { link: { part: p.id, size: "length" as const } } : {} },
            { name: "profondeur", label: "Profondeur", value: p.width, unit: "mm", source: "Modèle",
              link: { part: p.id, size: "width" } },
            { name: "epaisseur", label: "Épaisseur", value: p.thickness, unit: "mm", source: "Modèle",
              link: { part: p.id, size: "thickness" } },
            { name: "rainures", label: "Largeur des rainures le long de la portée", value: groove, unit: "mm",
             source: "Modèle" },
            { name: "module", label: "Module d'élasticité en flexion", value: m.modulus, unit: "N/mm²",
             source: m.source, link: { part: p.id, property: "modulus" } },
            { name: "masse_vol", label: "Masse volumique", value: m.density, unit: "kg/m^3", source: m.source,
              link: { part: p.id, property: "density" } },
            { name: "kdef", label: "Coefficient de fluage", value: m.kdef, unit: "-", source: m.source },
            { name: "pesanteur", label: "Pesanteur", value: GRAVITY, unit: "N/kg", source: "Valeur normale" },
            { name: "charge_essai", label: "Charge d'essai", value: loadKgPerDm2, unit: "kg/dm²",
              source: "Réglage du projet (UNI 11663)" },
            { name: "charge_ponct", label: "Charge ponctuelle à mi-portée", value: midN, unit: "N",
              source: "Modèle (support de tringle)" },
            { name: "part_admise", label: "Flèche admise, part de la portée", value: SHELF_DEFLECTION_LIMIT, unit: "-",
              source: "UNI 11663, essai EN 16122:2012" },
        ],
        steps: [
            // kg/dm2 x width in dm gives kg per dm of span, 1 dm = 100 mm
            { name: "q_essai", label: "Charge d'essai linéique",
             formula: "charge_essai * (profondeur / 100) * pesanteur / 100",
              unit: "N/mm", source: "kg/dm² sur la profondeur en dm, ramené au mm" },
            { name: "q_propre", label: "Poids propre linéique",
             formula: "masse_vol * 1e-9 * profondeur * epaisseur * pesanteur",
              unit: "N/mm", source: "Masse volumique en kg/mm^3" },
            { name: "inertie", label: "Moment quadratique", formula: "(profondeur - rainures) * epaisseur ^ 3 / 12",
             unit: "mm^4",
              source: "Section rectangulaire" },
            { name: "fleche", label: "Flèche instantanée",
              formula: "5 * (q_essai + q_propre) * portee ^ 4 / (384 * module * inertie) "
                  + "+ charge_ponct * portee ^ 3 / (48 * module * inertie)",
              unit: "mm", source: "Poutre sur deux appuis : 5 q L^4 / 384 E I et P L^3 / 48 E I" },
            { name: "fleche_fin", label: "Flèche à long terme", formula: "fleche * (1 + kdef)", unit: "mm",
              source: "EN 1995-1-1:2004, 2.3.2.2, information seulement" },
            { name: "fleche_adm", label: "Flèche admise", formula: "part_admise * portee", unit: "mm",
             source: "UNI 11663" },
        ],
        check: { value: "fleche", limit: "fleche_adm" },
        phrases: { pass: "Conforme : flèche à l'essai sous la flèche admise",
                   fail: "Non conforme : flèche à l'essai au-delà de la flèche admise",
                   stale: "Périmé" },
    });
    return { part: p.id, span, instant: valueOf(note, "fleche"), final: valueOf(note, "fleche_fin"),
             limit: valueOf(note, "fleche_adm"), note };
}


// The widest clear gap between the boards a top stands on, its sides and the uprights of its carcass, face to face
// along its length : the span its allowed sag is a share of, never its whole length over 2 joues and 3 uprights
export function topSpan(b: Build, top: Part): number
{
    const f = top.frame;
    if (f === null)
    {
        return top.length;
    }
    // A board seen from the top : its extent along the length of the top and across its thickness
    const extent = (q: Part, axis: Vec3): [number, number] =>
    {
        const qf = q.frame!;
        const ends = [0, q.length].flatMap((u) =>
        {
            return [0, q.width].flatMap((v) => { return [0, q.thickness].map((w) => { return at(qf, u, v, w); }); });
        }).map((pt) => { return (pt[0] - f.o[0]) * axis[0] + (pt[1] - f.o[1]) * axis[1] + (pt[2] - f.o[2]) * axis[2]; });
        return [Math.min(...ends), Math.max(...ends)];
    };
    // A side touching an end of a top laid between the sides lies just past it, -19 to 0 : kept within 0,5 mm. An
    // upright stopped short of the top carries nothing of it : its end must reach the top within 1 mm
    const carriers = b.parts.filter((q) =>
    {
        if (q.item !== top.item || q.frame === null || (q.role !== "side" && q.role !== "vdivider"))
        {
            return false;
        }
        const [low, high] = extent(q, f.n);
        return high >= -1 && low <= top.thickness + 1;
    }).map((q) => { return extent(q, f.u); }).filter(([lo, hi]) =>
    {
        return hi >= -0.5 && lo <= top.length + 0.5;
    }).sort((x, y) => { return x[0] - y[0]; });
    if (carriers.length < 2)
    {
        return top.length;
    }
    let widest = 0;
    let reach = carriers[0]![1];
    for (const [lo, hi] of carriers.slice(1))
    {
        widest = Math.max(widest, lo - reach);
        reach = Math.max(reach, hi);
    }
    return widest;
}


// A top carried by the carcass screwed on it : its deflection read off the simulation of the whole piece, the note
// saying where it comes from and the check reading the note
export function simulatedDeflection(p: Part, ownSag: number, source: string, span = p.length): Deflection | null
{
    const m = MATERIALS[p.material];
    if (m === undefined)
    {
        return null;
    }
    const note = workOut({
        id: `fleche/${p.id}`, title: `Flèche de ${p.label}`, subject: { kind: "part", id: p.id, item: p.item },
        method: "Simulation par éléments finis du meuble entier : le dessus est porté par le caisson vissé dessus",
        hypotheses: ["Fixations soudées rigides, contacts entre panneaux en compression seule",
                     "Flèche propre : chaque point contre la droite qui joint les deux bouts de sa ligne, le long du "
                         + "panneau",
                     `Panneaux à la masse volumique de contrôle (${m.densityCheck} kg/m^3 ici, contre ${m.density} dans `
                         + "une note de poutre) : un poids plus fort, du côté sûr"],
        inputs: [
            // The widest clear gap between its carriers, its own length only when nothing stands under it but its ends
            { name: "portee", label: "Plus grande portée libre entre ses appuis", value: span, unit: "mm",
              source: "Modèle", ...span === p.length ? { link: { part: p.id, size: "length" as const } } : {} },
            { name: "fleche_sim", label: "Flèche propre simulée", value: ownSag, unit: "mm", source, result: "fem" },
            { name: "kdef", label: "Coefficient de fluage", value: m.kdef, unit: "-", source: m.source },
            { name: "part_admise", label: "Flèche admise, part de la portée", value: SHELF_DEFLECTION_LIMIT, unit: "-",
              source: "UNI 11663, reprise par convention pour un dessus" },
        ],
        steps: [
            { name: "fleche", label: "Flèche instantanée", formula: "fleche_sim", unit: "mm",
              source: "Lue dans la simulation" },
            { name: "fleche_fin", label: "Flèche à long terme", formula: "fleche * (1 + kdef)", unit: "mm",
              source: "EN 1995-1-1:2004, 2.3.2.2, information seulement" },
            { name: "fleche_adm", label: "Flèche admise", formula: "part_admise * portee", unit: "mm",
              source: "UNI 11663" },
        ],
        check: { value: "fleche", limit: "fleche_adm" },
        // Rigid fasteners give the least it can bend : under the limit only points that way, over it fails for sure
        indicative: true,
        phrases: { pass: "Indicatif : sous la flèche admise avec des fixations supposées rigides, conformité non "
                       + "établie tant que leur raideur n'est pas justifiée",
                   fail: "Non conforme : au-delà de la flèche admise même avec des fixations rigides",
                   stale: "Périmé : le meuble a changé depuis la simulation, la refaire (scripts/fem_meuble.py)" },
    });
    return { part: p.id, span, instant: valueOf(note, "fleche"), final: valueOf(note, "fleche_fin"),
             limit: valueOf(note, "fleche_adm"), note };
}


export function itemMass(b: Build, itemId: string): number
{
    let kg = 0;
    for (const p of b.parts)
    {
        if (p.item === itemId)
        {
            kg += partMass(p, false);
        }
    }
    return kg;
}


// Full extension runners : an open drawer reaches the depth of its carcass past the front
export function topDrawerExtension(c: Carcass): number
{
    for (const f of c.fronts)
    {
        if (f.spec.type === "drawers")
        {
            return c.depth;
        }
    }
    return 0;
}


export interface Tipping
{
    item: string;
    massKg: number;
    // Vertical force at the lever point that tips the carcass over its front feet, in kg
    criticalKg: number;
    leverFrom: "tiroir ouvert" | "chant avant";
    // Horizontal pull at the top edge that tips it, in kg force
    pullKg: number;
}


// Centre of mass from part centres, tipping edge on the front feet line, loda at the fully open top drawer
export function tipping(c: Carcass, b: Build, frontFootInset: number, drawerExtension: number): Tipping | null
{
    if (c.base.type === "wall")
    {
        return null;
    }
    let m = 0;
    let mz = 0;
    for (const p of b.parts)
    {
        if (p.item !== c.id || p.frame === null)
        {
            continue;
        }
        const mass = partMass(p, false);
        const centre = at(p.frame!, p.length / 2, p.width / 2, p.thickness / 2);
        m += mass;
        mz += mass * centre[2];
    }
    if (m <= 0)
    {
        return null;
    }
    const zCg = mz / m;
    const zEdge = c.z + c.depth - frontFootInset;
    const zLoad = drawerExtension > 0 ? c.z + c.depth + drawerExtension : c.z + c.depth;
    const lever = zLoad - zEdge;
    const resist = Math.max(0, zEdge - zCg);
    if (lever <= 0)
    {
        return null;
    }
    // Pull applied at the top edge, tipping about the front feet which stand on the floor
    const arm = c.height + baseHeightOf(c);
    return {
        item: c.id,
        massKg: m,
        criticalKg: m * resist / lever,
        leverFrom: drawerExtension > 0 ? "tiroir ouvert" : "chant avant",
        pullKg: m * resist / arm,
    };
}


function baseHeightOf(c: Carcass): number
{
    return c.base.type === "plinth" || c.base.type === "feet" ? c.base.height : 0;
}
