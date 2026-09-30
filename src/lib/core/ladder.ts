// Library ladder on a rail : the rail is ordered cut to length, everything a person's weight rests on stays with the
// maker of the ladder, whose sheet could not be read

import type { LadderRail, Project } from "./model";
import type { Build } from "./parts";
import type { Check } from "./analysis";


export function buildLadder(l: LadderRail, b: Build): void
{
    if (l.ladderAt < 0 || l.ladderAt + l.ladderWidth > l.width)
    {
        b.errors.push(`${l.name} : l'échelle sort du rail de ${l.width} mm. La placer entre 0 et `
            + `${Math.max(0, l.width - l.ladderWidth)} mm.`);
    }
    b.hardware.push({ ref: "LADDER_RAIL", qty: 1, item: l.id, itemName: l.name, target: null,
                      note: `coupé à ${Math.round(l.width)} mm, axe à ${Math.round(l.y)} mm du sol` });
    b.hardware.push({ ref: "LADDER_SET", qty: 1, item: l.id, itemName: l.name, target: null,
                      note: `largeur ${Math.round(l.ladderWidth)} mm, supports du rail selon le fabricant` });
}


export function ladderChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    for (const l of p.items)
    {
        if (l.kind === "ladder")
        {
            checks.push({ level: "warning", item: l.id, target: null,
                          message: `${l.name} : charge admise, inclinaison et entraxe des supports du rail non vérifiés, `
                              + "aucune fiche lisible. Les prendre sur la notice de l'échelle achetée avant la pose." });
        }
    }
    return checks;
}
