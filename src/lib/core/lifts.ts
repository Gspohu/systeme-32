// Lift-up flaps on Blum AVENTOS HK top : mechanism choice, fit checks, bracket drilling and swing space

import type { Carcass, Front, Project } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import type { FrontPanel } from "./fronts";
import type { Check } from "./analysis";
import { findNode, subtreeIds } from "./layout";
import { sideFace } from "./locate";
import { byId } from "./edit";
import { panelMass } from "./fittings";
import { boxesMeet, boxToRoom, roomBox, type Box3 } from "./room";
import type { Build } from "./parts";
import { SPOT_RIM, spotCentres } from "./lights";
import { HK_TOP } from "../data/rules";


export interface FlapLoad
{
    // the front height stands for the cabinet height KH : an overlay flap covers its whole cell
    kh: number;
    kg: number;
    lf: number;
    handleKg: number;
}


export function flapLoad(front: Front, fp: FrontPanel): FlapLoad
{
    const handleKg = front.spec.type === "lift" && front.opening === "handle" ? front.spec.handleKg : 0;
    const kg = panelMass(fp, true) + 2 * handleKg;
    return { kh: fp.rect.h, kg, lf: fp.rect.h * kg, handleKg };
}


// The strongest mechanism whose range holds LF, as Blum advises where two ranges overlap
export function pickMechanism(lf: number): (typeof HK_TOP.mechanisms)[number] | null
{
    let best: (typeof HK_TOP.mechanisms)[number] | null = null;
    for (const m of HK_TOP.mechanisms)
    {
        if (lf >= m.lfMin && lf <= m.lfMax)
        {
            best = m;
        }
    }
    return best;
}


// Height the poen flap rise above the top face of the panel it hangs under
export function flapClearance(fp: FrontPanel, panelAbove: number): number
{
    return fp.rect.h * HK_TOP.clearanceFactor + fp.thickness - panelAbove;
}


function touchesTop(nb: NodeBox, cell: NodeBox): boolean
{
    return Math.abs(cell.y + cell.h - (nb.y + nb.h)) < 0.01;
}


