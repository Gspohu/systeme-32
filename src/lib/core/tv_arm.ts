// A screen on a full motion arm : the places it takes, the way between them, and what the arm and the wall must carry

import type { Project, Screen } from "./model";
import type { Check } from "./check";
import { screenSize } from "./extent";
import { roomBox } from "./room";
import { PLASTERBOARD_LIMITS } from "../data/wall_fixings";

const G = 9.81;
// steps of the way out checked against the furniture, enough for a 764 wide set to never jump a 19 mm board
const PATH_STEPS = 40;

// where the arm holds the screen : the centre of the set in the front view, its front plane at the centre and how
// far it is turned in degrees, positive to face the right of the room
export interface ScreenSpot
{
    label: string;
    cx: number;
    bottom: number;
    z: number;
    yaw: number;
}

type Pt = [number, number];


// A screen as read from a file or typed in : numbers a drawing can use, the sheet of an arm at zero until it is read
export function screenIsSound(raw: unknown): boolean
{
    const positive = (v: unknown): boolean =>
    {
        return typeof v === "number" && Number.isFinite(v) && v > 0;
    };
    const known = (v: unknown): boolean =>
    {
        return typeof v === "number" && Number.isFinite(v) && v >= 0;
    };
    const pair = (v: unknown): boolean =>
    {
        return Array.isArray(v) && v.length === 2 && v.every(positive);
    };
    const sc = raw as Record<string, unknown>;
    if (typeof sc !== "object" || sc === null || !positive(sc.diagonalInch) || typeof sc.source !== "string"
        || ![sc.cx, sc.bottom, sc.z].every(Number.isFinite))
    {
        return false;
    }
    const f = sc.frame as Record<string, unknown> | null;
    const frameOk = f === null || (typeof f === "object" && positive(f.w) && positive(f.h) && positive(f.d));
    const massOk = sc.massKg === null || positive(sc.massKg);
    const vesaOk = sc.vesa === null || pair(sc.vesa);
    const a = sc.arm as Record<string, unknown> | null;
    if (a === null)
    {
        return frameOk && massOk && vesaOk;
    }
    const o = a.out as Record<string, unknown> | null;
    const outOk = o === null || (typeof o === "object" && Number.isFinite(o.cx) && positive(o.z)
        && (o.yaw === undefined || (typeof o.yaw === "number" && Math.abs(o.yaw) <= 90)));
    const armOk = typeof a === "object" && typeof a.model === "string" && typeof a.source === "string"
        && known(a.maxKg) && Array.isArray(a.vesa) && a.vesa.every(pair) && known(a.reachMin)
        && known(a.reachMax) && (a.reachMax === 0 || (a.reachMin as number) <= (a.reachMax as number))
        && known(a.plateW) && known(a.plateH) && Number.isFinite(a.x) && Number.isFinite(a.y) && outOk;
    return frameOk && massOk && vesaOk && armOk;
}


// Where the screen stands or is put away, then where its arm swings it out to be watched : the arm keeps its height
export function screenSpots(sc: Screen): ScreenSpot[]
{
    const spots: ScreenSpot[] = [{ label: sc.arm === null ? "" : "rangé", cx: sc.cx, bottom: sc.bottom, z: sc.z,
                                   yaw: 0 }];
    if (sc.arm !== null && sc.arm.out !== null)
    {
        spots.push({ label: "sorti", cx: sc.arm.out.cx, bottom: sc.bottom, z: sc.arm.out.z, yaw: sc.arm.out.yaw ?? 0 });
    }
    return spots;
}


// The four corners of the set in plan, x along the wall and z into the room : it turns about the middle of its
// back, where the arm holds it
export function screenFootprint(sc: Screen, spot: ScreenSpot): Pt[]
{
    const { w, d } = screenSize(sc);
    const a = spot.yaw * Math.PI / 180;
    const across: Pt = [Math.cos(a), -Math.sin(a)];
    const facing: Pt = [Math.sin(a), Math.cos(a)];
    const hold: Pt = [spot.cx, spot.z - d];
    const corners: Pt[] = [];
    for (const [u, v] of [[-w / 2, 0], [w / 2, 0], [w / 2, d], [-w / 2, d]])
    {
        corners.push([hold[0] + u! * across[0] + v! * facing[0], hold[1] + u! * across[1] + v! * facing[1]]);
    }
    return corners;
}


// The width the set covers along the wall, turned or not, for the front views
export function spotSpan(sc: Screen, spot: ScreenSpot): [number, number]
{
    const xs = screenFootprint(sc, spot).map((c) =>
    {
        return c[0];
    });
    return [Math.min(...xs), Math.max(...xs)];
}


