// Breaks every item down into flat parts, joints and the curved skins the workshop has to make

import type { Carcass, Settings } from "./model";
import { resolveLayout, type ResolvedLayout } from "./layout";
import { frontPanels, type FrontPanel } from "./fronts";
import { type Frame, type Outline, type Vec3, X, Y, Z, neg, rectOutline } from "./geometry";
import { byId } from "./edit";
import { ceilingAt, frontOutline, sideHeights, topAngle } from "./slope";
import { decorById, materialOfDecor } from "../data/materials";
import { buildDividers } from "./dividers";

// Häfele plinth holder : plinth height = foot height minus 5 to 10 mm, 7 kpt
export const PLINTH_FOOT_GAP = 7;

export type Edge = "u0" | "u1" | "v0" | "v1";


export interface Hole
{
    // part coordinates of the axis, and the face or edge it is drilled from
    u: number;
    v: number;
    // 0 marks a screw position without pre-drilling
    diameter: number;
    depth: number;
    face: "A" | "B" | Edge;
    // for edge holes, distance of the axis from face A across the thickness
    w?: number;
    label: string;
}


export interface Groove  
{
    face: "A" | "B";
    // along u or v, at `at` on the other axis
    along: "u" | "v";
    at: number;
    from: number;
    to: number;
    width: number;
    depth: number;
    label: string;
    // taken off the section in the deflection check of a shelf, a joinery slot is too short to count
    weakens?: boolean;
}

export type PartRole =
    | "side" | "top" | "bottom" | "back" | "hdivider" | "vdivider" | "shelf" | "plinth"
    | "door" | "drawerFront" | "leaf" | "flap"
    | "boxSide" | "boxEnd" | "boxBottom"
    | "lining" | "endPanel" | "former" | "skin" | "batten" | "flange" | "wallShelf" | "slat" | "cleat" | "filler" | "panel";


export interface Part
{
    id: string;
    item: string;
    itemName: string;
    label: string;
    role: PartRole;
    // lenght runs along the grain when the decor has one
    length: number;
    width: number;
    thickness: number;
    decor: string;
    material: string;
    grain: boolean;
    quantity: number;
    edges: Edge[];
    outline: Outline;
    // openings cut through the board, inside the outline
    cutouts: Outline[];
    // face A is at w = 0 and drilling goes along +n
    frame: Frame | null;
    holes: Hole[];
    grooves: Groove[];
    notes: string[];
    // flexible skins and battens are cut flat but sit on an arc in the model
    curve: CurveShape | null;
    // lacquer colour of a lacquered MDF part, shown in 3D and noted for the painter
    colour: string | null;
    // where each end of the board lies on face B, along u, measured from where it lies on face A : a plumb cut
    // under a roof or a chamfered head, the outline being face A only
    bevel: { u0: number; u1: number };
}

export interface CurveShape
{
    // arc centre in world and cylinder axis : "y" works in the x-z plane (angle 0 = +x, 90 = +z)
    // "z" works in the x-y plane (angle 0 = +x, 90 = +y)
    centre: Vec3;
    axis: "y" | "z";
    // radius of the outer afce of the skin, the skin thickness goes inward
    rOuter: number;
    thickness: number;
    a0: number;
    a1: number;
    // extent along the axis, measured from the centre
    from: number;
    to: number;
    // flat run continuing the skin towards -z from the arc end at angle `straightAt` (axis "y" only)
    straight: number;
    straightAt: number;
}


// Angle of the batten `s` mm along the arc : the arc is laid from the carcass side, the flat run goes on from
// its other end. Laid from `straightAt` the last batten of a right quarter bit 1.9 mm into the side
export function battenAngle(c: CurveShape, s: number, arc: number): number
{
    const fromFlatEnd = c.straight > 0 && Math.abs(c.a0 - c.straightAt) < 1e-9;
    return fromFlatEnd ? c.a1 - (c.a1 - c.a0) * s / arc : c.a0 + (c.a1 - c.a0) * s / arc;
}

