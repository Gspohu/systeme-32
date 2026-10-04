// Fronts swept through their opening : what each one hits on its way, and which ones cannot stadn open together

import type { Project, Wall } from "./model";
import type { Build, Motion, Part, PartRole } from "./parts";
import type { Check } from "./check";
import type { Vec3 } from "./geometry";
import { toRoom } from "./room";

// a touch is not a clash : boards laid face to face or a front on the edges of its carcass
const TOUCH = 1;
// steps through a turn and along a slide, about every 10 deg of a door
const TURN_STEPS = 11;
const SLIDE_STEPS = 6;
// a closed front this close to the hinge line of a door is Blum's gap F, checked with the hinges
const HINGE_NEIGHBOUR = 6;
// a door that opens square is usable, past that it falls short of its hinges
const SQUARE = 90;
const FRONT_ROLES: PartRole[] = ["door", "drawerFront", "leaf", "flap", "panel"];

interface Obb
{
    centre: Vec3;
    axes: [Vec3, Vec3, Vec3];
    half: Vec3;
}

interface Solid
{
    id: string;
    label: string;
    box: Obb;
    front: boolean;
}


function add(a: Vec3, b: Vec3, k = 1): Vec3
{
    return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}


function dot(a: Vec3, b: Vec3): number
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}


function cross(a: Vec3, b: Vec3): Vec3
{
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}


// Rodrigues : v turned by `rad` about the unit vctor k
function turn(v: Vec3, k: Vec3, rad: number): Vec3
{
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const kv = cross(k, v);
    const d = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}


function partBox(p: Part): Obb | null
{
    const f = p.frame;
    if (f === null)
    {
        return null;
    }
    const centre = add(add(add(f.o, f.u, p.length / 2), f.v, p.width / 2), f.n, p.thickness / 2);
    return { centre, axes: [f.u, f.v, f.n], half: [p.length / 2, p.width / 2, p.thickness / 2] };
}


// the box of the wall frame brought into the room, where items of two walls meet
function inRoom(b: Obb, wall: Wall, p: Project): Obb
{
    const zero = toRoom(wall, p.room, [0, 0, 0]);
    const dir = (v: Vec3): Vec3 =>
    {
        return add(toRoom(wall, p.room, v), zero, -1);
    };
    return { centre: toRoom(wall, p.room, b.centre), axes: [dir(b.axes[0]), dir(b.axes[1]), dir(b.axes[2])],
             half: b.half };
}


// The box carried a fraction `s` of the way open, in the frame of its wall
export function carried(b: Obb, m: Motion, s: number): Obb
{
    if (m.kind === "slide")
    {
        return { ...b, centre: add(b.centre, m.axis, m.amount * s) };
    }
    const rad = m.amount * s * Math.PI / 180;
    const k = m.axis;
    const centre = add(m.pivot, turn(add(b.centre, m.pivot, -1), k, rad));
    return { centre, axes: [turn(b.axes[0], k, rad), turn(b.axes[1], k, rad), turn(b.axes[2], k, rad)], half: b.half };
}


// Separating axis test of two boxes, each shrunk by TOUCH so that faces in contact do not count
export function boxesClash(a: Obb, b: Obb): boolean
{
    const t = add(b.centre, a.centre, -1);
    const axes: Vec3[] = [...a.axes, ...b.axes];
    for (const u of a.axes)
    {
        for (const v of b.axes)
        {
            const w = cross(u, v);
            if (dot(w, w) > 1e-9)
            {
                axes.push(w);
            }
        }
    }
    for (const l of axes)
    {
        const n = Math.sqrt(dot(l, l));
        const reach = (o: Obb): number =>
        {
            return (o.half[0] * Math.abs(dot(o.axes[0], l)) + o.half[1] * Math.abs(dot(o.axes[1], l))
                + o.half[2] * Math.abs(dot(o.axes[2], l))) / n;
        };
        if (reach(a) + reach(b) - Math.abs(dot(t, l)) / n <= TOUCH)
        {
            return false;
        }
    }
    return true;
}


// distance from the hinge line of a turn to a box, along the plane square to that line
function offHinge(m: Motion, b: Obb): number
{
    const k = m.axis;
    const d = add(b.centre, m.pivot, -1);
    const across = add(d, k, -dot(d, k));
    const r = Math.sqrt(dot(across, across));
    const reach = Math.abs(b.half[0] * dot(b.axes[0], across)) + Math.abs(b.half[1] * dot(b.axes[1], across))
        + Math.abs(b.half[2] * dot(b.axes[2], across));
    return r - (r > 0 ? reach / r : 0);
}