export function fitLifts(c: Carcass, lay: ResolvedLayout, b: Build): void
{
    for (const fp of b.fronts.get(c.id) ?? [])
    {
        if (fp.role !== "flap")
        {
            continue;
        }
        const front = byId(c.fronts, fp.front)!;
        const nb = lay.nodes.get(fp.node)!;
        const part = byId(b.parts, `${c.id}/front/${fp.id}`)!;
        const name = `${c.name}, abattant`;
        const before = b.errors.length;
        if (front.mount === "inset")
        {
            b.errors.push(`${name} : l'AVENTOS HK top se monte en applique seulement (Blum p. 46). Choisir la pose en applique.`);
        }
        if (fp.rect.h < HK_TOP.minHeight - 0.01 || fp.rect.h > HK_TOP.maxHeight + 0.01)
        {
            b.errors.push(`${name} : hauteur ${Math.round(fp.rect.h)} mm hors de ${HK_TOP.minHeight} à `
                + `${HK_TOP.maxHeight} (AVENTOS HK top). Redécouper la zone ou choisir des portes.`);
        }
        if (fp.rect.w > HK_TOP.maxWidth + 0.01)
        {
            b.errors.push(`${name} : largeur ${Math.round(fp.rect.w)} mm, ${HK_TOP.maxWidth} maxi (AVENTOS HK top). `
                + "Scinder la zone par un montant.");
        }
        if (nb.h < HK_TOP.minInnerHeight - 0.01)
        {
            b.errors.push(`${name} : hauteur intérieure ${Math.round(nb.h)} mm, ${HK_TOP.minInnerHeight} mini pour loger `
                + "le mécanisme (Blum p. 46).");
        }
        const depth = lay.zFront - lay.zBack;
        if (depth < HK_TOP.minInnerDepth - 0.01)
        {
            b.errors.push(`${name} : profondeur intérieure ${Math.round(depth)} mm, ${HK_TOP.minInnerDepth} mini pour `
                + "le mécanisme (Blum p. 46). Approfondir le caisson.");
        }
        const overlay = fp.rect.y + fp.rect.h - (nb.y + nb.h);
        if (overlay > HK_TOP.maxTopOverlay + 0.01)
        {
            b.errors.push(`${name} : recouvrement haut ${overlay.toFixed(1)} mm, ${HK_TOP.maxTopOverlay} maxi (Blum p. 46).`);
        }
        if (nb.top === "outer" && c.slope !== null)
        {
            b.errors.push(`${name} : le mécanisme se cale sous un panneau horizontal, pas sous un dessus en pente. `
                + "Poser l'abattant dans une case sous une tablette fixe.");
        }
        const node = findNode(c.root, fp.node);
        const inside = new Set(node === null ? [] : subtreeIds(node));
        for (const d of lay.dividers)
        {
            const within = d.x >= nb.x - 0.01 && d.x + d.w <= nb.x + nb.w + 0.01 && d.y >= nb.y - 0.01
                && d.y + d.h <= nb.y + nb.h + 0.01;
            if (within && d.axis === "h" && d.y + d.h > nb.y + nb.h - HK_TOP.minInnerHeight)
            {
                b.errors.push(`${name} : une tablette à moins de ${HK_TOP.minInnerHeight} mm du haut heurte le `
                    + "mécanisme. La descendre ou la retirer.");
            }
        }
        for (const r of c.rails)
        {
            const cell = lay.nodes.get(r.cell);
            if (inside.has(r.cell) && cell !== undefined && touchesTop(nb, cell))
            {
                b.errors.push(`${name} : la tringle passe dans le mécanisme. Retirer la penderie de cette case.`);
            }
        }
        const faces = [sideFace(c, lay, b, nb, "left"), sideFace(c, lay, b, nb, "right")];
        if (faces[0] === null || faces[1] === null)
        {
            b.errors.push(`${name} : il faut une joue ou un montant continu de chaque côté pour les deux mécanismes.`);
        }
        const load = flapLoad(front, fp);
        if (load.kg > HK_TOP.maxKg)
        {
            b.errors.push(`${name} : ${load.kg.toFixed(1)} kg, ${HK_TOP.maxKg} kg maxi pour deux mécanismes (Blum p. 44). `
                + "Un troisième demanderait un montant central : diviser l'abattant ou alléger la façade.");
        }
        const mech = pickMechanism(load.lf);
        if (mech === null)
        {
            b.errors.push(`${name} : facteur de puissance LF = ${Math.round(load.lf)} (${Math.round(load.kh)} mm x `
                + `${load.kg.toFixed(2)} kg) hors de ${HK_TOP.mechanisms[0]!.lfMin} à `
                + `${HK_TOP.mechanisms[HK_TOP.mechanisms.length - 1]!.lfMax} (Blum p. 44).`);
        }
        if (b.errors.length > before || mech === null)
        {
            continue;
        }
        const push = front.opening === "push";
        const note = `LF ${Math.round(load.lf)} (${Math.round(load.kh)} mm x ${load.kg.toFixed(2)} kg`
            + `${load.handleKg > 0 ? ", poignée comptée deux fois" : ""})`;
        const line = (ref: string, qty: number, text: string | null): void =>
        {
            b.hardware.push({ ref, qty, item: c.id, itemName: c.name, target: fp.id, note: text });
        };
        line(push ? mech.push : mech.handle, 1, note);
        line("22K8000", 1, null);
        line("20S4200", 1, null);
        line("609.1500", 2 * HK_TOP.bracketScrews, "équerres de façade");
        if (push)
        {
            line("956.1004", 1, "sous le bord bas de l'abattant, position selon Blum p. 50");
            line("956.1201", 1, null);
        }
        if (!push && front.spec.type === "lift" && front.spec.handleKg === 0)
        {
            part.notes.push("Poids de poignée non saisi : il compte deux fois dans le choix du mécanisme");
        }
        // a flap is cut grain across : u runs along its width, v up its height
        for (const side of ["left", "right"] as const)
        {
            const u = side === "left" ? nb.x - fp.rect.x + HK_TOP.bracketInset
                : nb.x + nb.w - fp.rect.x - HK_TOP.bracketInset;
            let k = 0;
            while (k < HK_TOP.bracketScrews)
            {
                const y = nb.y + nb.h - HK_TOP.bracketFirst - k * HK_TOP.bracketPitch;
                part.holes.push({ u, v: y - fp.rect.y, diameter: 0, depth: 0, face: "A",
                                  label: "Équerre 20S4200 : vis 609.1500 (Blum p. 46)" });
                k++;
            }
        }
        for (const face of faces)
        {
            const text = "Mécanisme AVENTOS HK top : positionnement intégré, en butée sous le panneau du haut et "
                + "contre le chant avant, 4 vis 4 x 35 fournies (notice Blum)";
            if (face !== null && !face.part.notes.includes(text))
            {
                face.part.notes.push(text);
            }
        }
        const lift = flapClearance(fp, nb.walls.top);  
        part.notes.push(`Ouvert, l'abattant monte à ${Math.round(lift)} mm au-dessus du panneau du haut (Blum p. 46)`);
    }
}


