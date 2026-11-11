// Where each bought article stands, read off the drillings that hold it : what a CAD tool places its maker's model at

import { at, neg, X, Y, Z, type Vec3 } from "../geometry";
import type { Build, Fitted, Hole, Part } from "../part_types";
import type { Carcass, Project } from "../model";
import { CLIP_RETURN_DROP, clipDrop, footLong, footPlaces } from "../feet";
import { lightsInTheWay } from "../loose";
import { FLAP_HINGE } from "../drop_flaps";
import { decorById } from "../../data/materials";
import { FRONT_GAP, MINIFIX, MOVENTO, TIPON_ADAPTER } from "../../data/rules";
import { screwOf, type ScrewSpec } from "../../data/screws";
import { AXILO_FEET, EDGE_PULL } from "../../data/hardware";
import type { CadModel } from "../../data/cad_models";

export interface CadScrew extends ScrewSpec
{
    item: string;
    point: Vec3;
    out: Vec3;
    free: number;
    part: string;
    label: string;
    holds?: string;
    joins?: boolean;
}

// The Häfele models : a clip has screws 16 either side on the face of its plate 5.3 thick, the rim of the head over its
// cone of Ø6.3. The plate of a support has two slots Ø6.5 at 0 and 54 of its origin, their centres from -4.7 to 1.3
const CLIP_SCREW_HALF = 16;  
const CLIP_SCREW_FACE = -33.5;
const CLIP_PLATE_BACK = -39.5;
const SUPPORT_MIDDLE = 27;
const SUPPORT_WALL_SCREWS = [0, 54];
const SUPPORT_SCREW_FACE = -2.5;
const SUPPORT_SCREW_LEVEL = -1.7;
// Blum model of the 70T3550.TL
// The screw holes of the cup in each Blum model, 9.5 behind its cup : the crank of the twin one sets both 9.5 further
const CUP_SCREW_X: Record<string, number> = { "70T3550.TL": -16, "70T3650.TL": -25.5 };
const CUP_SCREW_ACROSS = 22.5;
// The 90 degree cone of its hole narrows to 3.8 at 37.3 : a head of 7 with its rim of 0.35 sits with its top
// at 35.35, the door at 38.5
const CUP_SCREW_SEAT = 35.35;
const DOOR_BACK_OFF_SEAT = 2.8;
const HINGE_MODEL_GAP = 1.5;
// The drawn bracket : legs of 2, each drilled Ø5 in its middle, 20 from the corner
const BRACKET_LEG = 2;
const BRACKET_MIDDLE = 20;
const BOLT_REACH = 38;  
const CHIPBOARD_SMALL: ScrewSpec = { kind: "countersunk", diameter: 3.5, length: 15 };
// The slots of the 283.33.910 plate are straight, 6.5 wide through 2.5 of plastic, no cone (measured on the Häfele
// model) : a countersunk head bit 19.9 mm3 into it, a pan head bears flat
const WALL_SCREW: ScrewSpec = { kind: "pan", diameter: 5, length: 50 };
// The plain hole of a steel bracket takes a pan head flat on it
const BRACKET_WALL_SCREW: ScrewSpec = { kind: "pan", diameter: 5, length: 50 };

export interface CadInstance
{
    model: string;
    item: string;
    part: string;
    // The axes of the model in the frame of the wall, right handed
    o: Vec3;
    x: Vec3;
    y: Vec3;
    z: Vec3;
    // The loose carcasses it stops coming out, set before it (loose.ts)
    after?: string[];
    // A screw cap : the purpose of the screw it covers
    covers?: string;
}

// Its own front stops 16.6 before the first screw (Blum model 956.1201), the unit reaching the same front with its
// head 2.1 past its origin, its axis 8 off the side (Blum p. 173)
const ADAPTER_FRONT = 16.6;
const LATCH_HEAD = 2.1;
const DOWEL_LENGTH = 35;


// The 2 drillings of one bolt : the same axis, its heads the length of the bolt apart at most
export function sameBolt(a: Vec3, b: Vec3, way: Vec3, length: number): boolean
{
    const d: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const k = d[0] * way[0] + d[1] * way[1] + d[2] * way[2];
    const off = Math.hypot(d[0] - k * way[0], d[1] - k * way[1], d[2] - k * way[2]);
    return off < 1 && Math.abs(k) <= length + 1;
}


