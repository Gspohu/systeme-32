// Hinged doors : Blum hinge chart, mniimum gap, hinge heights, cups, plates and TIP-ON drilling

import type { Carcass, Settings } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import { cupDistance, plateLine, type FrontPanel } from "./fronts";
import { sideFace } from "./locate";
import { sideFiller } from "./extent";
import { byId } from "./edit";
import { panelMass } from "./fittings";
import type { Build, Part } from "./parts";
import {
    CUP_DEPTH, CUP_DIAMETER, EXPANDO_PLATE, HINGE_CHART, HINGE_CHART_WIDTH, HINGE_OPENING_DEG, MIN_GAP, MIN_GAP_FD,
    PLATE_LINE, TB_MAX, TB_MIN, TIPON_ADAPTER, TIPON_AXIS_FROM_FACE, TIPON_CATCH_PLATE, TIPON_DOOR_SHORT_MAX_HEIGHT,
    TIPON_HOLE_DIAMETER,
} from "../data/rules";
import { DIAM } from "./text";
import { holeLine, nearestHole } from "./grid";
import { at, neg, Y, type Frame, type Vec3 } from "./geometry";


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


// The hinge axis set 16 over a hole of the line, the two dowels of the plate then in two holes of it : the nearest
// step clear of the fixed shelves with the whole cup on the door, else where it was
function hingeOnLine(c: Carcass, s: Settings, fp: FrontPanel, y: number, blocked: [number, number][]): number
{
    const half = EXPANDO_PLATE.pitch / 2;
    const n = nearestHole(c, s, y - half);
    const steps = [n - 2, n - 1, n, n + 1, n + 2].map((k) =>
    {
        return holeLine(c, s, k) + half;
    }).sort((p, q) =>
    {
        return Math.abs(p - y) - Math.abs(q - y);
    });
    for (const at of steps)
    {
        const clear = blocked.every(([lo, hi]) =>
        {
            return at + PLATE_CLEARANCE <= lo || at - PLATE_CLEARANCE >= hi;
        });
        if (clear && at - CUP_DIAMETER / 2 >= fp.rect.y && at + CUP_DIAMETER / 2 <= fp.rect.y + fp.rect.h)
        {
            return at;
        }
    }
    return y;
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
        // on a short door the cups of two hinges run into each other, the plates are not dimensioned yet
        const pitch = (fp.rect.h - 2 * s.hingeEdgeDistance) / Math.max(1, hingeTotal - 1);
        if (hingeTotal > 1 && pitch < CUP_DIAMETER)
        {
            b.errors.push(`${name} : ${Math.round(fp.rect.h)} mm de haut, trop bas pour ${hingeTotal} charnières à `
                + `${s.hingeEdgeDistance} mm des chants (Réglages). Réduire cet écart, réunir avec la porte voisine `
                + "(Porte unique) ou poser un tiroir ou un abattant.");
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
        // a filler beside the hinges stands in the plane of the door : it needs the same gap F as a front
        const toFiller = hingeSide === "left" ? fp.rect.x : c.width - fp.rect.x - fp.rect.w;
        if (sideFiller(c, hingeSide) > 0 && gapMin !== null && toFiller < gapMin)
        {
            b.errors.push(`${name} : ${toFiller.toFixed(1)} mm jusqu'au fileur côté charnières, ${gapMin} mm mini `
                + `(Blum p. 75). Poser les charnières de l'autre côté ou réduire le recouvrement de la porte.`);
        }
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
        const { ys: wanted, moved } = hingeHeights(fp, hingeTotal, s, blocked);
        if (moved)
        {
            part.notes.push("Charnières décalées pour éviter une tablette fixe");
        }
        // an overlay door has its plates on the 37 row of the line : plates with dowels in its holes, the hinges
        // moved onto its steps. An inset one stands deeper, off the row, its plates screwed where the hinges fall
        const onSystem = fp.hingeKind !== "inset" && s.grid === EXPANDO_PLATE.pitch;
        const ys = onSystem ? wanted.map((y) =>
        {
            return hingeOnLine(c, s, fp, y, blocked);
        }) : wanted;
        if (onSystem && face !== null && face.part.thickness < EXPANDO_PLATE.minSide)
        {
            b.errors.push(`${name} : ${face.part.label.toLowerCase()} de ${face.part.thickness} mm, ${EXPANDO_PLATE.minSide} `
                + `mini pour les chevilles de l'embase ${EXPANDO_PLATE.ref} (Blum p. 146).`);
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
            for (const dy of [-EXPANDO_PLATE.pitch / 2, EXPANDO_PLATE.pitch / 2])
            {
                face.part.holes.push(onSystem
                    ? { u: y + dy - face.uOrigin, v: line, diameter: EXPANDO_PLATE.hole, depth: s.pinDepth,
                        face: face.face, label: `Embase ${EXPANDO_PLATE.ref} : cheville EXPANDO ${DIAM}5 (Blum p. 146)` }
                    : { u: y + dy - face.uOrigin, v: line, diameter: 0, depth: 0, face: face.face,
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
        b.hardware.push({ ref: onSystem ? EXPANDO_PLATE.ref : "173H7100", qty: hingeTotal, item: c.id, itemName: c.name,
                         target: fp.id, note: onSystem ? "dans les trous système" : null });
        b.hardware.push({ ref: "609.1500", qty: (onSystem ? 2 : 4) * hingeTotal, item: c.id, itemName: c.name,
                         target: fp.id, note: onSystem ? "cuvettes" : "cuvettes et embases" });
        // Blum gives the gap F a CLIP top door needs from its neighbour, not the path of its four bar arm :
        // turned about its front edge on the hinge side, the door stays clear of that gap and of its own side
        const deg = HINGE_OPENING_DEG[hingeRef];
        if (deg !== undefined)
        {
            const edge = hingeSide === "left" ? fp.rect.x : fp.rect.x + fp.rect.w;
            b.motions.push({
                item: c.id, front: fp.id, label: name, kind: "turn",
                pivot: [c.x + edge, c.y, c.z + fp.z + fp.thickness],
                axis: hingeSide === "left" ? neg(Y) : Y, amount: deg,
                parts: [part.id], fitted: [], rides: [],
                source: `charnières ${hingeRef} ${deg}°`,
                remedy: "Déplacer l'un des deux ou poser les charnières de l'autre côté.",
            });
        }
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


// Where a world point falls along one axis of a part frame
function along(f: Frame, axis: "u" | "v" | "n", p: Vec3): number
{
    const d = f[axis];
    return (p[0] - f.o[0]) * d[0] + (p[1] - f.o[1]) * d[1] + (p[2] - f.o[2]) * d[2];
}


// The TIP-ON on the opening side : drilled into the front edge of the panel when the catch plate facing it stays on
// the door, else clipped in an adapter plate screwed on the face of that panel (Blum p. 172, 173 and 687)
function fitTipOnHole(c: Carcass, lay: ResolvedLayout, b: Build, nb: NodeBox, fp: FrontPanel,
    hingeSide: "left" | "right"): void
{
    const openSide = hingeSide === "left" ? "right" : "left";
    const face = sideFace(c, lay, b, nb, openSide);
    const door = byId(b.parts, `${c.id}/front/${fp.id}`)!;
    const df = door.frame!;
    // room left between the point facing the axis and the nearest edge of the door
    const onDoor = (axis: Vec3): { u: number; v: number; room: number } =>
    {
        const back: Vec3 = [axis[0], axis[1], df.o[2]];
        const u = along(df, "u", back);
        const v = along(df, "v", back);
        return { u, v, room: Math.min(u, door.length - u, v, door.width - v) };
    };
    const mount = (part: Part, cellFace: "A" | "B", u: number, label: string): void =>
    {
        const t = part.thickness;
        const drilled = onDoor(at(part.frame!, u, 0, cellFace === "A" ? TIPON_AXIS_FROM_FACE : t -
                                  TIPON_AXIS_FROM_FACE));
        const half = TIPON_CATCH_PLATE.across / 2;
        if (drilled.room >= half && t >= TIPON_AXIS_FROM_FACE + TIPON_HOLE_DIAMETER / 2)
        {
            part.holes.push({ u, v: 0, diameter: TIPON_HOLE_DIAMETER, depth: 50, face: "v0",
                              w: cellFace === "A" ? TIPON_AXIS_FROM_FACE : t - TIPON_AXIS_FROM_FACE,
                              label: `${label}, axe à ${TIPON_AXIS_FROM_FACE} de la face ${cellFace} (Blum p. 172)` });
            door.holes.push({ u: drilled.u, v: drilled.v, diameter: 0, depth: 0, face: "A",
                              label: `Contreplaque TIP-ON à coller ${TIPON_CATCH_PLATE.across} x `
                                  + `${TIPON_CATCH_PLATE.high} centrée ici, gabarit Blum 65.5210.01 (p. 687)` });
            return;
        }
        // drilled, the plate would hang past the door edge : the adapter plate brings the unit into the cell
        // TODO the adapter stands 14.5 into the cell and is no fitted solid yet, a shelf at its height clashes unseen
        const off = TIPON_ADAPTER.axisOffFace;
        const clipped = onDoor(at(part.frame!, u, 0, cellFace === "A" ? -off : t + off));
        if (clipped.room < half)
        {
            b.errors.push(`${c.name}, porte ${fp.number} : la contreplaque TIP-ON (${TIPON_CATCH_PLATE.across} mm) `
                + `dépasserait du chant de la porte, percée comme sur embase (Blum p. 172-173). Élargir la porte `
                + "ou l'ouvrir avec une poignée.");
            return;
        }
        for (const v of TIPON_ADAPTER.screws)
        {
            part.holes.push({ u, v, diameter: 0, depth: 0, face: cellFace,
                              label: `Embase TIP-ON ${TIPON_ADAPTER.ref} : vis ${DIAM}3,5 (Blum p. 173)` });
        }
        b.hardware.push({ ref: TIPON_ADAPTER.ref, qty: 1, item: c.id, itemName: c.name, target: fp.id,
                         note: `percé, la contreplaque sortirait de la porte (${drilled.room.toFixed(1)} mm du chant)` });
        door.holes.push({ u: clipped.u, v: clipped.v, diameter: 0, depth: 0, face: "A",
                          label: `Contreplaque TIP-ON à coller centrée ici, axe à ${off} de la face du panneau `
                              + `(embase ${TIPON_ADAPTER.ref}, Blum p. 173)` });
    };
    const y = fp.rect.y + fp.rect.h - TIPON_FROM_EDGE;
    const single = byId(c.fronts, fp.front)?.spec.type === "door";
    if (single && face !== null)
    {
        mount(face.part, face.face, y - face.uOrigin, `TIP-ON ${DIAM}10 x 50 mini`);
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
        // the face of the top looks down into the cell, a shelf turns its face B down
        mount(above, above.role === "top" ? "A" : "B", u, `TIP-ON ${DIAM}10 x 50 mini dans le chant avant`);
    }
    else
    {
        b.errors.push(`${c.name} : pas de panneau pour loger le TIP-ON de la porte ${fp.number}.`);
    }
}
