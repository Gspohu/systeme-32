// A screen on a full motion arm : the two places it takes, and what the arm and the wall behind it must carry

import type { Project, Screen } from "./model";
import type { Check } from "./check";
import { screenSize } from "./extent";
import { PLASTERBOARD_LIMITS } from "../data/wall_fixings";

const G = 9.81;

export interface ScreenSpot
{
    label: string;
    cx: number;
    bottom: number;
    z: number;
}


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
    const armOk = typeof a === "object" && typeof a.model === "string" && typeof a.source === "string"
        && known(a.maxKg) && Array.isArray(a.vesa) && a.vesa.every(pair) && known(a.reachMin)
        && known(a.reachMax) && (a.reachMax === 0 || (a.reachMin as number) <= (a.reachMax as number))
        && known(a.plateW) && known(a.plateH) && Number.isFinite(a.x) && Number.isFinite(a.y)
        && (o === null || (typeof o === "object" && Number.isFinite(o.cx) && positive(o.z)));
    return frameOk && massOk && vesaOk && armOk;
}


// Where the screen stands or is put away, then where its arm swings it out to be watched : the arm keeps its height
export function screenSpots(sc: Screen): ScreenSpot[]
{
    const spots: ScreenSpot[] = [{ label: sc.arm === null ? "" : "rangé", cx: sc.cx, bottom: sc.bottom, z: sc.z }];
    if (sc.arm !== null && sc.arm.out !== null)
    {
        spots.push({ label: "sorti", cx: sc.arm.out.cx, bottom: sc.bottom, z: sc.arm.out.z });
    }
    return spots;
}


// The screen part way along its arm, t from 0 put away to 1 swung out : the 3D view slides it to show the way
export function armPose(sc: Screen, t: number): ScreenSpot
{
    const out = sc.arm?.out ?? null;
    if (out === null)
    {
        return { label: "", cx: sc.cx, bottom: sc.bottom, z: sc.z };
    }
    const k = Math.min(1, Math.max(0, t));
    return { label: "", cx: sc.cx + (out.cx - sc.cx) * k, bottom: sc.bottom, z: sc.z + (out.z - sc.z) * k };
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
        const where = spot.label === "" ? "" : ` ${spot.label}`;
        if (back < arm.reachMin - 0.5)
        {
            say("error", `Écran${where} à ${Math.round(back)} mm du mur, le bras ${arm.model} replié en tient `
                + `${arm.reachMin}. Avancer l'écran.`);
        }
        else if (reach > arm.reachMax + 0.5)
        {
            say("error", `Écran${where} à ${Math.round(reach)} mm de la platine, le bras ${arm.model} va jusqu'à `
                + `${arm.reachMax}. Rapprocher la platine ou prendre un bras plus long.`);
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