function cross(a: Vec3, b: Vec3): Vec3
{
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}


function along(o: Vec3, way: Vec3, k: number): Vec3
{
    return [o[0] + way[0] * k, o[1] + way[1] * k, o[2] + way[2] * k];
}


// The point of a drilling on its face and the way out of the board
function mouth(q: Part, h: Hole): { o: Vec3; way: Vec3 }
{
    const f = q.frame!;
    return { o: at(f, h.u, h.v, h.face === "A" ? 0 : q.thickness), way: h.face === "A" ? neg(f.n) : f.n };
}


// Any axis square to another, for what turns about its own
function square(a: Vec3): Vec3
{
    return Math.abs(a[1]) < 0.9 ? Y : X;
}


function place(model: string, q: Part, o: Vec3, x: Vec3, y: Vec3): CadInstance
{
    return { model, item: q.item, part: q.label, o, x, y, z: cross(x, y) };
}


export const END_TO_END = ", bout à bout";

// Dowels start at the bottom of the drilling in the face, the one in the edge opposite takes their other end
function dowels(q: Part, out: CadInstance[]): void
{
    for (const h of q.holes)
    {
        if (h.purpose === "dowel" && (h.face === "A" || h.face === "B"))
        {
            const { o, way } = mouth(q, h);
            const x = cross(square(way), way);
            out.push(place("DOWEL_8x35", q, along(o, way, -h.depth), x, cross(way, x)));
        }
        // 2 ends butted, each drilled half its length : placed once, from the board that carries the mark
        if (h.purpose === "dowel" && h.label.endsWith(END_TO_END) && (h.face === "u0" || h.face === "u1"))
        {
            const f = q.frame!;
            const way = h.face === "u0" ? neg(f.u) : f.u;
            const o = at(f, h.face === "u0" ? 0 : q.length, h.v, h.w ?? q.thickness / 2);
            const x = cross(square(way), way);
            out.push(place("DOWEL_8x35", q, along(o, way, -h.depth), x, cross(way, x)));
        }
    }
}


function minifix(q: Part, out: CadInstance[]): void
{
    const f = q.frame!; 
    for (const h of q.holes)
    {
        if (h.purpose === "minifix-bolt")
        {
            // Its x runs from the thread in the board to the head in the housing of the other board
            const { o, way } = mouth(q, h);
            const y = square(way);
            out.push(place("262.28.020", q, o, way, cross(cross(way, y), way)));
        }
        if (h.purpose === "minifix-housing")
        {
            const { o, way } = mouth(q, h);
            const passage = q.holes.find((p) =>
            {
                return p.purpose === "minifix-passage" && (p.face === "u0" || p.face === "u1"
                    ? Math.abs(p.v - h.v) < 0.5 : Math.abs(p.u - h.u) < 0.5);
            });
            const toBolt = passage?.face === "u1" ? f.u : passage?.face === "v0" ? neg(f.v) : passage?.face === "v1"
                ? f.v : neg(f.u);
            // Its z runs into the board, the rim on the face
            const z = neg(way);
            // A little under the face, for a round of edging over it
            out.push(place("262.26.535", q, along(o, way, -MINIFIX.housingSink), toBolt, cross(z, toBolt)));
        }
    }
}


// Blum models the plate and the hinge round one origin : on the side, level with the plate, on the line of its dowels
function hinges(q: Part, out: CadInstance[]): void
{
    const f = q.frame!;
    const dowelsOf = q.holes.filter((h) =>
    {
        return h.purpose === "plate-dowel";
    }).sort((a, b) =>
    {
        return a.v - b.v || a.u - b.u;
    });
    for (let k = 0; k + 1 < dowelsOf.length; k += 2)
    {
        const a = dowelsOf[k]!;
        const b = dowelsOf[k + 1]!;
        const { o, way } = mouth(q, { ...a, u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 });
        // Towards the room, the side counting its v from the front
        const front = neg(f.v);
        // In the frame of the hinge : its dowels run along x, out of the plate into the side
        out.push(place("174H7100E", q, o, neg(way), cross(front, neg(way))));
        // The hinge ordered for that door, its crank set by how the door overlays the panel. The model sets the
        // door 1.3 off the side : its cam takes the rest of the gap
        out.push(place(a.fixes ?? "70T3550.TL", q, along(o, front, FRONT_GAP - HINGE_MODEL_GAP), neg(way),
                       cross(front, neg(way))));
    }
}


