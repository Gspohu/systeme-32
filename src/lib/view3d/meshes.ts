// Three.js geometry for every part : flat parts extruedd from their outline, skins and battens on their arcs

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ScreenSpot } from "../core/tv_arm";
import { battenAngle, bevelU, type Fitted, type Part, type CurveShape } from "../core/parts";
import type { Carcass, Device, LadderRail, Screen } from "../core/model";
import { tessellate } from "../core/geometry";
import { screenSize } from "../core/extent";
import type { ResolvedLayout } from "../core/layout";
import { FIT_PLAY, RAIL_D, railPlan } from "../core/wardrobe";
import { LED_GROOVE_W, SPOT_RIM, spotCentres } from "../core/lights";

// scene unit is the metre
export const MM = 0.001;


export interface MeshSpec
{
    key: string;
    item: string; 
    part: string | null;
    decor: string;
    colour: string | null;
    geometry: THREE.BufferGeometry;
}


function shapeOf(p: Part): THREE.Shape
{
    const pts = tessellate(p.outline, 4);
    const shape = new THREE.Shape();
    shape.moveTo(pts[0]![0], pts[0]![1]);
    for (const [x, y] of pts.slice(1))
    {
        shape.lineTo(x, y);
    }
    // an opening goes right through the extruded board
    for (const c of p.cutouts)
    {
        const hole = new THREE.Path();
        const q = tessellate(c, 4);
        hole.moveTo(q[0]![0], q[0]![1]);
        for (const [x, y] of q.slice(1))
        {
            hole.lineTo(x, y);
        }
        shape.holes.push(hole);
    }
    return shape;
}


function flatGeometry(p: Part): THREE.BufferGeometry
{
    const f = p.frame!;
    const geo = new THREE.ExtrudeGeometry(shapeOf(p), { depth: p.thickness, bevelEnabled: false, curveSegments: 4 });
    // a plumb cut or a chamfered head moves the ends of face B along u
    if (p.bevel.u0 !== 0 || p.bevel.u1 !== 0)
    {
        const pos = geo.getAttribute("position");
        let i = 0;
        while (i < pos.count)
        {
            pos.setX(i, bevelU(p, pos.getX(i), pos.getZ(i)));
            i++;
        }
    }
    // u, v, w of the part become world axes, then millimetres become metres
    const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...f.u),
        new THREE.Vector3(...f.v),
        new THREE.Vector3(...f.n),
    ).setPosition(f.o[0], f.o[1], f.o[2]);
    geo.applyMatrix4(m);
    geo.scale(MM, MM, MM);
    geo.computeVertexNormals();
    return geo;
}


// annular sector in the plane normal to the xais, extruded along the axis
function shellGeometry(c: CurveShape): THREE.BufferGeometry
{
    const rOut = Math.abs(c.rOuter);
    const rIn = Math.max(0, rOut - c.thickness);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rOut, c.a0, c.a1, false);
    if (rIn > 0)
    {
        shape.absarc(0, 0, rIn, c.a1, c.a0, true);
    }
    else
    {
        shape.lineTo(0, 0);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: c.to - c.from, bevelEnabled: false, curveSegments: 32 });
    placeOnAxis(geo, c);
    return geo;
}


function placeOnAxis(geo: THREE.BufferGeometry, c: CurveShape): void
{
    const m = new THREE.Matrix4();
    if (c.axis === "y")
    {
        // shape x -> world x, shape y -> world z, extrusion -> world y
        m.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
        m.setPosition(c.centre[0], c.centre[1] + c.from, c.centre[2]);
    }
    else
    {
        m.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
        m.setPosition(c.centre[0], c.centre[1], c.centre[2] + c.from);
    }
    geo.applyMatrix4(m);
    geo.scale(MM, MM, MM);
    geo.computeVertexNormals();
}


// flat run of a quarter rounded end : a box going towards -z from the arc end
function straightGeometry(c: CurveShape): THREE.BufferGeometry | null
{
    if (c.straight <= 0 || c.axis !== "y")
    {
        return null;
    }
    const x = c.centre[0] + Math.cos(c.straightAt) * (Math.abs(c.rOuter) - c.thickness / 2);
    const geo = new THREE.BoxGeometry(c.thickness, c.to - c.from, c.straight);
    geo.translate(x, c.centre[1] + (c.from + c.to) / 2, c.centre[2] - c.straight / 2);
    geo.scale(MM, MM, MM);
    return geo;
}


