// Breaks every item down into flat parts, joints and the curved skins the workshop has to make

import type { Carcass, Settings } from "./model";
import { resolveLayout, topDoubling, type ResolvedLayout } from "./layout";
import { spread } from "./fittings";
import { frontPanels, type WallSides } from "./fronts"; 
import { X, Y, Z, neg } from "./geometry";
import type { Build, CurveShape, Part } from "./part_types";
import { byId } from "./edit";
import { ceilingAt, frontOutline, sideHeights, topAngle } from "./slope";
import { buildDividers } from "./dividers";
import { PLINTH_TOP_GAP, boxOrigin, newPart } from "./part_base";
import { plinthFootGap } from "./curves";
import { CLIP_RETURN_DROP, clipDrop, footFor } from "./feet";
import { round1 } from "./text";

export type
{
    Build, CurveShape, Edge, Fitted, Groove, HardwareLine, Hole, Joint, Motion, Part, PartRole, Pocket,
} from "./part_types";

// Workshop convention, not a maker figure : 3 rows of screws holding the glue line while it sets
const DOUBLER_SCREW_INSET = 60;
const DOUBLER_SCREW_PITCH = 300;


// Angle of the batten `s` mm along the arc : the arc is laid from the carcass side, the flat run goes on from
// its other end. Laid from `straightAt` the last batten of a right quarter bit 1.9 mm into the side
export function battenAngle(c: CurveShape, s: number, arc: number): number
{
    const fromFlatEnd = c.straight > 0 && Math.abs(c.a0 - c.straightAt) < 1e-9;
    return fromFlatEnd ? c.a1 - (c.a1 - c.a0) * s / arc : c.a0 + (c.a1 - c.a0) * s / arc;
}

// A face A position along u carried to depth w of a bevelled board, its ends moving in proportion
export function bevelU(p: Part, u: number, w: number): number
{
    const a = p.bevel.u0 * w / p.thickness;
    const b = p.length + p.bevel.u1 * w / p.thickness;
    return a + u * (b - a) / p.length;
}


export function unbevelU(p: Part, u: number, w: number): number
{
    const a = p.bevel.u0 * w / p.thickness;
    const b = p.length + p.bevel.u1 * w / p.thickness;
    return (u - a) * p.length / (b - a);
}


export function emptyBuild(): Build
{
    return { parts: [], joints: [], hardware: [], fronts: new Map(), layouts: new Map(), errors: [], warnings: [],
            infos: [],
             midLoads: new Map(), railCuts: [], fitted: [], motions: [], handles: [], prints: [], outlets: [] };
}


