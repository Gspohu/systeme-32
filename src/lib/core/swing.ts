// Fronts swept through their opening : what each one hits on its way, and which ones cannot stadn open together

import type { Project, Wall } from "./model";
import type { Build, Motion, Part, PartRole } from "./parts";
import type { Check } from "./check";
import type { Vec3 } from "./geometry";
import { sideWallDepth, toRoom } from "./room";
import { shownSideWalls } from "./room_dressing";

// A touch is not a clash : boards laid face to face or a front on the edges of its carcass
const TOUCH = 1;
// steps through a turn and along a slide, about every 10 deg of a door
const TURN_STEPS = 11;
const SLIDE_STEPS = 6;
// A closed front this close to the hinge line of a door is Blum's gap F, checked with the hinges
const HINGE_NEIGHBOUR = 6;
// A door that opens square is usable, past that it falls short of its hinges
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


// The box of the wall frame brought into the room, where items of two walls meet
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


// Distance from the hinge line of a turn to a box, along the plane square to that line
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


// How far a box reaches past the planes of the room walls standing, in mm, 0 when it stays inside
function pastWalls(o: Obb, p: Project, sides: Set<"left" | "right">): { wall: string; by: number } | null
{
    const reach = (k: 0 | 1 | 2): number =>
    {
        return Math.abs(o.half[0] * o.axes[0][k]) + Math.abs(o.half[1] * o.axes[1][k]) + Math.abs(o.half[2] *
            o.axes[2][k]);
    };
    const [x0, x1] = [o.centre[0] - reach(0), o.centre[0] + reach(0)];
    const z0 = o.centre[2] - reach(2);
    if (z0 < -TOUCH)
    {
        return { wall: "le mur du fond", by: -z0 };
    }
    if (sides.has("left") && x0 < -TOUCH && z0 < sideWallDepth(p.room, "left"))
    {
        return { wall: "le mur gauche", by: -x0 };
    }
    if (sides.has("right") && x1 > p.room.width + TOUCH && z0 < sideWallDepth(p.room, "right"))
    {
        return { wall: "le mur droit", by: x1 - p.room.width };
    }
    return null;
}


// Every door stopped at the last whole degree before it, or what it carries, goes through a wall of the room :
// the 3D view and the checks open it that far and no further
export function stopAtWalls(p: Project, b: Build): void
{
    const sides = shownSideWalls(p);
    const wallOf = new Map(p.items.map((it) =>
    {
        return [it.id, it.wall];
    }));
    const boxes = new Map<string, Obb>();
    for (const q of b.parts)
    {
        const box = partBox(q);
        if (box !== null)
        {
            boxes.set(q.id, box);
        }
    }
    for (const f of b.fitted)
    {
        if (f.host !== null)
        {
            boxes.set(f.key, { centre: f.centre, axes: f.axes, half: f.half });
        }
    }
    for (const m of b.motions)
    {
        if (m.kind !== "turn")
        {
            continue;
        }
        const wall = wallOf.get(m.item) ?? "back";
        const moved = [...m.parts, ...b.fitted.filter((f) =>
        {
            return f.host !== null && m.parts.includes(f.host);
        }).map((f) =>
        {
            return f.key;
        })].flatMap((id) =>
        {
            const box = boxes.get(id);
            return box === undefined ? [] : [box];
        });
        // A door whose every corner stays further from the walls than the pivot is, whatever the turn, is let be
        const reach = Math.max(0, ...moved.map((box) =>
        {
            const off = add(box.centre, m.pivot, -1);
            return Math.hypot(...off) + Math.hypot(...box.half);
        }));
        const pivot = toRoom(wall, p.room, m.pivot);
        const near = pivot[2] - reach < 0 || (sides.has("left") && pivot[0] - reach < 0)
            || (sides.has("right") && pivot[0] + reach > p.room.width);
        if (!near)
        {
            continue;
        }
        const hitAt = (deg: number): { wall: string; by: number } | null =>
        {
            const at = { ...m, amount: deg };
            for (const box of moved)
            {
                const h = pastWalls(inRoom(carried(box, at, 1), wall, p), p, sides);
                if (h !== null)
                {
                    return h;
                }
            }
            return null;
        };
        // Every 5 deg, then degree by degree in the last stretch before the first one that hits
        let coarse = 5;
        while (coarse < m.amount + 5 && hitAt(Math.min(coarse, m.amount)) === null)
        {
            coarse += 5;
        }
        let deg = coarse - 4;
        while (deg <= Math.min(coarse, m.amount))
        {
            const hit = hitAt(deg);
            if (hit !== null)
            {
                m.full = m.amount;
                m.stoppedBy = hit.wall;
                m.amount = deg - 1;
                break;
            }
            deg++;
        }
    }
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
        if (m.stoppedBy === undefined)
        {
            continue;
        }
        const said = `${m.label} : ${m.stoppedBy} l'arrête à ${m.amount}° au lieu des ${m.full}° de ses charnières`;
        checks.push(m.amount < SQUARE
            ? { level: "warning", item: m.item, target: m.parts[0] ?? null,
                message: `${said}, elle ne s'ouvre pas d'équerre. Élargir le fileur côté mur ou poser les charnières de `
                    + "l'autre côté." }
            : { level: "info", item: m.item, target: m.parts[0] ?? null, message: `${said}.` });
    }
    for (const m of b.motions)
    {
        const mine = new Set(movingOf(m));
        // The neighbours of the hinge line, in the frame of the wall like the motion
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
        // A door stopped past square still opens, it only fall short of what its hinges allow
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
    // Two fronts open at once : the leaves of one sliding front move together and are left out
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