// One runner for each row of screws, with the coupling of its hand : its model counts from the hole at 37 of the
// catalogue whichever holes of its profile the screws take
function runners(q: Part, out: CadInstance[]): void
{
    const f = q.frame!;
    const rows = new Map<string, Hole>();
    for (const h of q.holes)
    {
        if (h.purpose === "runner-screw")
        {
            rows.set(`${h.face}/${h.u}`, h);
        }
    }
    for (const h of rows.values())
    {
        const { o, way } = mouth(q, { ...h, v: MOVENTO.frontHoles[1]! });
        const hand = way[0] > 0 ? "left" : "right";
        const front = neg(f.v);
        const x = hand === "left" ? way : neg(way);
        out.push(place(`${h.fixes}.${hand}`, q, o, x, cross(front, x)));
        out.push(place(`T51.7601.${hand}`, q, o, x, cross(front, x)));
    }
}


function pushUnits(q: Part, out: CadInstance[]): void
{
    const f = q.frame!;
    for (const h of q.holes)
    {
        if (h.purpose === "push-latch")
        {
            const v = h.face === "v1" ? q.width : 0;
            const u = h.face === "u1" ? q.length : h.face === "u0" ? 0 : h.u;
            const front = h.face === "v1" ? f.v : h.face === "u1" ? f.u : h.face === "u0" ? neg(f.u) : neg(f.v);
            const up = square(front);
            out.push(place(h.fixes ?? "956.1004", q, at(f, u, h.face === "u0" || h.face === "u1" ? h.v : v,
                                                        h.w ?? q.thickness / 2),
                           cross(up, front), up));
        }
        if (h.purpose === "catch-plate")
        {
            const { o, way } = mouth(q, h);
            // Its z runs into the door, the plate standing proud of it
            const z = neg(way);
            out.push(place(`${h.fixes ?? "956.1004"}.catch`, q, o, cross(Y, z), Y));
        }
    }
    // The front screw of each plate, the one nearest the edge : set back with it behind an inset front
    const screws = q.holes.filter((h) =>
    {
        return h.purpose === "adapter-screw" && !q.holes.some((g) =>
        {
            return g.purpose === "adapter-screw" && g.face === h.face && Math.abs(g.u - h.u) < 0.01 && g.v < h.v;
        });
    });
    for (const h of screws)
    {
        const { o, way } = mouth(q, h);
        const back = f.v;
        const x = neg(way);
        const y = cross(back, x);
        out.push(place("956.1201.box", q, o, x, y)); 
        out.push(place("956.1201.plate", q, o, x, y));
        const front = neg(back);
        const axis = along(along(o, way, TIPON_ADAPTER.axisOffFace), back, LATCH_HEAD - ADAPTER_FRONT);
        out.push(place(h.fixes ?? "956.1004", q, axis, cross(Y, front), Y));
    }
}


// The Oslo pull section, n out past the edge, z out from the back of the front : the sole runs into a nose, then the
// lip falls straight. An arc runs from points[k] to points[k + 1] through mids[k], the flat
// front of 145 sets its corner radius
export interface PullSection
{
    key: string;
    length: number;
    tab: number;
    centres: number;
    points: [number, number][];
    mids: Record<number, [number, number]>;
    // TODO nose radius taken as half the lip drop, too hard to measure by hand until a profile gauge reads it
    lip: { bottom: number; front: number; wall: number; corner: number; nose: number };
    // The countersink of each screw hole on the back of the tab, its radius at that face
    sink: number;
}

// The DIN 7997:2008 head the model draws for the Ø4 screws of the pull, its rim over a cone of 90 degrees
// (din7997def.csv)
function pullHead(): { radius: number; rim: number }
{
    const s = screwOf("handle-screw", "")!;
    const radius = s.head! / 2;
    return { radius, rim: s.headHeight! - (radius - s.diameter / 2) }; 
}