export function buildCarcass(c: Carcass, s: Settings, b: Build, walls?: WallSides): void   
{
    const lay = resolveLayout(c);
    b.layouts.set(c.id, lay);
    b.errors.push(...lay.errors);
    const t = c.thickness;
    const [ox, oy, oz] = boxOrigin(c);
    const W = c.width;
    const D = c.depth;
    const zs = c.back.type === "applied" ? c.back.thickness : 0;
    const Ds = D - zs;
    const common = { item: c.id, itemName: c.name, thickness: t, decor: c.decor };


    // Sides run full heigth, u up, v from the front edge backwards, face A inside. Top and bottom over them, they
    // stand between the two, one thicknes up
    const over = overSides(c, lay, b);
    const lift = over ? t : 0;
    const sides = sideHeights(c);
    const angle = topAngle(c);
    const rising = sides.right >= sides.left ? 1 : -1;
    const left = newPart({
        ...common, id: `${c.id}/side/L`, label: "Joue gauche", role: "side", length: sides.left - 2 * lift, width: Ds,
        edges: over ? ["v0"] : ["v0", "u1", "u0"],
        frame: { o: [ox + t, oy + lift, oz + D], u: Y, v: neg(Z), n: neg(X) },
    });
    const right = newPart({
        ...common, id: `${c.id}/side/R`, label: "Joue droite", role: "side", length: sides.right - 2 * lift, width: Ds,
        edges: over ? ["v0"] : ["v0", "u1", "u0"],
        frame: { o: [ox + W - t, oy + lift, oz + D], u: Y, v: neg(Z), n: X },
    });
    // Top and bottom between the sides, u from the left, v from the front, face A inside, or over them end to end
    const span = over ? W : W - 2 * t;
    const x0 = over ? ox : ox + t;
    const bottom = newPart({
        ...common, id: `${c.id}/bottom`, label: "Dessous", role: "bottom", length: span, width: Ds,
        edges: over ? ["v0", "u0", "u1"] : ["v0"],
        frame: { o: [x0, oy + t, oz + D], u: X, v: neg(Z), n: neg(Y) },
    });
    // Under a roof the top runs along the slope, its length measured in the slope, its ends cut upright
    const cos = Math.cos(angle);
    const sin = Math.sin(angle) * rising;
    const top = newPart({
        ...common, id: `${c.id}/top`, label: "Dessus", role: "top", length: span / cos, width: Ds,
        edges: over ? ["v0", "u0", "u1"] : ["v0"],
        frame: { o: [x0, oy + ceilingAt(c, t), oz + D], u: [cos, sin, 0], v: neg(Z), n: [-sin, cos, 0] },
    });
    if (c.slope !== null)
    {
        const deg = (angle * 180 / Math.PI).toFixed(1).replace(".", ",");
        top.notes.push(`Dessus sous rampant à ${deg}° : extrémités coupées d'aplomb`);
        // Plumb ends : on face B both ends sit t.tan further along u
        top.bevel = { u0: t * sin / cos, u1: t * sin / cos };
        // The low side would pierce the roof line by t.tan over its thickness, the high one stays square
        const low = c.slope.low === "left" ? left : right;
        low.notes.push(`Tête chanfreinée à ${deg}° dans la pente du dessus`);
        low.bevel = { u0: 0, u1: -t * Math.tan(angle) };
    }
    b.parts.push(left, right, bottom, top);
    const doubling = topDoubling(c);
    // Over the sides : their ends against the inner faces of top and bottom, as a hung box (hung_items.ts). Open to
    // the eye, the housings go in the outer faces of the sides, against what stands beside it : tightened in the
    // workshop before it is set
    const outer = c.hiddenLinks === true ? "B" as const : undefined;
    for (const [hp, end] of over ? [[bottom, "u0"], [top, "u1"]] as const : [])
    {
        b.joints.push({ edgePart: left.id, edge: end, facePart: hp.id, face: "A", lineAxis: "u", line: t / 2, from: 0,
                        to: Ds, edgeFrom: 0, reversed: false, housingFace: outer });
        b.joints.push({ edgePart: right.id, edge: end, facePart: hp.id, face: "A", lineAxis: "u", line: W - t / 2,
                        from: 0, to: Ds, edgeFrom: 0, reversed: false, housingFace: outer });
    }
    // Four corner joints : the ends of top and bottom against the inner faces of the sides
    // A board glued under the top would close its housings over : they go in its upper face
    for (const hp of over ? [] : [bottom, top])
    {
        const lineL = hp === bottom ? t / 2 : sides.left - t / cos / 2;
        const lineR = hp === bottom ? t / 2 : sides.right - t / cos / 2;
        // An open carcass keeps them off the floor of its cell as well, under it where what it stands on hides them
        const hidden = (hp === top && doubling > 0) || (hp === bottom && c.hiddenLinks === true);
        const housingFace = hidden ? "B" as const : undefined;
        b.joints.push({ edgePart: hp.id, edge: "u0", facePart: left.id, face: "A", lineAxis: "u", line: lineL, from: 0,
                       to: Ds, edgeFrom: 0, reversed: false, housingFace });
        b.joints.push({ edgePart: hp.id, edge: "u1", facePart: right.id, face: "A", lineAxis: "u", line: lineR,
                       from: 0, to: Ds, edgeFrom: 0, reversed: false, housingFace });
    }
    if (doubling > 0)
    {
        buildTopDoubler(c, top, doubling, b);
    }


    buildBack(c, b);
    buildDividers(c, lay, s, b);
    buildBase(c, b);


    const panels = frontPanels(c, lay, s, walls);
    b.fronts.set(c.id, panels);
    for (const fp of panels)
    {
        const f = byId(c.fronts, fp.front)!;
        const decor = fp.decor;
        const vertical = fp.role !== "drawer" && fp.role !== "flap";
        const labels = { door: "Porte", drawer: "Façade de tiroir", leaf: "Vantail coulissant", flap: "Abattant",
                         panel: "Façade fixe", drop: "Abattant tombant" };
        const roles = { door: "door", drawer: "drawerFront", leaf: "leaf", flap: "flap", panel: "panel",
                       drop: "flap" } as const;
        // Grain runs vertically on doors and leaves, horizontally on drawer fronts and lift-up flaps. A drop-down flap
        // among doors keeps their grain
        const part = newPart({
            item: c.id, itemName: c.name, thickness: fp.thickness, decor,
            id: `${c.id}/front/${fp.id}`,
            label: `${labels[fp.role]} ${fp.number}`,
            role: roles[fp.role],
            length: vertical ? fp.rect.h : fp.rect.w,
            width: vertical ? fp.rect.w : fp.rect.h,
            edges: ["u0", "u1", "v0", "v1"],
            frame: vertical
                ? { o: [ox + fp.rect.x, oy + fp.rect.y, oz + fp.z], u: Y, v: X, n: Z }
                : { o: [ox + fp.rect.x, oy + fp.rect.y, oz + fp.z], u: X, v: Y, n: Z },
            colour: f.colour,
        });
        if (part.colour !== null)
        {
            part.notes.push(`Teinte ${f.colourName ?? part.colour}`);
        }
        b.parts.push(part);
    }
}


