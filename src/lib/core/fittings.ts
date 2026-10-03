// Masses, sliding leaves, shelf pins and base : hardware lines and drilling, the joints live in joints.ts

import type { Carcass, Settings } from "./model";
import type { ResolvedLayout } from "./layout";
import type { FrontPanel } from "./fronts";
import { sideFace } from "./locate";
import { byId } from "./edit";
import { X, polygonArea, tessellate } from "./geometry";
import type { Build, Part } from "./parts";
import { SLIDELINE_M } from "../data/rules";
import {
    AXILO_ADJUST_MAX_CABINET, AXILO_LOAD_PER_FOOT, GLASS_SUPPORTS, SHELF_SUPPORTS, type ShelfSupport,
} from "../data/hardware";
import { FOOT_INSET, feetFitted, feetPerRow, footFor, footPlaces, frontFootInset, sideFootInset } from "./feet";
import { decorById, MATERIALS, materialOfDecor } from "../data/materials";
import { DIAM } from "./text";
import { PIN_BELOW_SHELF, holeLine, nearestHole, symmetricHeights } from "./grid";


// Workshop conventions, stated in the drawings as such
const PIN_SPARE_HOLES = 3;


export function partMass(p: Part, check: boolean): number
{
    const m = MATERIALS[p.material];
    const rho = m === undefined ? 700 : check ? m.densityCheck : m.density;
    // the real outline, a quarter disc or a panel under a slope weighs less than its blank, less its openings
    let area = polygonArea(tessellate(p.outline));
    for (const c of p.cutouts ?? [])
    {
        area -= polygonArea(tessellate(c));
    }
    return area * p.thickness * 1e-9 * rho * p.quantity;
}


export function panelMass(fp: FrontPanel, check: boolean): number
{
    const m = materialOfDecor(decorById(fp.decor));
    return fp.rect.w * fp.rect.h * fp.thickness * 1e-9 * (check ? m.densityCheck : m.density);
}


export function fitSliding(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    for (const front of c.fronts)
    {
        if (front.spec.type !== "sliding")
        {
            continue;
        }
        const nb = lay.nodes.get(front.node)!;
        const leaves: FrontPanel[] = [];
        let total = 0;
        for (const p of b.fronts.get(c.id) ?? [])
        {
            if (p.front === front.id)
            {
                leaves.push(p);
                total += p.rect.w;
            }
        }
        total += (leaves.length - 1) * s.frontGap;
        const L = SLIDELINE_M;
        const minW = front.spec.damped ? L.minWidthDamped : L.minWidth;
        for (const lp of leaves) 
        {
            const kg = panelMass(lp, true);
            const name = `${c.name}, vantail ${lp.number}`;
            if (lp.rect.w < minW || lp.rect.w > L.maxWidth)
            {
                b.errors.push(`${name} : largeur ${Math.round(lp.rect.w)} mm hors de ${minW} à ${L.maxWidth} `
                    + "(SlideLine M).");
            }
            if (lp.rect.h > L.maxHeight || lp.rect.h > L.heightToWidth * lp.rect.w)
            {
                b.errors.push(`${name} : hauteur ${Math.round(lp.rect.h)} mm, maxi ${L.maxHeight} `
                    + "et 2 x la largeur (SlideLine M).");
            }
            if (kg > L.maxKg)
            {
                b.errors.push(`${name} : ${kg.toFixed(1)} kg, 30 kg maxi (SlideLine M).`);
            }
            if (lp.thickness < L.minThickness || lp.thickness > L.maxThickness)
            {
                b.errors.push(`${name} : épaisseur ${lp.thickness} mm hors de 16 à 25 (SlideLine M).`);
            }
            b.hardware.push({ ref: front.spec.damped ? "9156338" : "9156339", qty: 1, item: c.id, itemName: c.name,
                             target: lp.id, note: null });
        }
        if (!L.shelfThicknesses.includes(c.thickness))
        {
            b.errors.push(`${c.name} : profilés SlideLine M indisponibles pour ${c.thickness} mm d'étagère.`);
        }
        const track = nb.w + 2 * c.thickness;
        if (total >= track - 50)
        {
            b.errors.push(`${c.name} : les vantaux couvrent toute la voie de ${Math.round(track)} mm `
                + "et ne peuvent plus coulisser (une seule voie en applique).");
        }
        // laid from the left on their single track : opening pushes them all right into the free length
        for (const lp of leaves)
        {
            b.motions.push({
                item: c.id, front: front.id, label: `${c.name}, vantail ${lp.number}`, kind: "slide",
                pivot: [0, 0, 0], axis: X, amount: Math.max(0, track - total), parts: [`${c.id}/front/${lp.id}`],
                fitted: [], rides: [], source: `SlideLine M, ${Math.round(track - total)} mm de voie libre`,
                remedy: "Réduire la largeur des vantaux.",
            });
        }
        b.hardware.push({ ref: track <= 2500 ? "9209167" : "9209218", qty: 1, item: c.id, itemName: c.name,
                         target: front.id, note: `profilés haut et bas recoupés à ${Math.round(track)} mm` });
    }
}


