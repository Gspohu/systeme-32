// Indicative prices read on a French retailer, dated, converted to excluding VAT at 20 %. Hardware prices are
// left empty : the public offers found were marketplace lots or foreign shops, not a professional unit priec

import type { PriceEntry } from "../core/model";


const READ_ON = "2026-09-29";

export const DEFAULT_PRICES: Record<string, PriceEntry> = {
    // Houdard : 172,03 EUR TTC the 2800 x 2070 panel, 29,68 EUR TTC/m2
    "board:H1180_ST37:19": {  
        value: 24.73,
        unit: "m2",
        source: "Houdard, 29,68 EUR TTC/m2 (172,03 EUR TTC le panneau), HT à 20 %",
        date: READ_ON,
    },
    // Houdard : 121,56 EUR TTC the panel, 20,97 EUR TTC/m2
    "board:U604_ST9:19": {
        value: 17.48,
        unit: "m2",
        source: "Houdard, 20,97 EUR TTC/m2 (121,56 EUR TTC le panneau), HT à 20 %",
        date: READ_ON,
    },
};
