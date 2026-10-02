// Pictures printed to the size of the back of a cell : where they lie, what they measure, what the back says

import type { Carcass } from "./model";
import type { ResolvedLayout } from "./layout";
import type { Build } from "./parts";  
import { byId } from "./edit";


// DimensionShop bills 1 m2 at least for a print made to size, read on 2 October 2026
export const PRINT_MIN_M2 = 1;


export function fitPrints(c: Carcass, lay: ResolvedLayout, b: Build): void
{
    for (const print of c.prints)
    {
        const nb = lay.nodes.get(print.cell);
        if (nb === undefined)
        {
            continue;
        }
        if (c.back.type === "none")
        {
            b.errors.push(`${c.name} : impression au fond d'une case sans fond. Ajouter un fond au caisson ou retirer `
                + "l'impression.");
            continue;
        }
        // on the back lniing when the cell has one, else on the back itself
        const lining = c.linings.find((l) =>
        {
            return l.cell === print.cell && l.faces.back;
        });
        const z = c.z + lay.zBack + (lining === undefined ? 0 : lining.thickness);
        b.prints.push({ item: c.id, cell: print.cell, file: print.file, x: c.x + nb.x, y: c.y + nb.y, z, w: nb.w,
                        h: nb.h });
        const back = byId(b.parts, `${c.id}/back`);
        back?.notes.push(`Impression ${Math.round(nb.w)} x ${Math.round(nb.h)} mm collée au fond de la case, `
            + `${lining === undefined ? "sur le fond" : "sur l'habillage"}, image ${print.file}`);
    }
}