export function handleSection(fitted: Fitted[]): PullSection[]
{
    const out: PullSection[] = [];
    const head = pullHead();
    for (const f of fitted)
    {
        if (f.purpose !== "handle" || !f.key.endsWith("/patte"))
        {
            continue;
        }
        const sole = fitted.find((g) => { return g.key === f.key.replace("/patte", "/semelle"); })!;
        const lip = fitted.find((g) => { return g.key === f.key.replace("/patte", "/levre"); })!;
        const wall = 2 * f.half[2];
        const high = 2 * f.half[1] + wall;
        const thick = 2 * sole.half[2] - wall;
        const lipLong = 2 * lip.half[1];
        const dn = -(high - wall);
        const dz = Math.sqrt(Math.max(lipLong * lipLong - dn * dn, 0));
        const front = thick + dz + wall;
        const bottom = wall / 2 + dn;
        const r = (high - wall) / 2;
        // The nose about (wall - r, front - r), outside at r, inside at r - wall
        const c: [number, number] = [wall - r, front - r];
        const mid = (radius: number): [number, number] => { return [c[0] + radius * Math.SQRT1_2, c[1] +
                                                                    radius * Math.SQRT1_2]; };
        out.push({ key: f.key, length: 2 * f.half[0], tab: (wall - high) / 2, centres: EDGE_PULL.centres,
                   // The tip of the lip thickens inwards over its last few mm
                   points: [[wall - high, -wall], [wall, -wall], [wall, front - r], [wall - r, front], [bottom, front],
                            [bottom, front - EDGE_PULL.tip.thickness], [bottom + EDGE_PULL.tip.length, front - wall],
                            [wall - r, front - wall], [0, front - r], [0, thick], [0, 0], [wall - high, 0]],
                   mids: { 2: mid(r), 7: mid(r - wall) },
                   lip: { bottom, front, wall, corner: (EDGE_PULL.length - EDGE_PULL.flat) / 2, nose: r },
                   // The head standing headOver proud meets the countersink that much under its top, its rim first
                   sink: head.radius - Math.max(EDGE_PULL.headOver - head.rim, 0) });
    }
    return out;
}


function pulls(b: Build, out: CadInstance[]): void
{
    for (const f of b.fitted) 
    {
        if (f.purpose !== "handle" || !f.key.endsWith("/patte"))
        {
            continue;
        }
        const host = b.parts.find((q) => { return q.id === f.host; })!;
        const [runs, away, z] = f.axes;
        // The corner of the edge, the volume standing half its size away from it
        const o = along(along(f.centre, away, f.half[1]), z, f.half[2]);
        out.push({ model: "84335807", item: host.item, part: host.label, o, x: runs, y: away, z });
    }
}


// A screw found in the frame of a model, its head at `p`, leaving along `away`
function modelScrew(i: CadInstance, p: Vec3, away: Vec3, spec: ScrewSpec, label: string): CadScrew
{
    const world = (v: Vec3): Vec3 =>
    {
        return [i.x[0] * v[0] + i.y[0] * v[1] + i.z[0] * v[2], i.x[1] * v[0] + i.y[1] * v[1] + i.z[1] * v[2],
                i.x[2] * v[0] + i.y[2] * v[1] + i.z[2] * v[2]];
    };
    const q = world(p);
    return { ...spec, item: i.item, point: [i.o[0] + q[0], i.o[1] + q[1], i.o[2] + q[2]], out: world(away), free: 0,
             part: i.part, label };
}