// individual battens spread along the arc and the flat run
function battenGeometries(p: Part, c: CurveShape): THREE.BufferGeometry[]
{
    const out: THREE.BufferGeometry[] = [];
    const r = Math.abs(c.rOuter) - c.thickness / 2;
    const arc = Math.abs(c.a1 - c.a0) * r;
    const total = arc + c.straight;
    const n = p.quantity;
    let i = 0;
    while (i < n)
    {
        const s = total * (i + 0.5) / n;
        const box = new THREE.BoxGeometry(c.thickness, c.to - c.from, p.width);
        if (s <= arc)
        {
            const a = battenAngle(c, s, arc);
            // battens stand radially : thickness along the radius, width along the tangent
            const rot = new THREE.Matrix4();
            if (c.axis === "y")
            {
                rot.makeRotationY(-a);
                box.applyMatrix4(rot);
                box.translate(c.centre[0] + r * Math.cos(a), c.centre[1] + (c.from + c.to) / 2, c.centre[2] + r *
                              Math.sin(a));
            }
            else
            {
                box.rotateX(Math.PI / 2);
                rot.makeRotationZ(a);
                box.applyMatrix4(rot);
                box.translate(c.centre[0] + r * Math.cos(a), c.centre[1] + r * Math.sin(a), c.centre[2] +
                              (c.from + c.to) / 2);
            }
        }
        else
        {
            const x = c.centre[0] + Math.cos(c.straightAt) * r;
            box.translate(x, c.centre[1] + (c.from + c.to) / 2, c.centre[2] - (s - arc));
        }
        box.scale(MM, MM, MM);
        out.push(box);
        i++;
    }
    return out;
}


export function partMeshes(parts: Part[]): MeshSpec[]
{
    const out: MeshSpec[] = [];
    for (const p of parts)
    {
        const base = { item: p.item, part: p.id, decor: p.decor, colour: p.colour };
        if (p.curve !== null)
        {
            if (p.role === "batten")
            {
                let i = 0;
                for (const g of battenGeometries(p, p.curve))
                {
                    out.push({ ...base, key: `${p.id}#${i}`, geometry: g });
                    i++;
                }
                continue;
            }
            out.push({ ...base, key: p.id, geometry: shellGeometry(p.curve) });
            const st = straightGeometry(p.curve);
            if (st !== null)
            {
                out.push({ ...base, key: `${p.id}#straight`, geometry: st });
            }
            continue;
        }
        if (p.frame === null)
        {
            continue;
        }
        out.push({ ...base, key: p.id, geometry: flatGeometry(p) });
    }
    return out;
}


// The cushion laid on a seat, over the whole top
export function cushionMesh(c: Carcass): THREE.BufferGeometry | null
{
    if (c.seat === null || c.seat.cushion <= 0)
    {
        return null;
    }
    const h = c.seat.cushion;
    const geo = new THREE.BoxGeometry(c.width, h, c.depth);
    geo.translate(c.x + c.width / 2, c.y + c.height + h / 2, c.z + c.depth / 2);
    geo.scale(MM, MM, MM);
    return geo;
}


// Clothes rails as tubes and LED profiles as thin bars, under the panel above their cell
// a rail, a LED strip or a spot : what lights up carries the colour temperature of its LEDs
export interface FittingMesh
{
    key: string;
    light: boolean;
    kelvin: number | null;
    geometry: THREE.BufferGeometry;
}


export function fittingMeshes(c: Carcass,
                              lay: ResolvedLayout): FittingMesh[]
{
    const out: FittingMesh[] = [];
    const front = c.z + c.depth;
    for (const r of c.rails)
    {
        const rp = railPlan(c, lay, r);
        if (rp === null)
        {
            continue;
        }
        const geo = new THREE.CylinderGeometry(RAIL_D / 2, RAIL_D / 2, rp.length, 16);
        geo.rotateZ(Math.PI / 2);
        geo.translate(c.x + rp.cell.x + rp.cell.w / 2, c.y + rp.axisY, front - rp.axisV);
        geo.scale(MM, MM, MM);  
        out.push({ key: r.id, light: false, kelvin: null, geometry: geo });
    }
    for (const l of c.lights)
    {
        const nb = lay.nodes.get(l.cell);
        if (nb === undefined)
        {
            continue;
        }
        if (l.kind === "spots")
        {
            for (const x of spotCentres(nb, l))
            {
                const disc = new THREE.CylinderGeometry(SPOT_RIM / 2, SPOT_RIM / 2, 2, 24);
                disc.translate(c.x + x, c.y + nb.y + nb.h - 1, front - l.setback - SPOT_RIM / 2);
                disc.scale(MM, MM, MM);
                out.push({ key: `${l.id}/${x}`, light: true, kelvin: l.kelvin, geometry: disc });
            }
            continue;
        }
        const geo = new THREE.BoxGeometry(nb.w - 2 * FIT_PLAY, 2, LED_GROOVE_W);
        geo.translate(c.x + nb.x + nb.w / 2, c.y + nb.y + nb.h - 1, front - l.setback - LED_GROOVE_W / 2);
        geo.scale(MM, MM, MM);
        out.push({ key: l.id, light: true, kelvin: l.kelvin, geometry: geo });
    }
    return out;
}


