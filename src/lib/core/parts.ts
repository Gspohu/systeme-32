// Breaks every item down into flat parts, joints and the curved skins the workshop has to make

import type { Carcass, Settings } from "./model";
import { resolveLayout } from "./layout";
import { frontPanels } from "./fronts";
import { type Vec3, X, Y, Z, neg, rectOutline } from "./geometry";
import type { Build, CurveShape, Part } from "./part_types";
import { byId } from "./edit";
import { ceilingAt, frontOutline, sideHeights, topAngle } from "./slope";
import { decorById, materialOfDecor } from "../data/materials";
import { buildDividers } from "./dividers";

// Häfele plinth holder : plinth height = foot height minus 5 to 10 mm, 7 kpt
export const PLINTH_FOOT_GAP = 7;

export type
{
    Build, CurveShape, Edge, Fitted, Groove, HardwareLine, Hole, Joint, Motion, Part, PartRole, Pocket,
} from "./part_types";


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
    return { parts: [], joints: [], hardware: [], fronts: new Map(), layouts: new Map(), errors: [], warnings: [],
            infos: [],
             midLoads: new Map(), railCuts: [], fitted: [], motions: [], handles: [], prints: [], outlets: [] };
}


export function buildCarcass(c: Carcass, s: Settings, b: Build): void
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
    const returns = c.base.returns ?? [];
    const y0 = oy - c.base.height + PLINTH_FOOT_GAP;
    const zFront = oz + c.depth - c.base.setback - t;
    // the front plinth runs the whole width, the returns come from the wall in the plane of the sides to its back
    const part = newPart({
        item: c.id, itemName: c.name, thickness: t, decor: c.decor,
        id: `${c.id}/plinth`, label: "Plinthe", role: "plinth", length: c.width, width: c.base.height - PLINTH_FOOT_GAP,
        edges: ["v1"], frame: { o: [ox, y0, zFront], u: X, v: Y, n: Z },
    });
    part.notes.push("Clipsée sur les pieds AXILO (clips 637.38.054)");
    b.parts.push(part);
    for (const side of returns)
    {
        const right = side === "right";
        const ret = newPart({
            item: c.id, itemName: c.name, thickness: t, decor: c.decor,
            id: `${c.id}/plinth/${side}`, label: `Plinthe, retour ${right ? "droit" : "gauche"}`, role: "plinth",
            length: zFront - oz, width: c.base.height - PLINTH_FOOT_GAP, edges: ["v1"],
            frame: { o: [right ? ox + c.width - t : ox + t, y0, zFront], u: neg(Z), v: Y, n: right ? X : neg(X) },
        });
        ret.notes.push(`Clipsée sur les deux pieds ${right ? "de droite" : "de gauche"}, contre le dos de la plinthe`);
        b.parts.push(ret);
    }
}