// Every foot at its axis : Häfele's models take their origin at the underside of the carcass, the mounting plate
// turned with its long side to the middle
function feet(c: Carcass, b: Build, out: CadInstance[], screws: CadScrew[]): void
{
    const places = footPlaces(c);
    const name = { item: c.id, part: "Socle" };
    const front = Math.max(...places.map((f) => { return f.z; }));
    const lowX = Math.min(...places.map((f) => { return f.x; }));
    const highX = Math.max(...places.map((f) => { return f.x; }));
    places.forEach((f, n) =>
    {
        const shaft = b.fitted.find((g) => { return g.key === `${c.id}/pied${n}/fut`; });
        const top = f.floor + f.height;
        const o: Vec3 = [f.x, top, f.z];
        out.push({ ...name, model: shaft?.ref ?? "637.76.353", o, x: X, y: neg(Z), z: Y });
        const { dx, dz } = footLong(c, f);
        const long: Vec3 = [dx, 0, dz];
        out.push({ ...name, model: "637.76.333", o, x: long, y: cross(Y, long), z: Y });
        if (c.base.type !== "plinth")
        {
            return;
        }
        const ref = shaft?.ref ?? "637.76.353";
        const drop = clipDrop(AXILO_FEET.find((a) => { return a.ref === ref; }));
        if (drop === null)
        {
            return;
        }
        const mid = top - drop;
        const turns: Vec3[] = [];
        if (f.z === front)
        {
            turns.push(neg(Z));
        }
        const returns = c.base.returns ?? [];
        if (returns.includes("right") && f.x === highX)
        {
            turns.push(neg(X));
        }
        if (returns.includes("left") && f.x === lowX)
        {
            turns.push(X);
        }
        for (const y of turns)
        {
            // Häfele's model is drawn fitted : its origin on the axis, the ring 2.7 off it hooked behind the shaft, the
            // plate on the back of the plinth 39.5 off, against the mounting plate (drawing 637.76.333-1)
            const level = y[2] === 0 ? mid - CLIP_RETURN_DROP : mid;
            const clip: CadInstance = { ...name, model: "637.38.054", o: [f.x, level, f.z], x: cross(y, Y), y, z: Y };
            out.push(clip);
            for (const dx of [-CLIP_SCREW_HALF, CLIP_SCREW_HALF])
            {
                screws.push({ ...modelScrew(clip, [dx, CLIP_SCREW_FACE, 0], Y, CHIPBOARD_SMALL,
                                            "Clip de plinthe : vis 3,5 x 15"),
                              free: CLIP_SCREW_FACE - CLIP_PLATE_BACK, holds: "637.38.054" });   
            }
        }
    });
}


// The pins of the fixed shelves stand out of the side, their tongue up
function shelfPins(q: Part, out: CadInstance[]): void
{
    for (const h of q.holes)
    {
        if (h.purpose === "shelf-pin")
        {
            const { o, way } = mouth(q, h);
            out.push(place("282.24.727", q, o, way, cross(Y, way)));
        }
    }
}


// The screw of a bolt and its sleeve drilled in both boards : one article, its head on the first board drilled
function bolts(q: Part, seen: Vec3[], out: CadInstance[]): void
{
    for (const h of q.holes)
    {
        if (h.purpose === "link-screw" && h.label.includes("267.07"))
        {
            const { o, way } = mouth(q, h);
            if (!seen.some((s) => { return sameBolt(s, o, way, BOLT_REACH); }))
            {
                seen.push(o);
                const y = square(way);
                out.push(place("267.07.903", q, o, way, cross(cross(way, y), way)));
            }
        }
    }
}


// The plate of a concealed support in its pocket against the wall, its pin running into the shelf : the middle of the
// plate stands 27 along its model
function concealed(b: Build, out: CadInstance[], screws: CadScrew[]): void
{
    for (const f of b.fitted)
    {
        if (f.purpose !== "shelf-bracket" || !f.key.endsWith("/platine"))
        {
            continue;
        }
        const host = b.parts.find((q) => { return q.id === f.host; })!;
        const i: CadInstance = { model: f.ref, item: host.item, part: host.label, x: X, y: neg(Z), z: Y,
                                 o: [f.centre[0] - SUPPORT_MIDDLE, f.centre[1], f.centre[2] - f.half[2]] };
        out.push(i);
        for (const dx of SUPPORT_WALL_SCREWS)
        {
            screws.push({ ...modelScrew(i, [dx, SUPPORT_SCREW_FACE, SUPPORT_SCREW_LEVEL], neg(Y), WALL_SCREW,
                                        "Fixation au mur de la platine : vis 5 x 50"), holds: "283.33.910" });
        }
    }
}


