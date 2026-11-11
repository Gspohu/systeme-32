// Masses, sliding leaves, shelf pins and base : hardware lines and drilling, the joints live in joints.ts

import type { Carcass, Settings } from "./model";
import { frontSetback, type ResolvedLayout } from "./layout";
import type { FrontPanel } from "./fronts";
import { sideFace, type FaceRef } from "./locate";
import { byId } from "./edit";
import { at, neg, X, polygonArea, tessellate, type Vec3 } from "./geometry";
import { screwOf } from "../data/screws";
import type { Build, Part, Purpose } from "./part_types";
import { SLIDELINE_M, TIPON_ADAPTER } from "../data/rules";
import {
    GLASS_SUPPORTS, SHELF_SUPPORTS, type ShelfSupport,
} from "../data/hardware";
import { AXILO_CLIP_SCREWS, AXILO_SCREW_PITCH, AXILO_SCREWS, FOOT_INSET, feetFitted, feetPerRow, footFor, footPlaces,
    AXILO_SCREW_OFFSET, footLong, frontFootInset, sideFootInset } from "./feet";
import { decorById, MATERIALS, materialOfDecor } from "../data/materials";
import { DIAM } from "./text";
import { PIN_BELOW_SHELF, holeLine, nearestHole, symmetricHeights } from "./grid";
import { metHole } from "./drilling";


// Workshop conventions, stated in the drawings as such
export const PIN_SPARE_HOLES = 2;
// Häfele p. 7.158 : the lug Ø4.8 x 5 of these pins, 10.45 off the side in its model, a hole with room for it
const PIN_WITH_LUG = new Set(["282.24.727", "282.24.728"]);
const PIN_LUG_OFF = 10.45;
const PIN_LUG_HOLE = { diameter: 5, depth: 6 };

// Holes of a hinge plate a shelf pin may land in, on the side the hinges are fixed to
const PLATE_HOLES = new Set<Purpose>(["plate-dowel", "plate-screw"]);


export function partMass(p: Part, check: boolean): number
{
    const m = MATERIALS[p.material];
    const rho = m === undefined ? 700 : check ? m.densityCheck : m.density;
    // The real outline, a quarter disc or a panel under a slope weighs less than its blank, less its openings
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
                             target: lp.id, note: null, purpose: "sliding" });
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
        // Laid from the left on their single track : opening pushes them all right into the free length
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
                         target: front.id, note: `profilés haut et bas recoupés à ${Math.round(track)} mm`,
                         purpose: "sliding" });
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
        // The support the user chose, or the first one carrying the shelf
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
                             + "publiée pour ce support" : `charge d'essai ${loadKg.toFixed(1)} kg`,
                         purpose: "shelf-support" });
        const node = { id: d.split, kind: "cell" as const, parent: null, x: d.x, y: d.y, w: d.w, h: d.h,
                      left: "outer" as const, right: "outer" as const, bottom: "outer" as const,
                      top: "outer" as const, walls: { left: c.thickness, right: c.thickness, bottom: d.h, top: d.h } };
        // Within a millimetre of the line (whole mm heights against a line on half mm) the pins go in its holes
        // an older project may hold a shelf typed off it : its pins stay under it and the line is told
        const line = holeLine(c, s, nearestHole(c, s, d.y - PIN_BELOW_SHELF));
        const onLine = s.grid > 0 && Math.abs(line + PIN_BELOW_SHELF - d.y) <= 1;
        const yPin = onLine ? line : d.y - PIN_BELOW_SHELF;
        if (s.grid > 0 && !onLine)
        {
            b.warnings.push(`${c.name}, ${shelf.label.toLowerCase()} : à ${Math.round(d.y)} mm, hors des trous du `
                + `système 32. La déplacer à ${Math.round(line + PIN_BELOW_SHELF)} mm pour qu'elle repose sur la série.`);
        }
        // The front row 37 in from the front of the wall it's drilled in, and kept as far behind the front of a
        // shelf standing back as it's behind one at the setback of the settings
        const sb = frontSetback(d, s.shelfFrontSetback);
        for (const side of ["left", "right"] as const)
        {
            const face = sideFace(c, lay, b, node, side);
            if (face === null)
            {
                continue;
            }
            const frontRow = Math.max(face.vOrigin + 37, sb + 37 - s.shelfFrontSetback);
            const backRow = c.depth - lay.zBack - 37;
            if (frontRow >= backRow)
            {
                b.errors.push(`${c.name}, ${shelf.label.toLowerCase()} : en retrait de ${sb} mm, ses taquets avant `
                    + "passeraient derrière ceux du fond. Réduire le retrait.");
                break;
            }
            const rows = [frontRow - face.vOrigin, backRow - face.vOrigin];
            if (shelf.frame !== null && PIN_WITH_LUG.has(sup.ref))
            {
                // The lug of the pin stands in the underside of the shelf : level with its row, in from the end
                // of the shelf
                const clear = s.shelfSideClearance;
                for (const v of rows)
                {
                    const z = at(face.part.frame!, yPin - face.uOrigin, v, 0)[2];
                    shelf.holes.push({ u: side === "left" ? PIN_LUG_OFF - clear : shelf.length - PIN_LUG_OFF + clear,
                                       v: shelf.frame.o[2] - z, diameter: PIN_LUG_HOLE.diameter, depth: PIN_LUG_HOLE.depth,
                                       face: shelf.frame.n[1] < 0 ? "B" : "A", label: `Ergot du taquet ${sup.ref} : ${DIAM}${
                                           PIN_LUG_HOLE.diameter} x ${PIN_LUG_HOLE.depth}`, purpose: "shelf-lug" });
                }
            }
            let k = -PIN_SPARE_HOLES;
            while (k <= PIN_SPARE_HOLES)
            {
                for (const v of rows)
                {
                    drillPinHole(face, yPin + k * s.grid - face.uOrigin, v, k, sup.ref,
                                 `${c.name}, ${shelf.label.toLowerCase()}`, s, b);
                }
                k++;
            }
        }
    }
}