// Hardware of the build : Häfele feet, runner spaces, hinge cups and Minifix housings, in the frame of their wall
// TODO hinge arms and plates once their sizes are sourced
export function fittedMeshes(list: Fitted[]): { key: string; item: string; hidden: boolean;
                                                 geometry: THREE.BufferGeometry }[]
{
    const out: { key: string; item: string; hidden: boolean; geometry: THREE.BufferGeometry }[] = [];
    for (const f of list)
    {
        const [a, b, c] = f.axes.map((v) =>
        {
            return new THREE.Vector3(...v);
        }) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        let geo: THREE.BufferGeometry;
        const m = new THREE.Matrix4();
        if (f.shape === "box")
        {
            geo = new THREE.BoxGeometry(2 * f.half[0], 2 * f.half[1], 2 * f.half[2]);
            m.makeBasis(a, b, new THREE.Vector3().crossVectors(a, b));
        }
        else
        {
            // a three.js cylinder stands on y : y becomes the axis, a right handed basis keeps the faces outwards
            geo = new THREE.CylinderGeometry(f.half[0], f.half[0], 2 * f.half[2], 24);
            m.makeBasis(a, c, new THREE.Vector3().crossVectors(a, c));
        }
        m.setPosition(f.centre[0], f.centre[1], f.centre[2]);
        geo.applyMatrix4(m);
        geo.scale(MM, MM, MM);
        out.push({ key: f.key, item: f.item, hidden: f.hidden, geometry: geo });
    }
    return out;
}


// The rail on its axis, and the ladder shown upright under it : its slope belongs to its maker
export function ladderMeshes(l: LadderRail): THREE.BufferGeometry[]
{
    const r = l.railDiameter / 2;
    const rail = new THREE.CylinderGeometry(r, r, l.width, 16);
    rail.rotateZ(Math.PI / 2);
    rail.translate(l.x + l.width / 2, l.y, l.z + r);
    const out = [rail];
    for (const x of [l.x + l.ladderAt + r, l.x + l.ladderAt + l.ladderWidth - r])
    {
        const stile = new THREE.CylinderGeometry(r, r, l.y, 12);
        stile.translate(x, l.y / 2, l.z + 3 * r);
        out.push(stile);
    }
    for (const g of out)
    {
        g.scale(MM, MM, MM);
    }
    return out;
}


export type DeviceSkin = "body" | "grille" | "brass";


