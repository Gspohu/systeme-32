// The screws a drilling takes, what the CAD export places : wood screws and the Häfele connecting bolts

export interface ScrewSpec
{
    kind: "countersunk" | "pan" | "bolt" | "metric";
    diameter: number;
    length: number;
    washer?: boolean;
    // The Fasteners standard drawn when not the usual one of its kind, and the head it draws when not twice the shank :
    // its daimeter and height, a rim standing over its cone when the height passes the cone of 90 degrees
    standard?: string;
    head?: number;
    headHeight?: number;
}

// Drillings whose label doesn't give the size. Blum KA-150 p. 173 : the TIP-ON adapetr takes chipboard screws, the
// 609.1500 listed for it, countersunk with a Z recess
const BY_PURPOSE: Record<string, ScrewSpec> = {
    "adapter-screw": { kind: "countersunk", diameter: 3.5, length: 15 },
    // Supplied with the pull : countersunk Ø4 x 16, a reduced head of 6.5 measured, under the 7.05 of DIN 7997:2008. The
    // model draws its 7.5, the hight it stands proud as measured
    "handle-screw": { kind: "countersunk", diameter: 4, length: 16, standard: "DIN7997", head: 7.5, headHeight: 2.2 },
    // Through the plain Ø5 hole of a steel bracket of 2 mm : a pan head bears on it, a countersunk one has no seat
    "anti-tip-screw": { kind: "pan", diameter: 4, length: 16 },
};

// How far off the board the top of a head stands, seated on the fitting it holds : its cone on the 90 degree cone of the
// hole in the makers' models, the rim of the head (0.35 on a Ø3.5, 0.4 on a Ø4) standing clear. A tab or a
// sheet takes it flat
export const SCREW_SEAT: Record<string, number> = {
    "runner-screw": 1.9,
    "adapter-screw": 2.13,
    "foot-mount-screw": 21.1,
    // Its tab of 1 and the head 1.2 over it, measured on a bought pull
    "handle-screw": 2.2,
    "anti-tip-screw": 2,
};

// What each screw holds besides the wood it goes into : a test checks its head has an interface with that article
export const SCREW_HOLDS: Record<string, string> = {
    "runner-screw": "760H",
    "adapter-screw": "956.1201.plate",
    "foot-mount-screw": "637.76.333",
    "handle-screw": "84335807",
    "anti-tip-screw": "ANTI_TIP_BRACKET",
};

// Hafele 2017 p. 11.138 : M6, the 2 19 mm boards it claps
const CONNECTING_BOLT: ScrewSpec = { kind: "bolt", diameter: 6, length: 38 };

// What holds no screw : a dowel, a plate, a pin, a mark to glue at
const SCREWED = new Set(["front-screw", "runner-screw", "adapter-screw", "anti-tip-screw", "foot-mount-screw",
                         "wall-screw",
                         "doubler-screw", "cleat-screw", "shelf-bracket", "wall-fixing", "link-screw", "plate-screw",
                         "back-screw", "handle-screw", "lining-screw", "plinth-screw", "spacer-screw"]);


export function screwOf(purpose: string, label: string): ScrewSpec | null
{
    if (!SCREWED.has(purpose))
    {
        return null;
    }
    if (purpose === "link-screw" && label.includes("267.07"))
    {
        return CONNECTING_BOLT;
    }
    const known = BY_PURPOSE[purpose];
    if (known !== undefined)
    {
        return known;
    }
    // "vis 4 x 16", "Vis 5 x 50", "vis Ø3,5 x 15" : the size as the drwaings print it
    const m = /vis\s+\D?(\d+(?:,\d+)?)\s*x\s*(\d+)/i.exec(label);
    if (m === null)
    {
        return null;
    }
    const size = { diameter: Number(m[1]!.replace(",", ".")), length: Number(m[2]) };
    // A countersunk head would ride on the rim of the flat washer under a wall screw
    return purpose === "wall-screw" ? { kind: "pan", ...size, washer: true } : { kind: "countersunk", ...size };
}