// The hole k steps of the series from a shelf's pin (k = 0 the pin itself). Two shelves of a column share their
// spare holes, a hole carrying a pin keeps saying so. Off the spot of any hole, a pin or a spare hole may still
// drill into one, a screw 3 mm away
function drillPinHole(face: FaceRef, u: number, v: number, k: number, supportRef: string, who: string, s: Settings,
                      b: Build): void
{
    const label = k === 0 ? `Taquet ${supportRef}` : `Réglage étagère ${DIAM}5`;
    const there = face.part.holes.find((h) =>
    {
        return h.face === face.face && Math.abs(h.u - u) < 0.01 && Math.abs(h.v - v) < 0.01;
    });
    const hit = there === undefined ? metHole(face.part, face.face, u, v, 5, s.pinDepth) : undefined;
    const met = there ?? hit;
    const move = "La monter ou la descendre d'un cran de la série.";
    if (k === 0 && met !== undefined && PLATE_HOLES.has(met.purpose))
    {
        // The hole is a hinge plate's : the shelf can't rest there
        b.warnings.push(`${who} : son taquet tombe dans un trou d'embase de charnière. ${move}`);
    }
    else if (k === 0 && met !== undefined && met.purpose === "adapter-screw")
    {
        b.warnings.push(`${who} : son taquet tombe dans un trou de l'embase TIP-ON ${TIPON_ADAPTER.ref}. ${move}`);
    }
    else if (k === 0 && hit !== undefined)
    {
        b.warnings.push(`${who} : son taquet perce un autre trou (${hit.label}). ${move}`);
    }
    else if (there === undefined)
    {
        face.part.holes.push({ u, v, diameter: 5, depth: s.pinDepth, face: face.face, label,
                               purpose: k === 0 ? "shelf-pin" : "pin-spare" });
        if (hit !== undefined)
        {
            b.warnings.push(`${who} : un trou de réglage de sa série, ${k > 0 ? "au-dessus" : "au-dessous"} de `
                + `${Math.abs(k)} cran(s), perce un autre trou (${hit.label}). Il ne pourra pas recevoir de taquet.`);
        }
    }
    else if (k === 0)
    {
        there.label = label;
        there.purpose = "shelf-pin";
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
        // Every hole of the line inside the cell, while a shelf resting on it still fits under the cell top
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
                                               label: `Série ${DIAM}5, case modulable`, purpose: "pin-spare" });
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


// The screws of an applied back, round its edge and along every fixed panel behind it. A long carcass works as a
// beam through its back : closer screws. Workshop conventions, no maker gives these pitches
const BACK_SCREW_PITCH = 900;
const BACK_SCREW_PITCH_LONG = 600;
const BACK_LONG_FROM = 1000;
// The first screw of a row off its ends, workshop convention
const BACK_SCREW_END = 40;
const BACK_SCREW_SHIFTS = [0, 20, -20, 40, -40];

