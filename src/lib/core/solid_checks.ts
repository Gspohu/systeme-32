// What the 3D view would show wrong : a volume under the floor, two parts in each other, an item on nothing
// and whether each piece of furniture stands

import type { Project } from "./model";
import type { Build } from "./parts";
import type { Check } from "./analysis";
import { solids } from "./solids";
import { belowFloor, clashes } from "./clashes";
import { unsupported } from "./support";
import { stability } from "./stability";


export function solidChecks(p: Project, b: Build): Check[]
{
    const checks: Check[] = [];
    const all = solids(p, b);
    for (const s of belowFloor(all))
    {
        checks.push({ level: "error", item: s.item, target: null,
                      message: `${s.label} descend ${Math.round(-s.min[1])} mm sous le sol. Remonter le meuble `
                          + "au-dessus de son socle." });
    }
    const kinds = new Map(p.items.map((it) =>
    {
        return [it.id, it.kind];
    }));
    const told = new Set<string>();
    for (const c of clashes(all))
    {
        const across = c.a.item !== c.b.item;
        // the item check handle two boxes crossing already, a round corner is left out there
        if (across && kinds.get(c.a.item) !== "corner" && kinds.get(c.b.item) !== "corner")
        {
            continue;
        }
        const key = across ? [c.a.item, c.b.item].sort().join("|") : `${c.a.key}|${c.b.key}`;
        if (told.has(key))
        {
            continue;
        }
        told.add(key);
        checks.push({ level: "error", item: c.a.item, target: null,
                      message: `${c.a.label} et ${c.b.label} s'interpénètrent. Corriger les cotes ou la position `
                          + "de l'une des deux." });
    }
    for (const u of unsupported(p, all))
    {
        checks.push({ level: "error", item: u.item, target: null,
                      message: `${u.name} : ${u.why}. Le poser au sol ou sur un autre meuble, ou choisir un socle `
                          + "suspendu." });
    }
    for (const s of stability(p, b, all))
    {
        const item = s.items[0] ?? null;
        const astm = "l'essai ASTM F2057-23 § 9.2.3 (cale de 10,9 mm sous l'arrière, 27,2 kg au bord d'un tiroir ouvert)";
        if (!s.stands)
        {
            checks.push(s.held
                ? { level: "warning", item, target: null,
                    message: `${s.name} ne tient que par sa fixation murale : son centre de gravité dépasse ses `
                        + `appuis de ${Math.round(-s.margin)} mm.` }
                : { level: "error", item, target: null,
                    message: `${s.name} ne tient pas debout : son centre de gravité dépasse ses appuis de `
                        + `${Math.round(-s.margin)} mm. L'élargir, le lester ou le fixer au mur.` });
            continue;
        }
        const alone = s.held ? "Sans sa fixation, il " : "Il ";
        checks.push({ level: "info", item, target: null,
                      message: `${s.name} tient debout. ${alone}bascule si le sol penche de ${s.tiltDeg.toFixed(1)}° `
                          + `vers ${s.towards} (centre de gravité à ${Math.round(s.centre[1])} mm, `
                          + `${s.massKg.toFixed(0)} kg à vide).` });
        if (s.carpet === null)
        {
            continue;
        }
        if (s.carpet.passes)
        {
            checks.push({ level: "info", item, target: null, message: `${s.name} tient seul à ${astm}.` });
        }
        else
        {
            checks.push(s.held
                ? { level: "info", item, target: null,
                    message: `${s.name} basculerait seul à ${astm} : sa fixation anti-basculement est indispensable.` }
                : { level: "error", item, target: null,
                    message: `${s.name} bascule à ${astm}. Le fixer au mur (équerre anti-basculement).` });
        }
    }
    return checks;
}