// A bracket from the 2 legs the 3D view draws : its model has its outer corner at the origin, x and y along the legs
function brackets(b: Build, out: CadInstance[], screws: CadScrew[]): void
{
    for (const a of b.fitted)
    {
        if (a.ref !== "ANTI_TIP_BRACKET" || !a.key.endsWith("/a"))
        {
            continue;
        }
        const c = b.fitted.find((g) => { return g.key === a.key.replace(/\/a$/, "/b"); })!;
        const thin = (f: Fitted): number =>
        {
            return f.half.indexOf(Math.min(...f.half));
        };
        const ia = thin(a);
        const ib = thin(c);
        const unit = (k: number, s: number): Vec3 =>
        {
            const v: Vec3 = [0, 0, 0];
            v[k] = s > 0 ? 1 : -1;
            return v;
        };
        const y = unit(ia, c.centre[ia]! - a.centre[ia]!);
        const x = unit(ib, a.centre[ib]! - c.centre[ib]!);
        const o: Vec3 = [a.centre[0], a.centre[1], a.centre[2]];
        o[ia] = a.centre[ia]! - y[ia]! * a.half[ia]!;
        o[ib] = c.centre[ib]! - x[ib]! * c.half[ib]!;
        const i: CadInstance = { model: a.ref, item: a.item, part: a.label, o, x, y, z: cross(x, y) };
        out.push(i);
        if (a.purpose === "anti-tip")
        {
            screws.push(modelScrew(i, [BRACKET_LEG, BRACKET_MIDDLE, 0], X, BRACKET_WALL_SCREW,
                                   "Fixation au mur de l'équerre : vis 5 x 50"));
        }
    }
}


// The 2 screws of each hinge cup : Blum's model holds their holes at 22.5 either side and 9.5 behind the cup
function cupScrews(out: CadInstance[], screws: CadScrew[]): void
{
    for (const i of out)
    {
        if (i.model.startsWith("70T"))
        {
            const x = CUP_SCREW_X[i.model];
            if (x === undefined)
            {
                throw new Error(`Vis de cuvette : trous du modèle ${i.model} inconnus, les relever dans son fichier Blum`);
            }
            for (const y of [-CUP_SCREW_ACROSS, CUP_SCREW_ACROSS])
            {
                screws.push({ ...modelScrew(i, [x, y, CUP_SCREW_SEAT], neg(Z), CHIPBOARD_SMALL,
                                            "Cuvette de charnière : vis 3,5 x 15"), free: DOOR_BACK_OFF_SEAT, part: "Porte",
                              holds: i.model });
            }
        }
    }
}


// The parts of a lit cell no maker gives a file for, drawn from the volume the light set : the strip profile an
// aluminium U open towards the cell, the strip in it, the driver and the controller as their housings
const LIGHT_LOOK: Record<string, { label: string; rgb: [number, number, number]; open: boolean }> = {
    LED_PROFILE_SURFACE: { label: "Profilé LED en applique", rgb: [190, 192, 196], open: true },
    LED_PROFILE_RECESS: { label: "Profilé LED encastré", rgb: [190, 192, 196], open: true },
    LED_STRIP_24V: { label: "Ruban LED 24 V", rgb: [250, 232, 170], open: false },
    LED_DRIVER_24V: { label: "Alimentation LED 24 V", rgb: [41, 41, 41], open: false },
    SHELLY_PLUS_RGBW_PM: { label: "Contrôleur Wi-Fi Shelly Plus RGBW PM", rgb: [240, 240, 240], open: false },
};
// Wall of the profile, as the light counts it
const PROFILE_WALL = 1;

function lightModels(p: Project, b: Build, out: CadInstance[], drawn: Record<string, CadModel>): void
{
    const blocking = lightsInTheWay(p, b);
    for (const f of b.fitted)
    {
        const look = LIGHT_LOOK[f.ref];
        if (f.purpose !== "light" || look === undefined)
        {
            continue;
        }
        // Its section across its second and third axes, padded along the first
        const [l, w, h] = [2 * f.half[0], 2 * f.half[1], 2 * f.half[2]];
        const t = PROFILE_WALL;
        const section: [number, number][] = look.open
            ? [[0, 0], [w, 0], [w, h], [w - t, h], [w - t, t], [t, t], [t, h], [0, h]]
            : [[0, 0], [w, 0], [w, h], [0, h]];
        const key = `${f.ref}@${Math.round(l)}x${Math.round(w)}x${Math.round(h * 10) / 10}`;
        drawn[key] = { ref: f.ref, label: look.label, rgb: look.rgb, draw: { section, length: l } };
        const x = f.axes[1];
        const y = f.axes[2];
        const z = cross(x, y);
        const o: Vec3 = [0, 1, 2].map((k) =>
        {
            return f.centre[k]! - x[k]! * w / 2 - y[k]! * h / 2 - z[k]! * l / 2;
        }) as Vec3;
        const stops = blocking.get(f.key)?.map((c) => { return c.id; });
        out.push({ model: key, item: f.item, part: f.label, o, x, y, z,
                  ...(stops === undefined ? {} : { after: stops }) });
    }
}