export function fitBackScrews(c: Carcass, lay: ResolvedLayout, b: Build): void
{
    const back = byId(b.parts, `${c.id}/back`);
    if (back === undefined || c.back.type !== "applied")
    {
        return;
    }
    // Long either way : a column of 1810 held to the wall through its back is the beam a wide carcass is
    const pitch = Math.max(c.width, c.height) > BACK_LONG_FROM ? BACK_SCREW_PITCH_LONG : BACK_SCREW_PITCH;
    // On the centre of each board the back lies on : around the carcass, then on the fixed shelves and uprights
    const mid = c.thickness / 2;
    const runs: [number, number, number, number][] = [
        [mid, mid, c.width - mid, mid], [mid, c.height - mid, c.width - mid, c.height - mid],
        [mid, mid, mid, c.height - mid], [c.width - mid, mid, c.width - mid, c.height - mid],
    ];
    for (const d of lay.dividers)
    {
        if (d.kind === "fixed")
        {
            runs.push(d.axis === "v" ? [d.x + d.w / 2, d.y, d.x + d.w / 2, d.y + d.h]
                : [d.x, d.y + d.h / 2, d.x + d.w, d.y + d.h / 2]);
        }
    }
    const qty = screwBack(c, back, runs, pitch, b);
    back.notes.push(`Vis 4 x 30 tous les ${pitch} mm sur le pourtour et sur chaque tablette et montant fixes, soit ${qty} vis`);
    b.hardware.push({ ref: "SCREW_4x30", qty, item: c.id, itemName: c.name, target: back.id, note: "fond rapporté",
                      purpose: "back-screw" });
    // The back of a rounded end lies on the shaped boards, one row along the back edge of each
    for (const side of ["left", "right"])
    {
        const prefix = `${c.id}/end/${side}/`;
        const endBack = byId(b.parts, `${prefix}back`);
        if (endBack === undefined)
        {
            continue;
        }
        const x0 = endBack.frame!.o[0] - c.x;
        const endRuns = b.parts.filter((q) =>
        {
            return q.id.startsWith(prefix) && q.frame !== null && (q.role === "endPanel" || q.role === "former");
        }).map((q): [number, number, number, number] =>
        {
            const y = at(q.frame!, 0, 0, q.thickness / 2)[1] - c.y;
            return [x0, y, x0 + endBack.width, y];
        });
        const n = screwBack(c, endBack, endRuns, pitch, b);
        endBack.notes.push(`Vis 4 x 30 sur le chant arrière de chaque planche, soit ${n} vis`);
        b.hardware.push({ ref: "SCREW_4x30", qty: n, item: c.id, itemName: c.name, target: endBack.id,
                          note: "fond du bout arrondi", purpose: "back-screw" });
    }
}


