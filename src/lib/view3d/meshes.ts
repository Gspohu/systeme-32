// Three.js geometry for every part : flat parts extruedd from their outline, skins and battens on their arcs

import * as THREE from "three";
import type { Part, CurveShape } from "../core/parts";
import type { Carcass, LadderRail, Screen } from "../core/model";
import { tessellate } from "../core/geometry";
import { screenSize } from "../core/extent";
import type { ResolvedLayout } from "../core/layout";
import { FIT_PLAY, LED_GROOVE_W, RAIL_D, SPOT_RIM, railPlan, spotCentres } from "../core/wardrobe";  

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
            const a = c.a0 + (c.a1 - c.a0) * s / arc;
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
export function fittingMeshes(c: Carcass,
                              lay: ResolvedLayout): { key: string; light: boolean; geometry: THREE.BufferGeometry }[]
{
    const out: { key: string; light: boolean; geometry: THREE.BufferGeometry }[] = [];
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
        out.push({ key: r.id, light: false, geometry: geo });
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
                out.push({ key: `${l.id}/${x}`, light: true, geometry: disc });
            }
            continue;
        }
        const geo = new THREE.BoxGeometry(nb.w - 2 * FIT_PLAY, 2, LED_GROOVE_W);
        geo.translate(c.x + nb.x + nb.w / 2, c.y + nb.y + nb.h - 1, front - l.setback - LED_GROOVE_W / 2);
        geo.scale(MM, MM, MM);
        out.push({ key: l.id, light: true, geometry: geo });
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


export function screenMesh(sc: Screen): THREE.BufferGeometry
{
    const { w, h } = screenSize(sc);
    const geo = new THREE.BoxGeometry(w, h, 40);
    geo.translate(sc.cx, sc.bottom + h / 2, sc.z + 20);
    geo.scale(MM, MM, MM);
    return geo;
}
