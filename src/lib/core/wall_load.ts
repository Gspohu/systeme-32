// What the wall holsd : the plug it need for its material, and the load of a hung carcass read against it

import type { Carcass, Settings } from "./model";
import type { Level } from "./check";
import { GRAVITY } from "../data/rules";
import { AERATED_PLUG_LOADS, PLASTERBOARD_LIMITS } from "../data/wall_fixings";


// the plug the wall material takes, none when the screw goes into the timber reinforcement of a partitino
export function wallPlug(s: Settings): string | null
{
    if (s.wallType === "plasterboard")
    {
        return "PLUG_HOLLOW_METAL";
    }
    if (s.wallType === "reinforced")
    {
        return null;
    }
    return s.wallType === "aerated" ? "PLUG_AERATED" : "PLUG_NYLON_8x40";
}


// A hung carcass on its two hangers : the screws of one hanger plate stand a few cm apart, a single local loa
// for NF DTU 25.41, each carrying half the weight with the centre of gravity half the depth off the wall
export function hangerWallChecks(c: Carcass, totalKg: number, s: Settings): { level: Level; message: string }[]
{
    const out: { level: Level; message: string }[] = [];
    const daN = totalKg * GRAVITY / 10 / 2;
    const moment = daN * c.depth / 2 / 1000;
    const L = PLASTERBOARD_LIMITS;
    const each = `${daN.toFixed(0)} daN par suspension`;
    if (s.wallType === "plasterboard")
    {
        if (daN > L.reinforceAbove)
        {
            out.push({ level: "error", message: `${c.name} : ${each} sur une plaque de plâtre, au-delà des `
                + `${L.reinforceAbove} daN où la NF DTU 25.41 impose un renfort et un renvoi des charges (${L.source}). `
                + "Poser une traverse bois fixée à l'ossature derrière la plaque, puis choisir 'Plaque de plâtre sur "
                + "renfort bois', ou poser le meuble au sol." });
        }
        else if (daN > L.directUpTo)
        {
            out.push({ level: "warning", message: `${c.name} : ${each} sur une plaque de plâtre : chevilles à `
                + `${L.spacing} mm l'une de l'autre au moins (NF DTU 25.41, ${L.source}).` });
        }
        if (moment > L.momentLocal)
        {
            out.push({ level: "error", message: `${c.name} : moment de renversement de ${moment.toFixed(1)} daN.m par `
                + `suspension, ${L.momentLocal} maxi pour une charge localisée sur plaque de plâtre (${L.source}). `
                + "Réduire la profondeur ou la charge, ou poser le meuble au sol." });
        }
        return out;
    }
    if (s.wallType === "aerated")
    {
        // the weakest class unless the wall is known better : the plug count each hanger plate needs
        const best = AERATED_PLUG_LOADS.plugs[AERATED_PLUG_LOADS.plugs.length - 1]!;
        const n = Math.ceil(daN / best.weakest);
        out.push({ level: n > 1 ? "warning" : "info", message: `${c.name} : ${each} dans du béton cellulaire, une `
            + `cheville ${best.ref} porte ${best.weakest} daN en ${AERATED_PLUG_LOADS.weakestClass} (${AERATED_PLUG_LOADS.source}) : `
            + `au moins ${n} par plaque de suspension, à ${best.spacing} mm l'une de l'autre, ou un béton de classe connue.` });
        return out;
    }
    out.push({ level: "info", message: `${c.name} : ${each}, à vérifier contre ${s.wallType === "reinforced"
        ? "la tenue des vis dans la traverse de renfort et de sa fixation à l'ossature"
        : "la charge admise des chevilles du mur choisies"}.` }); 
    return out;
}