// Top and bottom over the sides, only where nothing counts side heights from the carcass floor (empty box)
// TODO shelves, fronts and outlets still measure a side from the carcass floor : a box with them keeps its sides full
function overSides(c: Carcass, lay: ResolvedLayout, b: Build): boolean
{
    if (c.overSides !== true)
    {
        return false;
    }
    const why = c.slope !== null ? "un dessus sous rampant" : topDoubling(c) > 0 ? "un dessus doublé"
        : lay.dividers.length > 0 ? "des séparations" : c.fronts.length > 0 ? "des façades"
        : c.outlets.length > 0 ? "des passages de câble" : null;
    if (why !== null)
    {
        b.errors.push(`${c.name} : dessus et dessous sur les joues pas encore gérés avec ${why}. Les joues restent `
            + "pleine hauteur, retirer l'option ou ce qui la bloque.");
        return false;
    }
    return true;
}


// The board under the top, the same size, both glued into one before the box goes together. PVA holds badly on
// melamine : both faces scuffed, polyurethane, screws to clamp it (Selleys, melamine to melamine)
// https://www.selleys.com.au/ask-an-expert/adhesives/what-is-the-best-adhesive-to-glue-two-pieces-of-melamine-together/
function buildTopDoubler(c: Carcass, top: Part, thickness: number, b: Build): void
{
    const [ox, oy, oz] = boxOrigin(c);
    const part = newPart({
        item: c.id, itemName: c.name, thickness, decor: c.decor,
        id: `${c.id}/top-doubler`, label: "Doublage du dessus", role: "top", length: top.length, width: top.width,
        edges: ["v0"],
        frame: { o: [ox + c.thickness, oy + c.height - c.thickness - thickness, oz + c.depth], u: X, v: neg(Z), n: Y },
    });
    let screws = 0;
    for (const u of spread(top.length, DOUBLER_SCREW_INSET, DOUBLER_SCREW_PITCH))
    {
        for (const v of [DOUBLER_SCREW_INSET, top.width / 2, top.width - DOUBLER_SCREW_INSET])
        {
            top.holes.push({ u, v, diameter: 0, depth: 0, face: "B", label: "Vis 4 x 30 du doublage, tête noyée",
                             purpose: "doubler-screw" });
            screws++;
        }
    }
    part.notes.push("Collée sous le dessus avant le montage du caisson : faces en contact poncées au gros grain, colle "
        + `polyuréthane, ${screws} vis 4 x 30 depuis le dessus. Serrer les boîtiers Minifix par le dessus.`);
    b.parts.push(part);
    b.hardware.push({ ref: "SCREW_4x30", qty: screws, item: c.id, itemName: c.name, target: part.id,
                      note: "doublage du dessus", purpose: "doubler-screw" });
    b.hardware.push({ ref: "GLUE_PU", qty: 1, item: c.id, itemName: c.name, target: part.id,
                      note: `doublage du dessus, ${Math.round(top.length)} x ${Math.round(top.width)} mm`,
                      purpose: "doubler-glue" });
}


