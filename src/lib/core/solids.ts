// Every volume the 3D view draws, in room millimetres, with its bounding box and its true shape : clashes.ts
// and support.ts judge them
// TODO the hinge arm and its plate (174H7100E, 173H7100 on inset doors) are no volume yet : p. 146 gives the hole
// pattern, not the plate outline

import { at, tessellate, type Vec3 } from "./geometry";
import { battenAngle, bevelU, unbevelU, type Build, type CurveShape, type Fitted, type Part } from "./parts";
import type { Item, Project } from "./model";
import type { Purpose } from "./part_types";
import { toRoom, toWall } from "./room";

// contact is not a clash : boards but against each other and a Häfele foot plate sits on the floor
export const CLASH_TOL = 0.5;


export interface Solid
{
    key: string;
    item: string;
    label: string;
    min: Vec3;
    max: Vec3;
    // the point lies inside, deeper than `tol` from every face
    holds: (p: Vec3, tol: number) => boolean;
    // a box : three dot products, asked before a board outline
    cheap: boolean;
    // the part this hardware is let into, never a clash with it
    host: string | null;
    // the part this volume belongs to, several for battens on an arc, none for hardware
    part: string | null;
    // what a piece of hardware is there for, null for a board
    purpose: Purpose | null;
}


function dot(a: Vec3, b: Vec3): number
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}


function sub(a: Vec3, b: Vec3): Vec3
{
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}


function boxOf(points: Vec3[]): { min: Vec3; max: Vec3 }
{
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of points)
    {
        let k = 0;
        while (k < 3)
        {
            min[k] = Math.min(min[k]!, p[k]!);
            max[k] = Math.max(max[k]!, p[k]!);
            k++;
        }
    }
    return { min, max };
}


// inside the polygon and futher than tol from each of its edges
function insidePolygon(poly: [number, number][], x: number, y: number, tol: number): boolean
{
    let inside = false;
    let i = 0;
    let j = poly.length - 1;
    while (i < poly.length)
    {
        const [xi, yi] = poly[i]!;
        const [xj, yj] = poly[j]!;
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi))
        {
            inside = !inside;
        }
        j = i;
        i++;
    }
    // most points fall outside : the distances to the edges are only worth it for the others
    if (!inside || tol <= 0)
    {
        return inside;
    }
    i = 0;
    j = poly.length - 1;
    while (i < poly.length)
    {
        const [xi, yi] = poly[i]!;
        const [xj, yj] = poly[j]!;
        const ex = xj - xi;
        const ey = yj - yi;
        const len2 = ex * ex + ey * ey;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * ex + (y - yi) * ey) / len2)) : 0;
        if (Math.hypot(x - xi - t * ex, y - yi - t * ey) <= tol)
        {
            return false;
        }
        j = i;  
        i++;
    }
    return true;
}


// a box turned in the horizontal or vertical plane : half sizes along its own three directions
function orientedBox(centre: Vec3, axes: [Vec3, Vec3, Vec3], half: Vec3): (q: Vec3, tol: number) => boolean
{
    return (q, tol) =>
    {
        const d = sub(q, centre);
        let k = 0;
        while (k < 3)
        {
            // written as the passing side : a NaN coordinate counts as outside, never inside
            if (!(Math.abs(dot(d, axes[k]!)) < half[k]! - tol))
            {
                return false;
            }
            k++;
        }
        return true;
    };
}


function corners(centre: Vec3, axes: [Vec3, Vec3, Vec3], half: Vec3): Vec3[]
{
    const out: Vec3[] = [];
    for (const s0 of [-1, 1])
    {
        for (const s1 of [-1, 1])
        {
            for (const s2 of [-1, 1])
            {
                const p: Vec3 = [centre[0], centre[1], centre[2]];
                let k = 0;
                while (k < 3)
                {
                    p[k] = p[k]! + s0 * half[0] * axes[0][k]! + s1 * half[1] * axes[1][k]! + s2 * half[2] * axes[2][k]!;
                    k++;
                }
                out.push(p);
            }
        }
    }
    return out;
}


