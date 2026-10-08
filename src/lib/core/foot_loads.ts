// What each foot carry once eevrything standing on a carcass is counted where it stands, and what a hung
// carcass holds on its hangers : checked after every item is built, the one below knowing the ones above

import type { Carcass, Project } from "./model";
import type { Build } from "./part_types";
import type { Check } from "./check";
import { byId } from "./edit";
import { footFor, footPlaces } from "./feet";
import { itemExtent } from "./extent";
import { carrierOf } from "./devices";
import { hangerWallChecks } from "./wall_load"; 
import { AXILO_ADJUST_MAX_CABINET, AXILO_LOAD_PER_FOOT, BLUM_HANGER_PAIR_LOAD, CAMAR_807_LOAD } from "../data/hardware";

// a carcass set by hand on another sit within a millimetre of its top
const TOL = 1;

// a weight in kg and the room x, z it stands over
export interface PointLoad
{
    kg: number;
    x: number;
    z: number;
}


// Reactions of feet under a rigid base on equal feet : an even share plus a linear spread across the feet that
// balances the moments of the loads about their centroid, in x and in z. A negative one is a foot lifting
export function footReactions(feet: { x: number; z: number }[], loads: PointLoad[]): number[]
{
    const n = feet.length;
    const w = loads.reduce((s, l) =>
    {
        return s + l.kg;
    }, 0);
    const xb = feet.reduce((s, f) => { return s + f.x; }, 0) / n;
    const zb = feet.reduce((s, f) => { return s + f.z; }, 0) / n;
    let [sxx, szz, sxz, mx, mz] = [0, 0, 0, 0, 0];
    for (const f of feet)
    {
        sxx += (f.x - xb) ** 2;
        szz += (f.z - zb) ** 2;
        sxz += (f.x - xb) * (f.z - zb);
    }
    for (const l of loads)
    {
        mx += l.kg * (l.x - xb);
        mz += l.kg * (l.z - zb);
    }
    const det = sxx * szz - sxz * sxz;
    const p = det > 1e-9 ? (mx * szz - mz * sxz) / det : 0;
    const q = det > 1e-9 ? (sxx * mz - sxz * mx) / det : 0;
    return feet.map((f) =>
    {
        return w / n + p * (f.x - xb) + q * (f.z - zb);
    });
}


// Everything a carcass carries, itself included : its own load over the middle of its box, the appliances in and
// on it, and every carcass standing on its top with what they carry in turn, shared when one stands on two
function carried(p: Project, c: Carcass, own: Map<string, number>): PointLoad[]
{
    const out: PointLoad[] = [{ kg: own.get(c.id) ?? 0, x: c.x + c.width / 2, z: c.z + c.depth / 2 }];
    for (const it of p.items)
    {
        if (it.kind === "device" && carrierOf(p, it)?.id === c.id)
        {
            out.push({ kg: it.massKg, x: it.x + it.width / 2, z: it.z + it.depth / 2 });
        }
        if (it.kind !== "carcass" || it.id === c.id || it.wall !== c.wall
            || Math.abs(itemExtent(it).y0 - (c.y + c.height)) > TOL)
        {
            continue;
        }
        const across = Math.min(it.x + it.width, c.x + c.width) - Math.max(it.x, c.x);
        const deep = Math.min(it.z + it.depth, c.z + c.depth) - Math.max(it.z, c.z);
        if (across <= 0 || deep <= 0)
        {
            continue;
        }
        for (const l of carried(p, it, own))
        {
            out.push({ ...l, kg: l.kg * across / it.width });
        }
    }
    return out;
}


