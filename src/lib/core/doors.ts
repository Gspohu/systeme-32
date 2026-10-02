// Hinged doors : Blum hinge chart, mniimum gap, hinge heights, cups, plates and TIP-ON drilling

import type { Carcass, Settings } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import { cupDistance, plateLine, type FrontPanel } from "./fronts";
import { sideFace } from "./locate";
import { byId } from "./edit";
import { panelMass } from "./fittings";
import type { Build, Hole, Part } from "./parts";
import {
    CUP_DEPTH, CUP_DIAMETER, HINGE_CHART, HINGE_CHART_WIDTH, MIN_GAP, MIN_GAP_FD, PLATE_LINE, TB_MAX, TB_MIN,
    TIPON_DOOR_SHORT_MAX_HEIGHT,
} from "../data/rules";
import { DIAM } from "./text";


// Workshop conventions, stated in the drawings as such
const PLATE_CLEARANCE = 25;
const TIPON_FROM_EDGE = 100;


export function hingeCount(height: number, kg: number): number | null
{
    for (const row of HINGE_CHART)
    {
        if (height <= row.maxHeight && kg <= row.maxKg)
        {
            return row.hinges;
        }
    }
    return null;
}


export function minGap(tb: number, fd: number): number | null
{
    const row = MIN_GAP[Math.min(TB_MAX, Math.max(TB_MIN, Math.round(tb)))];
    let k = 0;
    while (k < MIN_GAP_FD.length)  
    {
        if (MIN_GAP_FD[k]! >= fd)
        {
            return row === undefined ? null : row[k] ?? null;
        }
        k++;
    }
    return null;
}


// Heights of hinge axes on a door, local carcass y, moved off fixed shelves when they collide
export function hingeHeights(fp: FrontPanel, n: number, s: Settings,
    blocked: [number, number][]): { ys: number[]; moved: boolean }
{
    const lo = fp.rect.y + s.hingeEdgeDistance;
    const hi = fp.rect.y + fp.rect.h - s.hingeEdgeDistance;
    const free = (y: number): boolean =>
    {
        for (const [a, b] of blocked)
        {
            if (y + PLATE_CLEARANCE > a && y - PLATE_CLEARANCE < b)
            {
                return false;
            }
        }
        return true;
    };
    const ys: number[] = [];
    let moved = false;
    let k = 0;
    while (k < n)
    {
        const y = n === 1 ? (lo + hi) / 2 : lo + (hi - lo) * k / (n - 1);
        if (free(y))
        {
            ys.push(y);
        }
        else
        {
            moved = true;
            let at = y;
            let d = 1;
            while (d < 300 && at === y)
            {
                if (free(y + d) && y + d <= hi)
                {
                    at = y + d;
                }
                else if (free(y - d) && y - d >= lo)
                {
                    at = y - d;
                }
                d++;
            }
            ys.push(at);
        }
        k++;
    }
    return { ys, moved };
}