function buildBack(c: Carcass, b: Build): void
{
    const [ox, oy, oz] = boxOrigin(c);
    const board = c.thickness;
    const W = c.width;
    const H = c.height;
    if (c.back.type === "none")
    {
        return;
    }
    // A back runs its grain along its longer side, the only way a wide unit still fits a sheet
    if (c.back.type === "applied")
    {
        const wide = W > H;
        const back = newPart({
            item: c.id, itemName: c.name, thickness: c.back.thickness, decor: c.backDecor,
            id: `${c.id}/back`, label: "Fond rapporté", role: "back", length: wide ? W : H, width: wide ? H : W,
            edges: [],
            frame: { o: [ox, oy, oz + c.back.thickness], u: wide ? X : Y, v: wide ? Y : X, n: neg(Z) },
        });
        back.notes.push("Vissé en applique sur les chants arrière");
        if (c.slope !== null)
        { 
            // It follows the front outline of the box, never rising past the square head of the high side
            const pts = [...frontOutline(c).slice(1), [0, 0] as [number, number]];
            back.outline = {
                start: [0, 0],
                segments: pts.map(([x, y]) =>
                {
                    return { kind: "line" as const, x: wide ? x : y, y: wide ? y : x };
                }),
            };
            back.notes.push("Contour pentagonal sous le rampant : découpe d'après le DXF");
        }
        b.parts.push(back);
        return;
    }
    // Back in grooves cut into sides, top and bottom, 1 mm play on each side of the groove bottom
    const g = c.back;
    const w = W - 2 * board + 2 * g.depth - 2;
    const h = H - 2 * board + 2 * g.depth - 2;
    const wide = w > h;
    const back = newPart({
        item: c.id, itemName: c.name, thickness: g.thickness, decor: c.backDecor,
        id: `${c.id}/back`, label: "Fond en rainure", role: "back", length: wide ? w : h, width: wide ? h : w, edges: [],
        frame: { o: [ox + board - g.depth + 1, oy + board - g.depth + 1, oz + g.offset + g.thickness], u: wide ? X : Y,  
                v: wide ? Y : X, n: neg(Z) },
    });
    b.parts.push(back);
    const vGroove = c.depth - g.offset - g.thickness / 2;
    // The groove stops inside the sides but runs through top and bottom, which sit between them
    for (const p of b.parts)
    {  
        if (p.item !== c.id || (p.role !== "side" && p.role !== "top" && p.role !== "bottom"))
        {
            continue;
        }
        const from = p.role === "side" ? board - g.depth : 0;
        const to = p.role === "side" ? p.length - board + g.depth : p.length;
        p.grooves.push({ face: "A", along: "u", at: vGroove, from, to, width: g.thickness + 0.5, depth: g.depth,
                        label: `Rainure de fond ${g.thickness + 0.5} x ${g.depth}` });
    }
}


function buildBase(c: Carcass, b: Build): void
{
    if (c.base.type !== "plinth")
    {
        return;
    }
    const [ox, oy, oz] = boxOrigin(c);
    const t = c.thickness;
    const returns = c.base.returns ?? [];
    const foot = plinthFootGap(c);
    const y0 = oy - c.base.height + foot;
    const zFront = oz + c.depth - c.base.setback - t;
    // The front plinth runs the whole width, the returns come from the wall in the plane of the sides to its back
    const part = newPart({
        item: c.id, itemName: c.name, thickness: t, decor: c.decor,
        id: `${c.id}/plinth`, label: "Plinthe", role: "plinth", length: c.width,
        width: c.base.height - foot - PLINTH_TOP_GAP,
        edges: ["v1"], frame: { o: [ox, y0, zFront], u: X, v: Y, n: Z },
    });
    // Measured from the top of the plinth, as the fitting drawing gives it
    const drop = clipDrop(footFor(c.base.height));
    const under = drop === null ? null : drop - PLINTH_TOP_GAP;
    part.notes.push(under === null
        ? "Clipsée sur les pieds AXILO (clips 637.38.054)"
        : `Clipsée sur les pieds AXILO : clips 637.38.054 vissés au dos, vis à ${round1(under)} mm sous le haut de la plinthe `
            + "(plan Häfele 637.76.333-1)");
    b.parts.push(part);
    for (const side of returns)
    {
        const right = side === "right";
        const ret = newPart({
            item: c.id, itemName: c.name, thickness: t, decor: c.decor,
            id: `${c.id}/plinth/${side}`, label: `Plinthe, retour ${right ? "droit" : "gauche"}`, role: "plinth",
            length: zFront - oz, width: c.base.height - foot - PLINTH_TOP_GAP, edges: ["v1"],
            frame: { o: [right ? ox + c.width - t : ox + t, y0, zFront], u: neg(Z), v: Y, n: right ? X : neg(X) },
        });
        ret.notes.push(`Clipsée sur les deux pieds ${right ? "de droite" : "de gauche"}, contre le dos de la plinthe`
            + (under === null ? "" : `, vis des clips à ${round1(under + CLIP_RETURN_DROP)} mm sous son haut : `
                + `${CLIP_RETURN_DROP} mm plus bas que ceux de la plinthe, pour croiser le clip de façade au pied d'angle`));
        b.parts.push(ret);
    }
}