export function footLoadChecks(p: Project, b: Build, own: Map<string, number>): Check[]
{
    const checks: Check[] = [];
    for (const c of p.items)
    {
        if (c.kind !== "carcass")
        {
            continue;
        }
        const loads = carried(p, c, own);
        const total = loads.reduce((s, l) =>
        {
            return s + l.kg;
        }, 0);
        const say = (level: Check["level"], message: string): void =>
        {
            checks.push({ level, item: c.id, target: null, message });
        };
        if (c.base.type === "plinth" || c.base.type === "feet")
        {
            const foot = footFor(c.base.height);
            const feet = footPlaces(c);
            if (foot === undefined || feet.length === 0)
            {
                continue;
            }
            const f = footReactions(feet, loads);
            const most = Math.max(...f);
            const least = Math.min(...f);
            const above = loads.length > 1 ? ", ce qui est posé dessus compris" : "";
            const line = b.hardware.find((h) =>
            {
                return h.item === c.id && h.purpose === "foot";
            });
            if (line !== undefined)
            {
                line.note = `réglage ${foot.min}-${foot.max} mm, ${most.toFixed(0)} kg sur le pied le plus chargé, `
                    + `${AXILO_LOAD_PER_FOOT} kg admis`;
            }
            say("info", `${c.name} : ${feet.length} pieds AXILO 78 H${foot.height}, ${most.toFixed(0)} kg sur le pied `
                + `le plus chargé, ${(total / feet.length).toFixed(0)} en moyenne${above}, ${AXILO_LOAD_PER_FOOT} kg `
                + `admis (Häfele p. 11.43A), réglage sous charge jusqu'à ${AXILO_ADJUST_MAX_CABINET} kg de meuble.`);
            if (most > AXILO_LOAD_PER_FOOT)
            {
                say("error", `${c.name} : ${most.toFixed(0)} kg sur le pied le plus chargé, ${AXILO_LOAD_PER_FOOT} kg `
                    + "maxi (AXILO 78). Ajouter des pieds, alléger ou recentrer ce qui est posé dessus.");
            }
            if (least < 0)
            {
                say("warning", `${c.name} : la charge posée d'un côté soulève un pied (${least.toFixed(0)} kg). `
                    + "Recentrer ce qui est posé dessus ou fixer le meuble au mur.");
            }
            const bottom = byId(b.parts, `${c.id}/bottom`);
            if (bottom !== undefined && total > AXILO_ADJUST_MAX_CABINET)
            {
                bottom.notes.push(`Meuble de ${total.toFixed(0)} kg chargé : régler les pieds AXILO `
                    + `avant chargement (réglage sous charge limité à ${AXILO_ADJUST_MAX_CABINET} kg)`);
            }
        }
        else if (c.base.type === "wall" && c.base.hanger === "camar")
        {
            const pair = 2 * CAMAR_807_LOAD;
            say("info", `${c.name} : suspendu par deux reggibases Camar 807, ${total.toFixed(0)} kg chargé pour `
                + `${pair} kg admis la paire (${CAMAR_807_LOAD} kg la pièce, Camar).`);
            if (total > pair)
            {
                say("error", `${c.name} : ${total.toFixed(0)} kg suspendus, une paire de reggibases Camar 807 porte `
                    + `${pair} kg. Alléger le meuble ou le poser au sol.`);
            }
        }
        else if (c.base.type === "wall")
        {
            say("info", `${c.name} : suspendu par une paire de ferrures Blum 48N0510, ${total.toFixed(0)} kg `
                + `chargé pour ${BLUM_HANGER_PAIR_LOAD} kg admis (Blum p. 586).`);
            if (total > BLUM_HANGER_PAIR_LOAD)
            {
                say("error", `${c.name} : ${total.toFixed(0)} kg suspendus, une paire de ferrures 48N0510 `
                    + `porte ${BLUM_HANGER_PAIR_LOAD} kg (Blum p. 586). Alléger le meuble ou le poser au sol.`);
            }
        }
        // the hangers hold, hten the wall behind them has to
        if (c.base.type === "wall")
        {
            for (const k of hangerWallChecks(c, total, p.settings))
            {
                say(k.level, k.message);   
            }  
        }  
    }
    return checks;
}