// separating axis test of a turned rectangle against a box square to the walls, in plan
function overlaps(corners: Pt[], box: { x0: number; z0: number; x1: number; z1: number }): boolean
{
    const boxCorners: Pt[] = [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]];
    const axes: Pt[] = [[1, 0], [0, 1], [corners[1]![0] - corners[0]![0], corners[1]![1] - corners[0]![1]],
                        [corners[3]![0] - corners[0]![0], corners[3]![1] - corners[0]![1]]];
    for (const [ax, az] of axes)
    {
        const project = (pts: Pt[]): [number, number] =>
        {
            const s = pts.map(([x, z]) =>
            {
                return x * ax + z * az;
            });
            return [Math.min(...s), Math.max(...s)];
        };
        const [a0, a1] = project(corners);
        const [b0, b1] = project(boxCorners);
        // half a millimetre of play : touching faces are not a clash
        const slack = 0.5 * Math.hypot(ax, az);
        if (a1 <= b0 + slack || b1 <= a0 + slack)
        {
            return false;
        }
    }
    return true;
}


// What the set runs into at that spot : the items it enters, and the back wall (no id) when it turns into it. Every
// item is read in the room frame, the screen is on the back wall
export function spotClashes(p: Project, spot: ScreenSpot): { id: string | null; name: string }[]
{
    const sc = p.screen;
    const hit: { id: string | null; name: string }[] = [];
    if (sc !== null)
    {
        const { h } = screenSize(sc);
        const corners = screenFootprint(sc, spot);
        if (Math.min(...corners.map((c) =>
        {
            return c[1];
        })) < -0.5)
        {
            hit.push({ id: null, name: "le mur" });
        }
        for (const it of p.items)
        {
            const bx = roomBox(it, p.room);
            const level = spot.bottom < bx.max[1] - 0.5 && spot.bottom + h > bx.min[1] + 0.5;
            if (level && overlaps(corners, { x0: bx.min[0], z0: bx.min[2], x1: bx.max[0], z1: bx.max[2] }))
            {
                hit.push({ id: it.id, name: it.name });
            }
        }
    }
    return hit;
}


// The way a hand takes the set out on its arm : pulled out square to the wall first, then slid and turned, then
// pushed to its depth, as the arm opens. Each step is a spot to check
export function armPath(sc: Screen): ScreenSpot[]
{
    const [stored, out] = screenSpots(sc);
    if (stored === undefined || out === undefined)
    {
        return [];
    }
    const deep = Math.max(stored.z, out.z);
    const way: ScreenSpot[] = [];
    const lerp = (a: number, b: number, k: number): number =>
    {
        return a + (b - a) * k;
    };
    for (let i = 0; i <= PATH_STEPS; i++)
    {
        const k = i / PATH_STEPS;
        way.push({ ...stored, label: "", z: lerp(stored.z, deep, k) });
    }
    for (let i = 1; i <= PATH_STEPS; i++)
    {
        const k = i / PATH_STEPS;
        way.push({ ...stored, label: "", cx: lerp(stored.cx, out.cx, k), z: deep, yaw: lerp(0, out.yaw, k) });
    }
    for (let i = 1; i <= PATH_STEPS; i++)
    {
        way.push({ ...out, label: "", z: lerp(deep, out.z, i / PATH_STEPS) });
    }
    return way;
}


// A spot asked for in the 3D view, brought back within the reach of the arm : never closer to the wall than folded
// never further from the plate than stretched
export function reachable(sc: Screen, want: { cx: number; z: number; yaw: number }): ScreenSpot
{
    const spot: ScreenSpot = { label: "", cx: want.cx, bottom: sc.bottom, z: want.z, yaw: Math.max(-90,
                                                                                                    Math.min(90,
                                                                                                        want.yaw)) };
    const arm = sc.arm;
    if (arm === null || arm.reachMax <= 0)
    {
        return spot;
    }
    const { d } = screenSize(sc);
    let dx = spot.cx - arm.x;
    let back = Math.max(arm.reachMin, spot.z - d);
    const reach = Math.hypot(dx, back);
    if (reach > arm.reachMax)
    {
        dx *= arm.reachMax / reach;
        back *= arm.reachMax / reach;
    }
    return { ...spot, cx: arm.x + dx, z: back + d };
}


// The spot the 3D view shows : where the screen is put away until one is asked for, then the asked one within reach
export function spotFor(sc: Screen, want: { cx: number; z: number; yaw: number } | null): ScreenSpot
{
    return want === null || sc.arm === null ? screenSpots(sc)[0]! : reachable(sc, want);
}