// Butt joint : the edge `edge` of part `edgePart` sits against face `face` of part `facePart`
export interface Joint
{
    edgePart: string;
    edge: Edge;
    facePart: string;
    face: "A" | "B";
    // on the face part, the joint line centre is at `line` on axis `lineAxis`, from `from` to `to` on the other axis
    lineAxis: "u" | "v";
    line: number;
    from: number;
    to: number;
    // on the edge part, the same span measured along its edge, same direction as from/to
    edgeFrom: number;
    // true when the edge part coordinate runs opposite to the face part coordinate
    reversed: boolean;
}

export interface HardwareLine
{
    ref: string;
    qty: number;
    item: string;
    itemName: string;
    // part or front the line belongs to, for the drawings
    target: string | null;
    note: string | null;
}


export interface Build
{
    parts: Part[];
    joints: Joint[];
    hardware: HardwareLine[];
    fronts: Map<string, FrontPanel[]>;
    layouts: Map<string, ResolvedLayout>;
    errors: string[];
    // what the hardware chosen admits, told the user without being a fault
    infos: string[];
    // point loads at mid span in N, a rail centre support hanging from a shelf
    midLoads: Map<string, number>;
    // tube lengths to cut, packed into bars over the whole project once every item is built
    railCuts: { item: string; itemName: string; length: number }[];
    // hardware as volumes, for the 3D view, the clash checks and the drawings
    fitted: Fitted[];
}