// The screw caps cut out of the banding (screw_caps.ts) : a disc of its decor and its thickness, its base on the face
// the head is flush with, its axis out of it. Shown see-through for the reviews
function capModels(b: Build, out: CadInstance[], drawn: Record<string, CadModel>): void
{
    for (const f of b.fitted)
    {
        if (f.purpose !== "screw-cap")
        {
            continue;
        }
        const part = f.label.replace(/ : cache-vis$/, "");
        const board = b.parts.find((q) => { return q.item === f.item && q.label === part; });
        const decor = decorById(board?.decor ?? "");
        const [r, h] = [f.half[0], 2 * f.half[2]];
        const key = `EDGE_CAP@${Math.round(2 * r)}x${h}@${decor.id}`;
        drawn[key] = { ref: "EDGE_CAP", label: `Cache-vis ${decor.ref} ${decor.label}`.trim(), rgb: decor.rgb,
                       draw: { cylinder: [r, h] } };
        const z = f.axes[2];
        const o: Vec3 = [0, 1, 2].map((k) => { return f.centre[k]! - z[k]! * h / 2; }) as Vec3;
        // The purpose of the screw it covers, read off its key (screw_caps.ts)
        out.push({ model: key, item: f.item, part, o, x: f.axes[0], y: f.axes[1], z, covers: f.key.split("/")[2] });
    }
}


// The Häfele model of each flap hinge, flap shut, placed from the box of its carcass leaf : model x to the back, y to
// the left, z up. Its 6 supplied screws run along the 30 degree holes as DIN 7997:2008 3 x 20, head 5.6 in a 6.3 bore
const FLAP_HINGE_SCREW: ScrewSpec = { kind: "countersunk", diameter: 3, length: 20, standard: "DIN7997", head: 5.6,
                                      headHeight: 1.65 };

function flapHinges(b: Build, out: CadInstance[], screws: CadScrew[]): void
{
    for (const f of b.fitted)
    {
        if (f.purpose !== "flap-hinge" || !f.key.endsWith("/aile-meuble"))
        {
            continue;
        }
        const mid = FLAP_HINGE.floorLeaf.map(([a, z]) => { return (a + z) / 2; });
        const o: Vec3 = [f.centre[0] + mid[1]!, f.centre[1] - mid[2]!, f.centre[2] + mid[0]!];
        const host = b.parts.find((q) => { return q.id === f.host; });
        const i: CadInstance = { model: FLAP_HINGE.ref, item: f.item, part: host?.label ?? "Abattant", o, x: neg(Z),
                                y: neg(X),
                                 z: Y };
        out.push(i);
        for (const s of FLAP_HINGE.screws)
        {
            const head = [0, 1, 2].map((k) => { return s.at[k]! + s.way[k]! * FLAP_HINGE.seat; }) as Vec3;
            screws.push({ ...modelScrew(i, head, neg(s.way), FLAP_HINGE_SCREW,   
                                        `Charnière d'abattant ${FLAP_HINGE.ref} : vis 3 x 20 fournie`),
                          free: FLAP_HINGE.free, holds: FLAP_HINGE.ref });
        }
    }
}


export function cadHardware(p: Project, b: Build): { instances: CadInstance[]; screws: CadScrew[]; drawn: Record<string,
                                                    CadModel> }
{
    const instances: CadInstance[] = [];
    const screws: CadScrew[] = [];
    const seen: Vec3[] = [];
    for (const q of b.parts)
    {
        if (q.frame === null || q.curve !== null)
        {
            continue;
        }
        dowels(q, instances);
        minifix(q, instances);
        hinges(q, instances);
        runners(q, instances);
        pushUnits(q, instances);
        shelfPins(q, instances);
        bolts(q, seen, instances);
    }
    pulls(b, instances);
    for (const c of p.items)
    {
        if (c.kind === "carcass")
        {
            feet(c, b, instances, screws);
        }
    }
    concealed(b, instances, screws);
    flapHinges(b, instances, screws);
    brackets(b, instances, screws);
    cupScrews(instances, screws);
    const drawn: Record<string, CadModel> = {};
    lightModels(p, b, instances, drawn);
    capModels(b, instances, drawn);
    return { instances, screws, drawn };
}


export { DOWEL_LENGTH };