export function armChecks(p: Project): Check[]
{
    const sc = p.screen;
    if (sc === null || sc.arm === null)
    {
        return [];
    }
    const arm = sc.arm;
    const checks: Check[] = [];
    const say = (level: Check["level"], message: string): void =>
    {
        checks.push({ level, item: null, target: null, message });
    };
    // a new arm starts with its sheet at zero : nothing is checked against figures nobody has read yet
    if (arm.maxKg <= 0 || arm.reachMax <= 0 || arm.vesa.length === 0)
    {
        say("info", "Bras mural : fiche à saisir (charge, VESA acceptés, déport mini et maxi) depuis la notice du "
            + "fabricant.");
        return checks;
    }
    if (sc.massKg === null)
    {
        say("info", `Bras ${arm.model} : poids de l'écran inconnu, sa charge n'est pas vérifiée. Le saisir sans le pied.`);
    }
    else if (sc.massKg > arm.maxKg)
    {
        say("error", `Bras ${arm.model} : écran de ${sc.massKg} kg pour ${arm.maxKg} kg admis. Prendre un bras plus fort.`);
    }
    if (sc.vesa === null)
    {
        say("info", `Bras ${arm.model} : entraxe VESA de l'écran inconnu. Mesurer l'écart des trous au dos et le saisir.`);
    }
    else if (!arm.vesa.some(([w, h]) =>
    {
        return w === sc.vesa![0] && h === sc.vesa![1];
    }))
    {
        const offered = arm.vesa.map(([w, h]) =>
        {
            return `${w} x ${h}`;
        }).join(", ");
        say("error", `Bras ${arm.model} : VESA ${sc.vesa[0]} x ${sc.vesa[1]} de l'écran absent de sa platine (${offered}). `
            + "Prendre un bras qui l'accepte ou une plaque d'adaptation.");
    }
    const { h, d } = screenSize(sc);
    // a full motion arm turns about its plate : its reach is read as the distance from the plate centre to the back
    // of the screen in plan, which the maker gives straight out from the wall
    // TODO a two link arm cannot fold to its minimum at an angle, only straight out : read the drawing of the notice
    for (const spot of screenSpots(sc))
    {
        const back = spot.z - d;
        const reach = Math.hypot(spot.cx - arm.x, back);
        if (back < arm.reachMin - 0.5)
        {
            say("error", `Écran ${spot.label} à ${Math.round(back)} mm du mur, le bras ${arm.model} replié en tient `
                + `${arm.reachMin}. Avancer l'écran.`);
        }
        else if (reach > arm.reachMax + 0.5)
        {
            say("error", `Écran ${spot.label} à ${Math.round(reach)} mm de la platine, le bras ${arm.model} va jusqu'à `
                + `${arm.reachMax}. Rapprocher la platine ou prendre un bras plus long.`);
        }
    }
    // the two ends are checked with the furniture, the way between them here : the first clash is enough to say
    const way = armPath(sc);
    for (let i = 1; i < way.length - 1; i++)
    {
        const hit = spotClashes(p, way[i]!);
        if (hit.length > 0)
        {
            const names = hit.map((x) =>
            {
                return x.name;
            }).join(" et ");
            say("error", `Bras ${arm.model} : en sortant l'écran de sa place, il heurte ${names}. Le sortir plus loin `
                + "du mur avant de le pivoter, ou déplacer la platine.");
            break;
        }
    }
    const centre = sc.bottom + h / 2;
    if (Math.abs(centre - arm.y) > arm.plateH / 2)
    {
        say("warning", `Bras ${arm.model} : centre de l'écran à ${Math.round(centre)} mm du sol, platine à ${arm.y}. `
            + "Le bras porte l'écran à la hauteur de sa platine, les accorder.");
    }
    if (p.settings.wallType === "plasterboard" && sc.massKg !== null)
    {
        const load = sc.massKg * G / 10;
        // the weight hangs at the middle of the screen thickness, furthest out when the screen is swung
        const lever = Math.max(...screenSpots(sc).map((s) =>
        {
            return Math.hypot(s.cx - arm.x, s.z - d / 2);
        })) / 1000;
        const moment = load * lever;
        if (load > PLASTERBOARD_LIMITS.reinforceAbove || moment > PLASTERBOARD_LIMITS.momentLocal)
        {
            say("error", `Bras ${arm.model} sur plaque de plâtre : ${load.toFixed(1)} daN et ${moment.toFixed(1)} daN.m, `
                + `au-delà de ${PLASTERBOARD_LIMITS.reinforceAbove} daN et ${PLASTERBOARD_LIMITS.momentLocal} daN.m `
                + `(NF DTU 25.41, ${PLASTERBOARD_LIMITS.source}). Poser la platine sur un renfort bois.`);
        }
    }
    return checks;
}