interface Shape
{
    points: Vec3[];
    holds: (q: Vec3, tol: number) => boolean;
    cheap?: boolean;
}


// directions of the arc plane and of the cylinder axis
function curveAxes(c: CurveShape): { rad: (ang: number) => Vec3; tan: (ang: number) => Vec3; axis: Vec3 }
{
    if (c.axis === "y")
    {
        return {
            rad: (ang) =>
            {
                return [Math.cos(ang), 0, Math.sin(ang)];
            },
            tan: (ang) =>
            {
                return [-Math.sin(ang), 0, Math.cos(ang)];
            },
            axis: [0, 1, 0],
        };
    }
    return {
        rad: (ang) =>
        {
            return [Math.cos(ang), Math.sin(ang), 0];
        },
        tan: (ang) =>
        {
            return [-Math.sin(ang), Math.cos(ang), 0];
        },
        axis: [0, 0, 1],
    };
}


function withinSweep(a: number, a0: number, a1: number, slack: number): boolean
{
    const sweep = a1 - a0;
    let t = a - a0;
    if (sweep >= 0)
    {
        t = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        return t > slack && t < sweep - slack;
    }
    t = -((((-t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    return t < -slack && t > sweep + slack;
}


// a skin on its arc, and the flat run that continue it
function shellShapes(c: CurveShape): Shape[]
{
    const ax = curveAxes(c);
    const rOut = Math.abs(c.rOuter);
    const rIn = Math.max(0, rOut - c.thickness);
    const points: Vec3[] = [];
    let i = 0;
    while (i <= 32)
    {
        const a = c.a0 + (c.a1 - c.a0) * i / 32;
        for (const r of [rOut, rIn])
        {
            for (const s of [c.from, c.to])
            {
                const rd = ax.rad(a);
                points.push([c.centre[0] + r * rd[0] + s * ax.axis[0], c.centre[1] + r * rd[1] + s * ax.axis[1],
                             c.centre[2] + r * rd[2] + s * ax.axis[2]]);
            }
        }
        i++;
    }
    const out: Shape[] = [{
        points,   
        holds: (q, tol) =>
        {
            const d = sub(q, c.centre);
            const along = dot(d, ax.axis);
            const x = dot(d, ax.rad(0));
            const y = dot(d, ax.tan(0));
            const r = Math.hypot(x, y);
            return along > c.from + tol && along < c.to - tol && r > rIn + tol && r < rOut - tol
                && withinSweep(Math.atan2(y, x), c.a0, c.a1, tol / Math.max(r, 1));
        },
    }];
    if (c.straight > 0 && c.axis === "y")
    {
        const x = c.centre[0] + Math.cos(c.straightAt) * (rOut - c.thickness / 2);
        const centre: Vec3 = [x, c.centre[1] + (c.from + c.to) / 2, c.centre[2] - c.straight / 2];
        const axes: [Vec3, Vec3, Vec3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const half: Vec3 = [c.thickness / 2, (c.to - c.from) / 2, c.straight / 2];
        out.push({ points: corners(centre, axes, half), holds: orientedBox(centre, axes, half), cheap: true });
    }
    return out;
}


// battens spread along the arc then the flat run, as meshes.ts lays them
function battenShapes(p: Part, c: CurveShape): Shape[]
{
    const ax = curveAxes(c);
    const r = Math.abs(c.rOuter) - c.thickness / 2;
    const arc = Math.abs(c.a1 - c.a0) * r;
    const total = arc + c.straight;
    const half: Vec3 = [c.thickness / 2, p.width / 2, (c.to - c.from) / 2];
    const out: Shape[] = [];
    let i = 0;
    while (i < p.quantity)
    {
        const s = total * (i + 0.5) / p.quantity;
        let centre: Vec3;
        let axes: [Vec3, Vec3, Vec3];
        if (s <= arc)
        {
            const a = battenAngle(c, s, arc);
            const rd = ax.rad(a);
            const mid = (c.from + c.to) / 2;
            centre = [c.centre[0] + r * rd[0] + mid * ax.axis[0], c.centre[1] + r * rd[1] + mid * ax.axis[1],
                      c.centre[2] + r * rd[2] + mid * ax.axis[2]];
            axes = [rd, ax.tan(a), ax.axis];
        }
        else
        {
            const x = c.centre[0] + Math.cos(c.straightAt) * r;
            centre = [x, c.centre[1] + (c.from + c.to) / 2, c.centre[2] - (s - arc)];
            axes = [[1, 0, 0], [0, 0, 1], [0, 1, 0]];
        }
        out.push({ points: corners(centre, axes, half), holds: orientedBox(centre, axes, half), cheap: true });
        i++;
    }
    return out;
}


function flatShape(p: Part): Shape | null
{
    if (p.frame === null)
    {
        return null;
    }
    const f = p.frame;
    const poly = tessellate(p.outline, 3);
    const holes = p.cutouts.map((h) =>
    {
        return tessellate(h, 3);
    });
    const points: Vec3[] = [];
    for (const [u, v] of poly)
    {
        points.push(at(f, u, v, 0), at(f, bevelU(p, u, p.thickness), v, p.thickness));
    }
    return {
        points,
        holds: (q, tol) =>
        {
            const d = sub(q, f.o);
            const w = dot(d, f.n);
            const u = unbevelU(p, dot(d, f.u), w);
            const v = dot(d, f.v);
            if (w <= tol || w >= p.thickness - tol || !insidePolygon(poly, u, v, tol))
            {
                return false;
            }
            return !holes.some((h) =>
            {
                return insidePolygon(h, u, v, -tol);
            });
        },
    };
}


function partShapes(p: Part): Shape[]
{
    if (p.curve !== null)
    {
        return p.role === "batten" ? battenShapes(p, p.curve) : shellShapes(p.curve);
    }
    const s = flatShape(p);
    return s === null ? [] : [s];
}


// a shape built in the frame of its wall, carried into the room
function placed(it: Item, project: Project, key: string, label: string, s: Shape, host: string | null,
                part: string | null, purpose: Purpose | null): Solid
{
    const room = project.room;
    return {
        key, item: it.id, label, host, part, purpose,
        ...boxOf(s.points.map((q) =>
        {
            return toRoom(it.wall, room, q);
        })),
        holds: (q, tol) =>
        {
            return s.holds(toWall(it.wall, room, q), tol);
        },
        cheap: s.cheap === true,
    };
}


// a piece of hardware : a box, or a cylinder tested on its radius
function fittedShape(f: Fitted): Shape  
{
    const points = corners(f.centre, f.axes, f.half);
    if (f.shape === "box")
    {
        return { points, holds: orientedBox(f.centre, f.axes, f.half), cheap: true };
    }
    return {
        points, cheap: true,
        holds: (q, tol) =>
        {
            const d = sub(q, f.centre);
            return Math.abs(dot(d, f.axes[2])) < f.half[2] - tol
                && Math.hypot(dot(d, f.axes[0]), dot(d, f.axes[1])) < f.half[0] - tol;
        },
    };
}


export function solids(project: Project, b: Build): Solid[]
{
    const items = new Map(project.items.map((it) =>
    {
        return [it.id, it];
    }));
    const out: Solid[] = [];
    for (const p of b.parts)
    {
        const it = items.get(p.item);
        if (it === undefined)
        {
            continue;
        }
        const shapes = partShapes(p);
        let i = 0;
        while (i < shapes.length)
        {
            const key = shapes.length > 1 ? `${p.id}#${i}` : p.id;
            out.push(placed(it, project, key, `${p.itemName} : ${p.label}`, shapes[i]!, null, p.id, null));
            i++;
        }
    }
    for (const f of b.fitted)
    {
        const it = items.get(f.item);
        if (it !== undefined)
        {
            out.push(placed(it, project, f.key, `${it.name} : ${f.label}`, fittedShape(f), f.host, null, f.purpose));
        }
    }
    return out;
}


