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
    // The size of the workbench when no millimetre names it : "#6" for a US wood screw of ASME B18.6.1
    size?: string;
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


// What the model says of each screw, written once on its FreeCAD object and once in the hardware list
export const SCREW_ADVICE = "Recommandation, surtout utile pour le chiffrage : l'atelier peut employer ses propres vis";

// The designation of a screw : a card of FreeCAD's library for its material, its coating, its property class for a
// metric thread, and where these come from. Suppliers' sheets, the standards themselves not read
export interface ScrewDesignation
{
    card: string;
    coating: string;
    propertyClass?: string;
    why: string;
}

const CHIPBOARD: ScrewDesignation = { card: "Steel-Generic", coating: "zingué",
                                      why: "acier trempé zingué, fiches PGB Europe et RS PRO des vis d'aggloméré DIN 7505" };
const WOOD: ScrewDesignation = { card: "Steel-Generic", coating: "zingué 5 µm",
                                 why: "acier ST zingué 5 µm, fiche Keller & Kalmbach des vis à bois DIN 7997 et 7996" };
// A2 is the austenitic 18-8 family, 1.4301 its usual grade
const STAINLESS: ScrewDesignation = { card: "Steel-X5CrNi18-10", coating: "aucun, inox A2",
                                      why: "fischer PowerFast II inox A2, fiche article 574154" };
export const WASHER_DESIGNATION: ScrewDesignation = { card: "Steel-Generic", coating: "zingué", propertyClass: "100 HV",
                                                      why: "acier de classe 100 HV, ISO 7094:2000 tableau 3, zingué "
                                                           + "d'après la liste de quincaillerie" };
export const WASHER_REF = "WASHER_5x20";

// The article bought for each screw the CAD draws, by its shape : the export finds the supplier in its price
export interface ScrewArticle
{
    kind: ScrewSpec["kind"];
    diameter: number;
    length: number;
    standard?: string;
    ref: string;
    designation: ScrewDesignation;
}

export const SCREW_ARTICLES: ScrewArticle[] = [
    // Blum's chipboard screw of the hinges, the runners and the TIP-ON plates
    { kind: "countersunk", diameter: 3.5, length: 15, ref: "609.1500",
      designation: { card: "Steel-Generic", coating: "nickelé", why: "acier nickelé, fiche SFS de la Blum 609.1500" } },
    // The #6 wood screw of the Blum runners in their file, sold by Würth
    { kind: "countersunk", diameter: 3.5, length: 16, standard: "ASMEB18.6.1.3", ref: "606N",
      designation: { card: "Steel-Generic", coating: "nickelé", why: "acier nickelé, fiche Würth B606N-100" } },
    { kind: "countersunk", diameter: 4, length: 30, ref: "SCREW_4x30", designation: CHIPBOARD },
    { kind: "countersunk", diameter: 4, length: 35, ref: "SCREW_4x35", designation: CHIPBOARD },
    // Supplied with the pull
    { kind: "countersunk", diameter: 4, length: 16, standard: "DIN7997", ref: "84335807", designation: WOOD },
    { kind: "countersunk", diameter: 2.5, length: 16, ref: "SCREW_2.5x16", designation: WOOD },
    { kind: "countersunk", diameter: 5, length: 50, ref: "WALL_SCREW_5x50", designation: CHIPBOARD },
    { kind: "pan", diameter: 5, length: 50, ref: "WALL_SCREW_5x50_PAN", designation: WOOD },
    { kind: "pan", diameter: 5, length: 60, ref: "WALL_SCREW_5x60_PAN", designation: STAINLESS },
    { kind: "pan", diameter: 4, length: 16, ref: "SCREW_4x16", designation: WOOD },
];

export function screwArticle(s: { kind: string; diameter: number; length: number; standard?: string }):
    ScrewArticle | undefined
{
    return SCREW_ARTICLES.find((a) =>
    {
        return a.kind === s.kind && a.diameter === s.diameter && a.length === s.length
            && (a.standard ?? "") === (s.standard ?? "");
    });
}