export function swingChecks(p: Project, b: Build): Check[]
{
    const walls = new Map(p.items.map((it) =>
    {
        return [it.id, it.wall];
    }));
    const wallOf = (item: string): Wall =>
    {
        return walls.get(item) ?? "back";
    };
    const local = new Map<string, Obb>();
    const solids: Solid[] = [];
    for (const q of b.parts)
    {
        const box = partBox(q);
        if (box !== null)
        {
            local.set(q.id, box);
            solids.push({ id: q.id, label: `${q.itemName}, ${q.label.toLowerCase()}`, box: inRoom(box,
                wallOf(q.item), p),
                          front: FRONT_ROLES.includes(q.role) });
        }
    }
    const hosted = new Map<string, string[]>();
    for (const f of b.fitted)
    {
        if (f.hidden)
        {
            continue;
        }
        const box: Obb = { centre: f.centre, axes: f.axes, half: f.half };
        local.set(f.key, box);
        solids.push({ id: f.key, label: f.label, box: inRoom(box, wallOf(f.item), p), front: false });
        if (f.host !== null)
        {
            hosted.set(f.host, [...hosted.get(f.host) ?? [], f.key]);
        }
    }
    const movingOf = (m: Motion): string[] =>
    {
        return m.parts.flatMap((id) =>
        {
            return [id, ...hosted.get(id) ?? []];
        });
    };
    const pose = (m: Motion, s: number): Obb[] =>
    {
        return movingOf(m).flatMap((id) =>
        {
            const box = local.get(id);
            return box === undefined ? [] : [inRoom(carried(box, m, s), wallOf(m.item), p)];
        });
    };
    const checks: Check[] = [];
    for (const m of b.motions)
    {
        const mine = new Set(movingOf(m));
        // the neighbours of the hinge line, in the frame of the wall like the motion
        const spared = new Set<string>();
        for (const s of solids)
        {
            const box = local.get(s.id);
            if (m.kind === "turn" && s.front && box !== undefined && offHinge(m, box) < HINGE_NEIGHBOUR)
            {
                spared.add(s.id);
            }
        }
        const steps = m.kind === "turn" ? TURN_STEPS : SLIDE_STEPS;
        let hit: { s: Solid; at: number } | null = null;
        let k = 1;
        while (hit === null && k <= steps)
        {
            const moving = pose(m, k / steps);
            const s = solids.find((x) =>
            {
                return !mine.has(x.id) && !spared.has(x.id) && moving.some((a) =>
                {
                    return boxesClash(a, x.box);
                });
            });
            hit = s === undefined ? null : { s, at: m.amount * k / steps };
            k++;
        }
        // a door stopped past square still opens, it only fall short of what its hinges allow
        if (hit !== null && m.kind === "turn" && hit.at > SQUARE)
        {
            checks.push({ level: "warning", item: m.item, target: m.parts[0] ?? null,
                          message: `${m.label} : en s'ouvrant (${m.source}), touche ${hit.s.label} vers `
                              + `${Math.round(hit.at)}°, elle ne s'ouvre qu'à ${Math.round(hit.at - m.amount / TURN_STEPS)}° `
                              + `environ. ${m.remedy}` });
        }
        else if (hit !== null)
        {
            const where = m.kind === "turn" ? `vers ${Math.round(hit.at)}°` : `à ${Math.round(hit.at)} mm`;
            checks.push({ level: "error", item: m.item, target: m.parts[0] ?? null,
                          message: `${m.label} : en s'ouvrant (${m.source}), touche ${hit.s.label} ${where}. ${m.remedy}` });
        }
    }
    // two fronts open at once : the leaves of one sliding front move together and are left out
    const open = b.motions.map((m) =>
    {
        return pose(m, 1);
    });
    let i = 0;
    while (i < b.motions.length)
    {
        let j = i + 1;
        while (j < b.motions.length)
        {
            const [mi, mj] = [b.motions[i]!, b.motions[j]!];
            const meet = mi.front !== mj.front && open[i]!.some((a) =>
            {
                return open[j]!.some((c) =>
                {
                    return boxesClash(a, c);
                });
            });
            if (meet)
            {
                checks.push({ level: "warning", item: mi.item, target: mi.parts[0] ?? null,
                              message: `${mi.label} et ${mj.label.toLowerCase()} se heurtent ouverts ensemble : `
                                  + "n'en ouvrir qu'un à la fois, ou poser les charnières de la porte de l'autre côté." });
            }
            j++;
        }
        i++;
    }
    return checks;
}