export function fitDoors(c: Carcass, lay: ResolvedLayout, s: Settings, b: Build): void
{
    for (const fp of b.fronts.get(c.id) ?? [])
    {
        if (fp.role !== "door")
        {
            continue;
        }
        const front = byId(c.fronts, fp.front)!;
        const nb = lay.nodes.get(fp.node)!;
        const part = byId(b.parts, `${c.id}/front/${fp.id}`)!;
        const kg = panelMass(fp, true);
        const hingeTotal = hingeCount(fp.rect.h, kg);
        const name = `${c.name}, ${part.label.toLowerCase()}`;
        if (hingeTotal === null)
        {
            b.errors.push(`${name} : ${Math.round(fp.rect.h)} mm et ${kg.toFixed(1)} kg dépassent `
                + "l'abaque Blum (2500 mm, 22 kg). Diviser la porte.");
            continue;
        }
        if (fp.rect.w > HINGE_CHART_WIDTH) 
        {
            part.notes.push(`Largeur ${Math.round(fp.rect.w)} mm : l'abaque Blum est établi pour 600 mm, `
                + "essai de montage conseillé");
        }
        if (fp.thickness > 26)
        {
            b.errors.push(`${name} : épaisseur ${fp.thickness} mm, 26 maxi pour CLIP top 110°.`);
        }
        const tb = fp.hingeKind === "inset" ? s.hingeTb : cupDistance(fp)!;
        if (tb < TB_MIN - 0.01 || tb > TB_MAX + 0.01)
        {
            b.errors.push(`${name} : distance de perçage TB = ${tb.toFixed(1)} mm hors de la plage Blum 3 à 7. `
                + "Ajuster le jeu extérieur ou le jeu entre façades.");
        }
        const gapMin = minGap(tb, fp.thickness);
        if (gapMin !== null && s.frontGap < gapMin)
        {
            b.errors.push(`${name} : jeu entre façades ${s.frontGap} mm, ${gapMin} mm mini pour TB `
                + `${tb.toFixed(1)} et ${fp.thickness} mm d'épaisseur (Blum p. 75).`);
        }
        const hingeSide = fp.hinge!;
        const face = sideFace(c, lay, b, nb, hingeSide);
        const blocked: [number, number][] = [];
        for (const d of lay.dividers)
        {
            const onHingeSide = hingeSide === "left"
                ? Math.abs(d.x - nb.x) < 0.01
                : Math.abs(d.x + d.w - nb.x - nb.w) < 0.01;
            if (d.axis === "h" && d.kind === "fixed" && onHingeSide)
            {
                blocked.push([d.y, d.y + d.h]);
            }
        }
        const { ys, moved } = hingeHeights(fp, hingeTotal, s, blocked);
        if (moved)
        {
            part.notes.push("Charnières décalées pour éviter une tablette fixe");
        }
        const cupV = tb + CUP_DIAMETER / 2;
        for (const y of ys)
        {
            part.holes.push({
                u: y - fp.rect.y,
                v: hingeSide === "left" ? cupV : fp.rect.w - cupV,
                diameter: CUP_DIAMETER, depth: CUP_DEPTH, face: "A",
                label: `Cuvette ${DIAM}35 x 13, TB ${tb.toFixed(1)}`,
            });
            if (face === null)
            {
                continue;
            }
            const line = plateLine(fp, PLATE_LINE);
            for (const dy of [-16, 16])
            {
                face.part.holes.push({ u: y + dy - face.uOrigin, v: line, diameter: 0, depth: 0, face: face.face,
                                      label: `Embase 173H7100 : vis ${DIAM}3,5 x 15` });
            }
        }
        if (face === null)
        {
            b.errors.push(`${name} : aucune joue ou montant continu côté charnières.`);
        }
        const push = front.opening === "push";
        const refs = { full: push ? "70T3550.TL" : "71B3550", twin: push ? "70T3650.TL" : "71B3650",
                      inset: push ? "70T3750.TL" : "71B3750" };
        const hingeRef = refs[fp.hingeKind!];
        b.hardware.push({ ref: hingeRef, qty: hingeTotal, item: c.id, itemName: c.name, target: fp.id,
                         note: `TB ${tb.toFixed(1)}` });
        b.hardware.push({ ref: "173H7100", qty: hingeTotal, item: c.id, itemName: c.name, target: fp.id,
                         note: null });
        b.hardware.push({ ref: "609.1500", qty: 4 * hingeTotal, item: c.id, itemName: c.name, target: fp.id,
                         note: "cuvettes et embases" });
        // TODO : the cup screw positions are not dimensioned in the Blum catalogue, drill them from the template
        part.notes.push("Cuvettes à visser : position des vis selon la charnière (non cotée au catalogue)");
        if (push)
        {
            const long = fp.hingeKind === "inset" || fp.rect.h > TIPON_DOOR_SHORT_MAX_HEIGHT;
            const tipRef = long ? "956A1004" : "956.1004";
            b.hardware.push({ ref: tipRef, qty: 1, item: c.id, itemName: c.name, target: fp.id,
                             note: "jeu mini 2,6 mm entre corps et porte (Blum p. 172)" });
            fitTipOnHole(c, lay, b, nb, fp, hingeSide);
        }
    }
}


// TIP-ON unit drilled 10 mm dia, 50 deep into the front edge on the opening side (Blum p. 172)
function fitTipOnHole(c: Carcass, lay: ResolvedLayout, b: Build, nb: NodeBox, fp: FrontPanel,
    hingeSide: "left" | "right"): void
{
    const openSide = hingeSide === "left" ? "right" : "left";
    const face = sideFace(c, lay, b, nb, openSide);
    const hole = (part: Part, u: number): Hole => 
    {
        return { u, v: 0, diameter: 10, depth: 50, face: "v0", w: part.thickness / 2,
                 label: `TIP-ON ${DIAM}10 x 50 mini, position transversale selon notice Blum p. 172` };
    };
    const y = fp.rect.y + fp.rect.h - TIPON_FROM_EDGE;
    const single = byId(c.fronts, fp.front)?.spec.type === "door";
    if (single && face !== null)
    {
        face.part.holes.push(hole(face.part, y - face.uOrigin));
        return;
    }
    // double doors meet in the middle : the unit fit into the front edge of the panel above
    let above: Part | undefined;
    for (const p of b.parts)
    {
        if (above !== undefined || p.item !== c.id || p.frame === null)
        {
            continue;
        }
        const level = p.role === "top" ? nb.y + nb.h : nb.y + nb.h + p.thickness;
        if ((p.role === "top" || p.role === "hdivider") && Math.abs(p.frame.o[1] - c.y - level) < 0.01)
        {
            above = p;
        }
    }
    if (above !== undefined && above.frame !== null)
    {
        const xLocal = openSide === "left" ? fp.rect.x + TIPON_FROM_EDGE : fp.rect.x + fp.rect.w - TIPON_FROM_EDGE;
        const u = xLocal - (above.frame.o[0] - c.x);
        above.holes.push({ ...hole(above, u),
            label: `TIP-ON ${DIAM}10 x 50 mini dans le chant avant, position transversale selon notice Blum p. 172` });
    }
    else
    {
        b.errors.push(`${c.name} : pas de panneau pour loger le TIP-ON de la porte ${fp.index + 1}.`);
    }
}