// A piece of hardware or the space its maker reserves for it, in the frame of the wall of its item : a box, or
// a cylinder along `axes[2]` of radius `half[0]`
export interface Fitted
{
    key: string;
    item: string;
    ref: string;
    label: string;
    shape: "box" | "cylinder";
    centre: Vec3;
    axes: [Vec3, Vec3, Vec3];
    half: Vec3;
    // the part it is let into, never counted as clashing with it
    host: string | null;
    // inside a closed carcass : drawn in 3D only when the hardware is asked for
    hidden: boolean;
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


export function newPart(p: Omit<Part, "outline" | "cutouts" | "holes" | "grooves" | "notes" | "curve" | "quantity" |
                        "grain" | "material" | "colour" | "bevel"> & Partial<Part>): Part
{
    const decor = decorById(p.decor);
    const mat = p.material ?? materialOfDecor(decor).id;
    const part: Part = {
        quantity: 1,
        outline: rectOutline(p.length, p.width),
        cutouts: [],
        holes: [],
        grooves: [],
        notes: [],
        curve: null,
        colour: null,
        bevel: { u0: 0, u1: 0 },
        grain: decor.grain,
        ...p,
        material: mat,
    };
    // a lacquer colour left over from a former decor means nothing on this one
    if (decor.id !== "MDF_LAQUE")
    {
        part.colour = null;
    }
    return part;
}


export function baseHeight(c: Carcass): number
{
    if (c.base.type === "plinth" || c.base.type === "feet")
    {
        return c.base.height;
    }
    return 0;
}


// World origin of the carcass box (back left bottom)
export function boxOrigin(c: Carcass): Vec3
{
    return [c.x, c.y, c.z];
}


export function emptyBuild(): Build
{
    return { parts: [], joints: [], hardware: [], fronts: new Map(), layouts: new Map(), errors: [], infos: [],
             midLoads: new Map(), railCuts: [], fitted: [] };
}


export function buildCarcass(c: Carcass, s: Settings, b: Build): void
{
    const lay = resolveLayout(c);
    b.layouts.set(c.id, lay);
    b.errors.push(...lay.errors);
    const t = c.thickness;
    const [ox, oy, oz] = boxOrigin(c);
    const W = c.width;
    const H = c.height;
    const D = c.depth;
    const zs = c.back.type === "applied" ? c.back.thickness : 0;
    const Ds = D - zs;
    const common = { item: c.id, itemName: c.name, thickness: t, decor: c.decor };


    // Sides run full height, u up, v from the front edge backwards, face A inside
    const sides = sideHeights(c);
    const angle = topAngle(c);
    const rising = sides.right >= sides.left ? 1 : -1;
    const left = newPart({
        ...common, id: `${c.id}/side/L`, label: "Joue gauche", role: "side", length: sides.left, width: Ds, 
        edges: ["v0", "u1", "u0"],
        frame: { o: [ox + t, oy, oz + D], u: Y, v: neg(Z), n: neg(X) },
    });
    const right = newPart({
        ...common, id: `${c.id}/side/R`, label: "Joue droite", role: "side", length: sides.right, width: Ds,
        edges: ["v0", "u1", "u0"],
        frame: { o: [ox + W - t, oy, oz + D], u: Y, v: neg(Z), n: X },
    });
    // Top and bottom between the sides, u from the left, v from the front, face A inside
    const bottom = newPart({
        ...common, id: `${c.id}/bottom`, label: "Dessous", role: "bottom", length: W - 2 * t, width: Ds,
        edges: ["v0"],
        frame: { o: [ox + t, oy + t, oz + D], u: X, v: neg(Z), n: neg(Y) },
    });
    // under a roof the top runs along the slope, its length measured in the slope, its ends cut upright
    const cos = Math.cos(angle);
    const sin = Math.sin(angle) * rising;
    const top = newPart({
        ...common, id: `${c.id}/top`, label: "Dessus", role: "top", length: (W - 2 * t) / cos, width: Ds,
        edges: ["v0"],
        frame: { o: [ox + t, oy + ceilingAt(c, t), oz + D], u: [cos, sin, 0], v: neg(Z), n: [-sin, cos, 0] },
    });
    if (c.slope !== null)
    {
        const deg = (angle * 180 / Math.PI).toFixed(1).replace(".", ",");
        top.notes.push(`Dessus sous rampant à ${deg}° : extrémités coupées d'aplomb`);
        // plumb ends : on face B both ends sit t.tan further along u
        top.bevel = { u0: t * sin / cos, u1: t * sin / cos };
        // the low side would pierce the roof line by t.tan over its thickness, the high one stays square
        const low = c.slope.low === "left" ? left : right;
        low.notes.push(`Tête chanfreinée à ${deg}° dans la pente du dessus`);
        low.bevel = { u0: 0, u1: -t * Math.tan(angle) };
    }
    b.parts.push(left, right, bottom, top);
    // Four corner joints : the ends of top and bottom against the inner faces of the sides
    for (const hp of [bottom, top])
    {
        const lineL = hp === bottom ? t / 2 : sides.left - t / cos / 2;
        const lineR = hp === bottom ? t / 2 : sides.right - t / cos / 2;
        b.joints.push({ edgePart: hp.id, edge: "u0", facePart: left.id, face: "A", lineAxis: "u", line: lineL, from: 0,
                       to: Ds, edgeFrom: 0, reversed: false });
        b.joints.push({ edgePart: hp.id, edge: "u1", facePart: right.id, face: "A", lineAxis: "u", line: lineR,
                       from: 0, to: Ds, edgeFrom: 0, reversed: false });
    }


    buildBack(c, b);
    buildDividers(c, lay, s, b);
    buildBase(c, b);


    const panels = frontPanels(c, lay, s);
    b.fronts.set(c.id, panels);
    for (const fp of panels)
    {
        const f = byId(c.fronts, fp.front)!;
        const decor = fp.decor;
        const vertical = fp.role !== "drawer" && fp.role !== "flap";
        const labels = { door: "Porte", drawer: "Façade de tiroir", leaf: "Vantail coulissant", flap: "Abattant",
                         panel: "Façade fixe" };
        const roles = { door: "door", drawer: "drawerFront", leaf: "leaf", flap: "flap", panel: "panel" } as const;
        // Grain runs vertically on doors and leaves, horizontally on drawer fronts and flaps
        const part = newPart({
            item: c.id, itemName: c.name, thickness: fp.thickness, decor,
            id: `${c.id}/front/${fp.id}`,
            label: `${labels[fp.role]} ${fp.index + 1}`,
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
    // a back runs its grain along its longer side, the only way a wide unit still fits a sheet
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
            // it follows the front outline of the box, never rising past the square head of the high side
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
    // the groove stops inside the sides but runs through top and bottom, which sit between them
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
    const part = newPart({
        item: c.id, itemName: c.name, thickness: t, decor: c.decor,
        id: `${c.id}/plinth`, label: "Plinthe", role: "plinth", length: c.width, width: c.base.height - PLINTH_FOOT_GAP,
        edges: ["v1"],
        frame: { o: [ox, oy - c.base.height + PLINTH_FOOT_GAP, oz + c.depth - c.base.setback - t], u: X, v: Y, n: Z },
    });
    part.notes.push("Clipsée sur les pieds AXILO (clips 637.38.054)");
    b.parts.push(part);
}