export function fitShelfPins(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{   
    for (const d of lay.dividers)
    {
        const shelf = d.axis === "h" && d.kind === "adjustable" ? byId(b.parts, `${c.id}/div/${d.id}`) : undefined;
        if (shelf === undefined)
        {
            continue;
        }
        const loadKg = shelf.length * shelf.width * 1e-4 * s.shelfLoad + partMass(shelf, true);
        let sup: ShelfSupport | undefined;
        if (shelf.material === "glass")
        {
            const ref = GLASS_SUPPORTS[shelf.thickness];
            sup = ref === undefined ? undefined : { ref, label: "", kgFor4: Infinity };
        }
        // the support the user chose, or the first one carrying the shelf
        const asked = SHELF_SUPPORTS.find((x) =>
        {
            return x.ref === c.pins;
        });
        if (asked !== undefined && shelf.material !== "glass" && asked.kgFor4 < loadKg)
        {
            b.errors.push(`${c.name}, ${shelf.label.toLowerCase()} : ${loadKg.toFixed(1)} kg, le taquet ${asked.ref} `
                + `porte ${asked.kgFor4} kg pour 4 (Häfele p. 7.158). Choisir un taquet plus fort ou le choix automatique.`);
            continue;
        }
        for (const x of shelf.material === "glass" ? [] : asked !== undefined ? [asked] : SHELF_SUPPORTS)
        {
            if (sup === undefined && x.kgFor4 >= loadKg)
            {
                sup = x;
            }
        }
        if (sup === undefined)
        {
            b.errors.push(`${c.name}, ${shelf.label.toLowerCase()} : ${loadKg.toFixed(1)} kg, `
                + `au-delà des taquets ${DIAM}5 sourcés (150 kg pour 4), ou verre sans support sourcé.`);
            continue;
        }
        b.hardware.push({ ref: sup.ref, qty: 4, item: c.id, itemName: c.name, target: shelf.id,
                         note: shelf.material === "glass" ? `charge d'essai ${loadKg.toFixed(1)} kg, aucune charge admise `
                             + "publiée pour ce support" : `charge d'essai ${loadKg.toFixed(1)} kg` });
        const node = { id: d.split, kind: "cell" as const, parent: null, x: d.x, y: d.y, w: d.w, h: d.h,
                      left: "outer" as const, right: "outer" as const, bottom: "outer" as const,
                      top: "outer" as const, walls: { left: c.thickness, right: c.thickness, bottom: d.h, top: d.h } };
        // within a millimetre of the line (whole mm heights against a line on half mm) the pins go in its holes
        // an older project may hold a shelf typed off it : its pins stay under it and the line is told
        const line = holeLine(c, s, nearestHole(c, s, d.y - PIN_BELOW_SHELF));
        const onLine = s.grid > 0 && Math.abs(line + PIN_BELOW_SHELF - d.y) <= 1;
        const yPin = onLine ? line : d.y - PIN_BELOW_SHELF;
        if (s.grid > 0 && !onLine)
        {
            b.warnings.push(`${c.name}, ${shelf.label.toLowerCase()} : à ${Math.round(d.y)} mm, hors des trous du `
                + `système 32. La déplacer à ${Math.round(line + PIN_BELOW_SHELF)} mm pour qu'elle repose sur la série.`);
        }
        const rows = [37, c.depth - lay.zBack - 37];
        for (const side of ["left", "right"] as const)
        {
            const face = sideFace(c, lay, b, node, side);
            if (face === null)
            {
                continue;
            }
            let k = -PIN_SPARE_HOLES;
            while (k <= PIN_SPARE_HOLES)
            {
                for (const v of rows)
                {
                    // two shelves of a column share their spare holes, a hole carrying a pin keeps saying so
                    const u = yPin + k * s.grid - face.uOrigin;
                    const label = k === 0 ? `Taquet ${sup.ref}` : `Réglage étagère ${DIAM}5`;
                    const there = face.part.holes.find((h) =>
                    {
                        return h.face === face.face && Math.abs(h.u - u) < 0.01 && Math.abs(h.v - v) < 0.01;
                    });
                    if (there === undefined)
                    {
                        face.part.holes.push({ u, v, diameter: 5, depth: s.pinDepth, face: face.face, label });
                    }
                    else if (k === 0 && there.label.startsWith("Embase"))
                    {
                        // the hole is a hinge plate's : the shelf cannot rest there
                        b.warnings.push(`${c.name}, ${shelf.label.toLowerCase()} : son taquet tombe dans un trou `
                            + "d'embase de charnière. La monter ou la descendre d'un cran de la série.");
                    }
                    else if (k === 0)
                    {
                        there.label = label;
                    }
                }
                k++;
            }
        }
    }
}


// A carcass drilled with the line : whether it ends on the axis of the top as it starts on that of the bottom
export function lineSymmetry(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    const drilled = c.modularCells.length > 0 || lay.dividers.some((d) =>
    {
        return d.axis === "h" && d.kind === "adjustable";
    });
    const heights = drilled ? symmetricHeights(c, s) : null;
    if (heights !== null)
    {
        b.infos.push(`${c.name} : la série de trous ne finit pas à l'axe du dessus comme elle part de celui du `
            + `dessous. Hauteur de caisson ${heights[0]} ou ${heights[1]} mm pour un motif symétrique (système 32).`);
    }
}


// A modular cell has a pin hole at every height a shelf may rest on : under each grid position, as long as
// a shelf still fits below the top of the cell
export function fitModularRows(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    const shelf = c.shelfThickness ?? c.thickness;
    const rows = [37, c.depth - lay.zBack - 37];
    for (const id of c.modularCells)
    {
        const nb = lay.nodes.get(id);
        if (nb === undefined || nb.kind !== "cell")
        {
            continue;
        }
        if (s.grid <= 0)
        {
            b.errors.push(`${c.name} : une case modulable se perce au pas de la grille, réglée à 0. Rétablir la grille.`);
            continue;
        }
        const ys: number[] = [];
        // every hole of the line inside the cell, while a shelf resting on it still fits under the cell top
        let n = Math.ceil((nb.y + 5 / 2 - c.thickness / 2) / s.grid);
        while (holeLine(c, s, n) + PIN_BELOW_SHELF + shelf <= nb.y + nb.h)
        {
            const pin = holeLine(c, s, n);
            if (pin - 5 / 2 > nb.y)
            {
                ys.push(pin);
            }
            n++;
        }
        for (const side of ["left", "right"] as const)
        {
            const face = sideFace(c, lay, b, nb, side);
            if (face === null)
            {
                b.errors.push(`${c.name} : case modulable sans paroi pleine hauteur à ${side === "left" ? "gauche"
                    : "droite"}, la série n'y est pas percée. Prolonger le montant ou décocher la case.`);
                continue;
            }
            for (const y of ys)
            {
                for (const v of rows)
                {
                    const u = y - face.uOrigin;
                    const drilled = face.part.holes.some((h) =>
                    {
                        return h.face === face.face && Math.abs(h.u - u) < 0.01 && Math.abs(h.v - v) < 0.01;
                    });
                    if (!drilled)
                    {
                        face.part.holes.push({ u, v, diameter: 5, depth: s.pinDepth, face: face.face,
                                               label: `Série ${DIAM}5, case modulable` });
                    }
                }
            }
            const note = `Série de trous ${DIAM}5 au pas de ${s.grid} (case modulable)`;
            if (!face.part.notes.includes(note))
            {
                face.part.notes.push(note);
            }
        }
    }
}


// Connector positions along a joint : at the inset from both ends, spread so that no gap excees `max`
export function spread(length: number, inset: number, max: number): number[]
{
    if (length <= 2 * inset)
    {
        return [length / 2];
    }
    const a = inset;
    const z = length - inset;
    const n = Math.max(1, Math.ceil((z - a) / max)); 
    const out: number[] = [];
    let k = 0;
    while (k <= n)
    {
        out.push(a + (z - a) * k / n);
        k++;
    }
    return out;
}


export function fitBase(c: Carcass, totalKg: number, b: Build): void
{
    if (c.base.type === "plinth" || c.base.type === "feet")
    {
        const h = c.base.height;
        const foot = footFor(h);
        if (foot === undefined)
        {
            b.errors.push(`${c.name} : hauteur de socle ${h} mm hors de la gamme AXILO 78 (53 à 200).`);
            return;
        }
        const perRow = feetPerRow(c);
        const count = 2 * perRow;
        const perFoot = `${(totalKg / count).toFixed(0)} kg par pied chargé, ${AXILO_LOAD_PER_FOOT} kg admis`;
        b.hardware.push({ ref: "637.76.333", qty: count, item: c.id, itemName: c.name, target: null, note: null });
        b.hardware.push({ ref: foot.ref, qty: count, item: c.id, itemName: c.name, target: null,
                         note: `réglage ${foot.min}-${foot.max} mm, ${perFoot}` });
        b.infos.push(`${c.name} : ${count} pieds AXILO 78 H${foot.height}, ${perFoot} (Häfele p. 11.43A), réglage `
            + `sous charge jusqu'à ${AXILO_ADJUST_MAX_CABINET} kg de meuble.`);
        b.fitted.push(...feetFitted(c, foot.ref));
        if (c.base.type === "plinth")
        {
            // the front row carries the front plinth, the front and back feet of a side its return
            const returns = (c.base.returns ?? []).length;
            b.hardware.push({ ref: "637.38.054", qty: perRow + 2 * returns, item: c.id, itemName: c.name, target: null,
                             note: returns > 0 ? `${perRow} en façade, 2 par retour` : null });
        }
        if (totalKg / count > AXILO_LOAD_PER_FOOT)
        {
            b.errors.push(`${c.name} : ${(totalKg / count).toFixed(0)} kg par pied, `
                + `${AXILO_LOAD_PER_FOOT} kg maxi (AXILO 78).`);
        }
        const bottom = byId(b.parts, `${c.id}/bottom`);
        if (bottom !== undefined)
        {
            if (totalKg > AXILO_ADJUST_MAX_CABINET)
            {
                bottom.notes.push(`Meuble de ${totalKg.toFixed(0)} kg chargé : régler les pieds AXILO `
                    + "avant chargement (réglage sous charge limité à 80 kg)");
            }
            const label = `Embase AXILO 637.76.333, vis ${DIAM}4 (axe à ${sideFootInset(c, "left")} mm de la joue `
                + `gauche, ${sideFootInset(c, "right")} de la droite, ${FOOT_INSET} du fond, `
                + `${frontFootInset(c)} mm de l'avant, convention)`;
            for (const f of footPlaces(c))
            {
                const u = f.x - c.x - c.thickness;
                bottom.holes.push({ u: Math.min(Math.max(u, 20), bottom.length - 20), v: c.z + c.depth - f.z,
                                    diameter: 0, depth: 0, face: "B", label });
            }
        }
    }
    else if (c.base.type === "wall" && c.base.hanger === "camar")
    {
        b.hardware.push({ ref: "CAMAR_807", qty: 2, item: c.id, itemName: c.name, target: null,
                         note: "un droit et un gauche, avec leurs plaques murales anti-décrochage, référence de chaque "
                             + `côté chez le distributeur, douilles ${DIAM}10 percées d'après la notice Camar` });
        b.infos.push(`${c.name} : suspendu par deux reggibases Camar 807, ${totalKg.toFixed(0)} kg chargé pour 240 kg `
            + "admis la paire (120 kg la pièce, Camar).");
        if (totalKg > 240)
        {
            b.errors.push(`${c.name} : ${totalKg.toFixed(0)} kg suspendus, une paire de reggibases Camar 807 porte `
                + "240 kg. Alléger le meuble ou le poser au sol.");
        }
    }
    else if (c.base.type === "wall")
    {
        b.hardware.push({ ref: "48N0510.02", qty: 1, item: c.id, itemName: c.name, target: null, note: null });
        b.hardware.push({ ref: "48N0510.03", qty: 1, item: c.id, itemName: c.name, target: null, note: null });
        b.infos.push(`${c.name} : suspendu par une paire de ferrures Blum 48N0510, ${totalKg.toFixed(0)} kg `
            + "chargé pour 130 kg admis (Blum p. 586).");
        if (totalKg > 130)
        {
            b.errors.push(`${c.name} : ${totalKg.toFixed(0)} kg suspendus, une paire de ferrures 48N0510 `
                + "porte 130 kg (Blum p. 586). Alléger le meuble ou le poser au sol.");
        }
    }
}