// An appliance in the frame of its wall : a block, or an amplifier cabinet whose front is a grille and whose top
// carries a brass plate with its knobs. Those details follow photographs by eye, they are not dimensioned and no
// check reads them, only the overall box counts
export function deviceMeshes(d: Device): { skin: DeviceSkin; geometry: THREE.BufferGeometry }[]
{
    const out: { skin: DeviceSkin; geometry: THREE.BufferGeometry }[] = [];
    const piece = (skin: DeviceSkin, geometry: THREE.BufferGeometry, at: [number, number, number]): void =>
    {
        geometry.translate(...at);
        out.push({ skin, geometry });
    };
    // built standing, then laid on its flank when it is taller than wide, its top turned to +x
    const onFlank = d.look === "amplifier" && d.height > d.width;
    const W = onFlank ? d.height : d.width;
    const H = onFlank ? d.width : d.height;
    const D = d.depth;
    if (d.look !== "amplifier")
    {
        piece("body", new THREE.BoxGeometry(W, H, D), [W / 2, H / 2, D / 2]);
    }
    else
    {
        // the knobs inside the overall size, the cabinet lower by their height, the grille 1 mm proud of it
        const plate = Math.min(D * 0.25, 45);
        const knobH = plate * 0.3;
        const top = H - knobH - 1;
        const border = Math.min(W, top) * 0.08;
        piece("body", new THREE.BoxGeometry(W, top, D - 1), [W / 2, top / 2, (D - 1) / 2]);
        piece("grille", new THREE.BoxGeometry(W - 2 * border, top - 2 * border, 1), [W / 2, top / 2, D - 0.5]);
        const along = D - 1 - border - plate / 2;
        piece("brass", new THREE.BoxGeometry(W - 2 * border, 1, plate), [W / 2, top + 0.5, along]);
        let k = 0;
        while (k < 3)
        {
            const knob = new THREE.CylinderGeometry(plate * 0.22, plate * 0.22, knobH, 20);
            piece("brass", knob, [W * (0.58 + 0.12 * k), top + 1 + knobH / 2, along]);
            k++;
        }
        piece("brass", new THREE.BoxGeometry(plate * 0.12, knobH, plate * 0.12), [W * 0.42, top + 1 + knobH / 2, along]);
    }
    const place = new THREE.Matrix4();
    if (onFlank)
    {
        // a quarter turn about z : the standing top at +x, its left end down on the floor of the appliance
        place.makeRotationZ(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, W, 0));
    }
    place.premultiply(new THREE.Matrix4().makeTranslation(d.x, d.y, d.z));
    place.premultiply(new THREE.Matrix4().makeScale(MM, MM, MM));
    for (const p of out)
    {
        p.geometry.applyMatrix4(place);
    }
    return out;
}


export function screenMesh(sc: Screen,
    at: ScreenSpot = { label: "", cx: sc.cx, bottom: sc.bottom, z: sc.z, yaw: 0 }): THREE.BufferGeometry
{
    // a set of unknown thickness keeps the 40 mm it was always shown with, its front on the screen plane. It turns
    // about the middle of its back, where the arm holds it, as screenFootprint does
    const { w, h, d } = screenSize(sc);
    const t = d > 0 ? d : 40;
    const geo = new THREE.BoxGeometry(w, h, t);
    geo.translate(0, h / 2, t / 2);
    geo.rotateY(at.yaw * Math.PI / 180);
    geo.translate(at.cx, at.bottom, d > 0 ? at.z - d : at.z);
    geo.scale(MM, MM, MM);
    return geo;
}


// The plate on the wall and a rod from it to the back of the screen where the arm holds it
export function armMesh(sc: Screen, at: ScreenSpot): THREE.BufferGeometry | null
{
    const arm = sc.arm;
    if (arm === null || arm.plateW <= 0 || arm.plateH <= 0)
    {
        return null;
    }
    const { h, d } = screenSize(sc);
    const plate = new THREE.BoxGeometry(arm.plateW, arm.plateH, 10);
    plate.translate(arm.x, arm.y, 5);
    const from = new THREE.Vector3(arm.x, arm.y, 10);
    const to = new THREE.Vector3(at.cx, at.bottom + h / 2, at.z - d);
    const length = Math.max(1, from.distanceTo(to));
    const rod = new THREE.CylinderGeometry(15, 15, length, 12);
    rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0),
                                                                  to.clone().sub(from).normalize()));
    rod.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    const geo = mergeGeometries([plate.toNonIndexed(), rod.toNonIndexed()])!;
    geo.scale(MM, MM, MM);
    return geo;
}


// What the back of the screen can sweep : the half ring in front of the plate between the folded and stretched reach
// as tall as the screen and centred on the plate, seen from any side where a flat ring would show edge on
export function armZoneMesh(sc: Screen): THREE.BufferGeometry | null
{
    const arm = sc.arm;
    if (arm === null || arm.reachMax <= 0)
    {
        return null;
    }
    const { h } = screenSize(sc);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, arm.reachMax, 0, Math.PI, false);
    shape.absarc(0, 0, arm.reachMin, Math.PI, 0, true);
    const tall = h > 0 ? h : arm.plateH;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: tall, bevelEnabled: false, curveSegments: 48 });
    // drawn along the wall and into the room, then stood up : the extrusion runs downwards from the top of the screen
    geo.rotateX(Math.PI / 2);
    geo.translate(arm.x, arm.y + tall / 2, 0);
    geo.scale(MM, MM, MM);
    return geo;
}
