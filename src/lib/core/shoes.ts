// Shoe racks screwed to the back of a cell : the model that fits its width, levels spread up fro its floor

import type { Carcass, ShoeRack } from "./model";
import type { NodeBox, ResolvedLayout } from "./layout";
import type { Build } from "./parts";
import { DIAM } from "./text";

// Häfele U.K. TCH Design 2017 p. 2.35 and 2.36 : width adjustable racks, no load published for either
export const SHOE_RACKS = [
    { ref: "892.11.901", min: 560, max: 1000, height: 102, depth: 221, fixings: true },
    { ref: "892.12.906", min: 480, max: 750, height: 87, depth: 205, fixings: false },
];


// Bottom of each level, local carcass y, the cell height shared evenly
export function shoeLevels(nb: NodeBox, rack: ShoeRack): number[]
{
    const n = Math.max(1, Math.round(rack.levels));
    const out: number[] = [];
    let i = 0;
    while (i < n)
    {
        out.push(nb.y + nb.h * i / n);
        i++;
    }
    return out;
}


export function buildShoeRacks(c: Carcass, lay: ResolvedLayout, b: Build): void
{
    for (const rack of c.shoeRacks)
    {
        const nb = lay.nodes.get(rack.cell);
        if (nb === undefined)
        {
            continue;
        }
        const where = `${c.name}, range-chaussures`;
        const model = SHOE_RACKS.find((m) =>
        {
            return nb.w >= m.min && nb.w <= m.max;
        });
        if (model === undefined)
        {
            b.errors.push(`${where} : largeur intérieure ${Math.round(nb.w)} mm hors de 480 à 1000 (Häfele p. 2.35 `
                + "et 2.36). Recouper la case.");
            continue;
        }
        const depth = lay.zFront - lay.zBack;
        const n = Math.max(1, Math.round(rack.levels));
        if (depth < model.depth || nb.h / n < model.height)
        {
            b.errors.push(`${where} : ${n} niveau(x) de ${model.height} x ${model.depth} mm ne tiennent pas dans `
                + `${Math.round(nb.h)} x ${Math.round(depth)}. Moins de niveaux ou une case plus grande.`);
            continue;
        }
        b.hardware.push({ ref: model.ref, qty: n, item: c.id, itemName: c.name, target: null,
                          note: `réglé à ${Math.round(nb.w)} mm, vissé au fond de la case, `
                              + (model.fixings ? "fixations fournies" : `vis ${DIAM}3 à commander`), purpose: "shoe-rack" });
    }
}