// Screws along each run of the frame of the carcass, clear of the screws already there. How many were placed
function screwBack(c: Carcass, back: Part, runs: [number, number, number, number][], pitch: number, b: Build): number
{
    const f = back.frame!;
    // The screws of the carcass already placed : a back screw reaches 30 in, it keeps a screw's width off them
    const others = b.parts.filter((q) =>
    {
        return q.item === c.id && q.id !== back.id && q.frame !== null && q.curve === null;
    }).flatMap((q) =>
    {
        return q.holes.filter((h) =>
        {
            return (h.face === "A" || h.face === "B") && screwOf(h.purpose, h.label) !== null;
        }).map((h) =>
        {
            const way = h.face === "A" ? neg(q.frame!.n) : q.frame!.n;
            return { p: at(q.frame!, h.u, h.v, h.face === "A" ? 0 : q.thickness), way, spec: screwOf(h.purpose,
                h.label)! };
        });
    });
    const clearOfOthers = (x: number, y: number): boolean =>
    {
        return !others.some((o) =>
        {
            for (let d = 0; d <= o.spec.length; d += 2)
            {
                const q: Vec3 = [o.p[0] - o.way[0] * d, o.p[1] - o.way[1] * d, o.p[2] - o.way[2] * d];
                const off = Math.hypot(q[0] - (c.x + x), q[1] - (c.y + y));
                if (off < (4 + o.spec.diameter) / 2 + 2 && q[2] >= c.z && q[2] <= c.z + 30)
                {
                    return true;
                }
            }
            return false;
        });
    };
    let qty = 0;
    for (const [x0, y0, x1, y1] of runs)
    {
        const length = Math.hypot(x1 - x0, y1 - y0);
        for (const s of spread(length, BACK_SCREW_END, pitch))
        {
            const shift = BACK_SCREW_SHIFTS.find((d) =>
            {
                const k = Math.min(Math.max((s + d) / length, 0), 1);
                return clearOfOthers(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
            });
            if (shift === undefined)
            {
                continue;
            }
            const k = Math.min(Math.max((s + shift) / length, 0), 1);
            const q: Vec3 = [c.x + x0 + (x1 - x0) * k - f.o[0], c.y + y0 + (y1 - y0) * k - f.o[1], 0];
            const u = q[0] * f.u[0] + q[1] * f.u[1];
            const v = q[0] * f.v[0] + q[1] * f.v[1];
            const inHole = back.cutouts.some((o) =>
            {
                const r = o.segments[0]!;
                return r.kind === "arc" && Math.hypot(u - r.cx, v - r.cy) < Math.hypot(r.x - r.cx, r.y -
                    r.cy) + BACK_SCREW_END / 4;
            });
            if (!inHole)
            {
                back.holes.push({ u, v, diameter: 0, depth: 0, face: "B", label: "Vis 4 x 30 du fond",
                                  purpose: "back-screw" });
                qty++;
            }
        }
    }
    return qty;
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


// The base hardware and its drilling, what each foot or hanger then carries being checked once all is built
export function fitBase(c: Carcass, b: Build): void
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
        b.hardware.push({ ref: "637.76.333", qty: count, item: c.id, itemName: c.name, target: null, note: null,
                          purpose: "foot-mount" });
        b.hardware.push({ ref: foot.ref, qty: count, item: c.id, itemName: c.name, target: null,
                         note: `réglage ${foot.min}-${foot.max} mm`, purpose: "foot" });
        b.fitted.push(...feetFitted(c, foot.ref));
        if (c.base.type === "plinth")
        {
            // The front row carries the front plinth, the front and back feet of a side its return
            const returns = (c.base.returns ?? []).length;
            b.hardware.push({ ref: "637.38.054", qty: perRow + 2 * returns, item: c.id, itemName: c.name, target: null,
                             note: returns > 0 ? `${perRow} en façade, 2 par retour` : null, purpose: "plinth-clip" });
            b.hardware.push({ ref: "609.1500", qty: AXILO_CLIP_SCREWS * (perRow + 2 * returns),
                             item: c.id, itemName: c.name,
                              target: null, note: `${AXILO_CLIP_SCREWS} par clip de plinthe, non fournies`,
                              purpose: "plinth-clip" });
        }
        const bottom = byId(b.parts, `${c.id}/bottom`);
        if (bottom !== undefined)
        {
            const label = `Embase AXILO 637.76.333, vis ${DIAM}4 x 35 (axe du pied à ${sideFootInset(c, "left")} mm de la `
                + `joue gauche, ${sideFootInset(c, "right")} de la droite, ${FOOT_INSET} du fond, ${frontFootInset(c)} mm de `
                + `l'avant, convention, 4 vis sur un carré de ${AXILO_SCREW_PITCH} centré à ${AXILO_SCREW_OFFSET} de l'axe `
                + "vers le milieu du meuble, côté long de l'embase, Häfele p. 11.43A)";
            const half = AXILO_SCREW_PITCH / 2;
            for (const f of footPlaces(c))
            {
                const { dx, dz } = footLong(c, f);
                for (const [du, dv] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const)
                {
                    const u = f.x - c.x - c.thickness + dx * AXILO_SCREW_OFFSET + du;
                    const v = c.z + c.depth - f.z - dz * AXILO_SCREW_OFFSET + dv;
                    const met = metHole(bottom, "B", u, v, 4, 15);
                    if (u < 0 || u > bottom.length || v < 0 || v > bottom.width || met !== undefined)
                    {
                        b.errors.push(`${c.name} : une vis d'embase de pied ${met === undefined ? "sort du dessous"
                            : `tombe sur un perçage (${met.label})`}. Déplacer le pied ou le connecteur.`);
                        continue;
                    }
                    bottom.holes.push({ u, v, diameter: 0, depth: 0, face: "B", label, purpose: "foot-mount-screw",
                                        fixes: "637.76.333" });
                }
            }
            b.hardware.push({ ref: "SCREW_4x35", qty: AXILO_SCREWS * count, item: c.id, itemName: c.name,
                             target: bottom.id,
                              note: `${AXILO_SCREWS} par embase de pied, non fournies`, purpose: "foot-mount-screw" });
        }
    }
    else if (c.base.type === "wall" && c.base.hanger === "camar")
    {
        b.hardware.push({ ref: "CAMAR_807", qty: 2, item: c.id, itemName: c.name, target: null,
                         note: "un droit et un gauche, avec leurs plaques murales anti-décrochage, référence de chaque "
                             + `côté chez le distributeur, douilles ${DIAM}10 percées d'après la notice Camar`,
                         purpose: "wall-hanger" });
    }
    else if (c.base.type === "wall")
    {
        b.hardware.push({ ref: "48N0510.02", qty: 1, item: c.id, itemName: c.name, target: null, note: null,
                          purpose: "wall-hanger" });
        b.hardware.push({ ref: "48N0510.03", qty: 1, item: c.id, itemName: c.name, target: null, note: null,
                          purpose: "wall-hanger" });
    }
}