// At full opening the flap stands in front of the carcass, rising above it : sin 17 deg = 0.29, Blum's Y factor
export function swingBox(c: Carcass, fp: FrontPanel, lay: ResolvedLayout): Box3
{
    const nb = lay.nodes.get(fp.node)!;
    const topFace = c.y + nb.y + nb.h + nb.walls.top;   
    const front = c.z + c.depth + fp.thickness;
    return {
        min: [c.x + fp.rect.x, c.y + fp.rect.y, front],
        max: [c.x + fp.rect.x + fp.rect.w, topFace + flapClearance(fp, nb.walls.top), front + fp.rect.h],  
    };
}


export function liftChecks(p: Project, b: Build): Check[]
{
    const checks: Check[] = [];
    for (const c of p.items)
    {
        if (c.kind !== "carcass")
        {
            continue;
        }
        const lay = b.layouts.get(c.id);
        for (const fp of b.fronts.get(c.id) ?? [])
        {
            if (fp.role !== "flap" || lay === undefined)
            {
                continue;
            }
            const front = byId(c.fronts, fp.front)!;
            const nb = lay.nodes.get(fp.node)!;
            const sweep = boxToRoom(c.wall, p.room, swingBox(c, fp, lay));
            for (const other of p.items)
            {
                if (other.id !== c.id && boxesMeet(roomBox(other, p.room), sweep))
                {
                    checks.push({ level: "error", item: c.id, target: front.id,
                                  message: `${c.name} : l'abattant ouvert heurte ${other.name}. Déplacer l'un des deux `
                                      + "ou choisir des portes." });
                }
            }
            if (front.opening === "handle" && front.spec.type === "lift" && front.spec.handleKg === 0)
            {
                checks.push({ level: "warning", item: c.id, target: front.id,
                              message: `${c.name} : poids de poignée de l'abattant non saisi. Blum le compte deux fois `
                                  + "dans le choix du mécanisme : le renseigner dans la façade." });
            }
            for (const l of c.lights)
            {
                const cell = lay.nodes.get(l.cell);
                const under = cell !== undefined && cell.x >= nb.x - 0.01 && cell.x + cell.w <= nb.x + nb.w + 0.01
                    && touchesTop(nb, cell);
                if (!under || l.setback >= HK_TOP.minInnerDepth)
                {
                    continue;
                }
                const edge = HK_TOP.housingWidth + SPOT_RIM / 2;
                const masked = l.kind === "strip" || spotCentres(cell!, l).some((x) =>
                {
                    return x - nb.x < edge || nb.x + nb.w - x < edge;
                });
                if (masked)
                {
                    const what = l.kind === "strip" ? "le profilé LED passe" : "des spots passent";
                    checks.push({ level: "warning", item: c.id, target: front.id,
                                  message: `${c.name} : ${what} au-dessus des mécanismes de l'abattant, qui en `
                                      + `masquent une part. Reculer l'éclairage à ${HK_TOP.minInnerDepth} mm ou plus.` });
                }
            }
        }
    }
    return checks;
}
