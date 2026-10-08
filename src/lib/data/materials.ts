// Board materials and decors : every value holds its source, nothing is guessed

export type BoardKind = "melamine" | "mdf" | "mdf_flex" | "solid" | "glass";

export interface BoardMaterial
{
    id: string;
    label: string;
    kind: BoardKind;
    // kg/m3, used for real weights
    density: number;
    // kg/m3, conservative value used for load checks (hardware limits)
    densityCheck: number;
    // N/mm2, mean bending modulus EN 310
    modulus: number;
    // N/mm2, mean bending strength EN 310
    strength: number;
    // EN 1995-1-1:2004 deformation factor, service class 1
    kdef: number;
    // EN 1995-1-1:2004 strength factor, service class 1, medium-term load : a seat used every day is read like
    // an imposed floor load (COFORD tables D.2, D.4, D.5)
    kmod: number;
    thicknesses: number[];
    source: string;
}


// Egger Eurospan E1 P2 datasheet rec 107 (2023-07-26) : density "specific to plant" +-10 %
// building physics based on 600 kg/m3, 13-20 mm MOE 1600 and MOR 11
// https://panelco.com/wp-content/uploads/2025/10/Technical_Datasheet_Eurospan_E1_P2.pdf
// Hettich SlideLine M brochure (2017) plans door weights with 700 kg/m3 for particleboard
// TODO kdef and kmod : COFORD Handbook for Eurocode 5 tables D.7 and D.5 give 2.25 and 0.65 for P4/P5, P2 is not
// listed and its own creep is unknown
export const PARTICLEBOARD: BoardMaterial = {
    id: "p2",
    label: "Panneau de particules mélaminé P2",
    kind: "melamine",
    density: 600,
    densityCheck: 700,
    modulus: 1600,
    strength: 11,
    kdef: 2.25,
    kmod: 0.65,
    thicknesses: [8, 19],
    source: "Egger Eurospan E1 P2 rec. 107, Hettich SlideLine M 2017, kdef et kmod repris de P4/P5 car P2 "
        + "n'est pas listé par EN 1995-1-1:2004 (via COFORD)",
};

// Isoroy MEDIUM datasheet (April 2014, EN 622-5) : 16-19 mm density 730, MOR 30, MOE 2800
// https://www.ciffreobona.fr/userfiles/file/fiches_technique/panneaux_de_correze_isoroy/ft_mdf_standard.pdf
// Hettich plans MDF door weights with 900 kg/m3
export const MDF: BoardMaterial = {
    id: "mdf",
    label: "MDF (laqué ou plaqué)",
    kind: "mdf",
    density: 730,
    densityCheck: 900,
    modulus: 2800,
    strength: 30,
    kdef: 2.25,
    kmod: 0.6,
    thicknesses: [8, 10, 16, 19, 22],
    source: "Isoroy MEDIUM fiche technique 2014, Hettich SlideLine M 2017, EN 1995-1-1:2004 tab. 3.2 via COFORD",
};

// Minimum radius form distributors only, the Medite datasheet was not found : 6 mm ~150, 9 mm ~200
// https://mdfdirect.co.uk/ufaq/what-is-the-minimum-bending-radius-for-flexible-mdf/
// TODO density, modulus and strength are the standard MDF ones : no flexible MDF datasheet found yet
export const MDF_FLEX: BoardMaterial = {
    id: "mdf_flex",
    label: "MDF cintrable",
    kind: "mdf_flex",
    density: 730,
    densityCheck: 900,
    modulus: 2800,
    strength: 30,
    kdef: 2.25,
    kmod: 0.6,
    thicknesses: [6, 9],
    source: "Rayons : données revendeur (MDF Direct), à confirmer par un essai sur chute",
};

export const FLEX_MIN_RADIUS: Record<number, number> = {
    6: 150,
    9: 200,
};

// Hardwood dry (beech) 800 kg/m3 per the Hettich density table, used for the batten cladding
export const SOLID_WOOD: BoardMaterial = {
    id: "solid",
    label: "Bois massif (tasseaux)",
    kind: "solid",
    density: 800,
    densityCheck: 900,
    modulus: 10000,
    strength: 40,
    kdef: 0.6,
    kmod: 0.8,
    thicknesses: [18, 20, 27],
    source: "Densité : table Hettich SlideLine M 2017. "
        + "Module et résistance : valeur prudente non sourcée, non utilisée par les contrôles",
};

// Solid wood sold by the board, keyed decor:thickness. Brico Dépôt plaend oak, ref. 3663602861539, read on
// 2026-10-08 : 2000 x 140 x 20 by the piece
// https://www.bricodepot.fr/p/3663602861539/planche-rabotee-en-chene-massif-l-200-cm-section-140-x-20-mm
export const SOLID_STOCK: Record<string, { length: number; width: number }> = {
    "CHENE_MASSIF:20": { length: 2000, width: 140 },
};


// Decospan Decopanel MDF-BOARD datasheet (2021) : standard MDF 570 to 720 kg/m3, MOE 1500 to 2400
// MOR 15 to 23, E1. The low ends go to the deflection check, 900 kg/m3 for loads as for any MDF (Hettich)
// 2800 x 2070 stocked in 4, 9, 13, 16, 17, 19, 23, 26, 29, 31 and 39 mm
// https://keflico.com/Files/Files/Produkt%20dokumenter/%C3%98vrige%20dokumenter/Datablad-MDF-Fineret-Decospan.pdf
export const MDF_VENEER: BoardMaterial = {
    id: "mdf_veneer",
    label: "MDF plaqué bois véritable",
    kind: "mdf",
    density: 720,
    densityCheck: 900,
    modulus: 1500,
    strength: 15,
    kdef: 2.25,
    kmod: 0.6,
    thicknesses: [4, 9, 13, 16, 17, 19, 23, 26, 29, 31, 39],
    source: "Decospan Decopanel MDF-BOARD fiche technique 2021, Hettich SlideLine M 2017, "
        + "EN 1995-1-1:2004 tab. 3.2 via COFORD",
};

// Decospan Decopanel CHIPBOARD datasheet (2019) : P2 core 610 to 750 kg/m3, MOE 1200 to 1800, MOR 10 to 14. The
// heavy and weak ends taken as for the MDF-BOARD, creep as for P2. 2800 x 2070 stocked up to 39 mm
// https://media.tis.rs/2020/08/Decospan-data-sheet-chipboard.pdf
export const CHIPBOARD_VENEER: BoardMaterial = {
    id: "p2_veneer", 
    label: "Aggloméré P2 plaqué bois véritable",
    kind: "melamine",
    density: 750,
    densityCheck: 750,
    modulus: 1200,
    strength: 10,
    kdef: PARTICLEBOARD.kdef,
    kmod: PARTICLEBOARD.kmod,
    thicknesses: [9, 13, 16, 17, 19, 23, 26, 29, 39],
    source: "Decospan Decopanel CHIPBOARD fiche technique 2019 (EN 323, EN 310), kdef et kmod repris du P2",
};


// AGC Planibel data sheet 01/2023, EN 572-1 : 2500 kg/m3, E 70 000 N/mm2, glass does not creep. Its strength is
// the annealed characteristic one, never used as a design value : the glass design standard was not read, the glazier
// checks loads
// https://www.agc-yourglass.com/sites/default/files/2023-01/TDS_Planibel_0123_EN.pdf
export const GLASS: BoardMaterial = {
    id: "glass",
    label: "Verre trempé clair",
    kind: "glass",
    density: 2500,
    densityCheck: 2500,
    modulus: 70000,
    strength: 45,
    kdef: 0,
    // a timber load-duration factor, it has no meaning for glass
    kmod: 1,
    thicknesses: [5, 6],
    source: "AGC Planibel TDS 01/2023 (EN 572-1, épaisseurs EN 572-2)",
};


export const MATERIALS: Record<string, BoardMaterial> = {
    [PARTICLEBOARD.id]: PARTICLEBOARD,
    [MDF.id]: MDF,
    [MDF_VENEER.id]: MDF_VENEER,
    [CHIPBOARD_VENEER.id]: CHIPBOARD_VENEER,
    [MDF_FLEX.id]: MDF_FLEX,
    [SOLID_WOOD.id]: SOLID_WOOD,
    [GLASS.id]: GLASS,
};

// Thicknesses offered for carcasses, shelves and wall shelves, the analysis tells when a material is not
// verifed in one of them
export const BOARD_THICKNESSES = [16, 19, 22];


export interface Decor
{
    id: string;
    label: string;
    brand: string;
    ref: string;
    material: string;
    // true when the decor has a grain that forbids rotating the part on the sheet
    grain: boolean;
    rgb: [number, number, number];
    rgbDark?: [number, number, number];
    rgbLight?: [number, number, number];
    colourSource: string;
    references?: string;
    url?: string;
    edge?: string;
    // a product sold in one thickness only, a glass shelf, whatever the carcass is made of
    thickness?: number;
}


// Sheet format checked on Houdard and Dispano listings : 2800 x 2070
export const SHEET_LENGTH = 2800;
export const SHEET_WIDTH = 2070;


// the same Decospan oak veneer on its MDF and its chipboard cores
const OAK_VENEER = {
    grain: true,
    rgb: [178, 154, 125] as [number, number, number],
    rgbDark: [158, 132, 101] as [number, number, number], 
    rgbLight: [200, 178, 151] as [number, number, number],
    colourSource: "Couleur d'affichage reprise du H1180, pas une mesure du placage : importer une photo de l'échantillon",
    edge: "Chant placage chêne, référence au choix du distributeur",
};

export const DECORS: Decor[] = [
    {
        id: "H1180_ST37",
        label: "Chêne Halifax naturel",
        brand: "Egger",
        ref: "H1180 ST37",
        material: "p2", 
        grain: true,
        rgb: [178, 154, 125],
        rgbDark: [158, 132, 101],
        rgbLight: [200, 178, 151],
        colourSource: "Mesuré sur la photo de l'échantillon (éclairage intérieur)",
        url: "https://www.egger.com/fr/mobilier-agencement-interieur/decors/H1180_37",
        edge: "Chant ABS H1180 ST37 23x0,8 (Jean Hue Socoda)",
    },
    {
        id: "U604_ST9",
        label: "Vert eucalyptus",
        brand: "Egger",
        ref: "U604 ST9",
        material: "p2",
        grain: false,
        rgb: [117, 127, 116],
        colourSource: "Image décor Egger",
        references: "NCS S5010-G30Y, RAL 7033, Pantone 5635U",
        url: "https://www.egger.com/fr/mobilier-agencement-interieur/decors/U604_9?country=FR",
        edge: "Chant ABS U604 ST9 23x0,8 (Jean Hue Socoda)",
    },
    // asked by Thomas D. at Colmar for a softer green and a lighter oak, read on egger.com on 2026-10-08 : the colours
    // are the mean of Egger's decor picture, no French merchant price found yet
    {
        id: "U638_ST9",
        label: "Vert sauge",
        brand: "Egger",
        ref: "U638 ST9",
        material: "p2",
        grain: false,
        rgb: [193, 187, 164],   
        colourSource: "Moyenne de l'image décor Egger",
        url: "https://www.egger.com/fr/mobilier-agencement-interieur/decors/U638_9?country=FR",
        edge: "Chant ABS Egger U638 ST9 assorti",
    },
    {
        id: "H3165_ST12",
        label: "Chêne Vicenza clair",
        brand: "Egger",
        ref: "H3165 ST12",
        material: "p2",
        grain: true,
        rgb: [216, 192, 165],
        rgbDark: [203, 179, 152],
        rgbLight: [227, 203, 177],
        colourSource: "Image décor Egger : moyenne, 10e et 90e centiles de clarté",
        url: "https://www.egger.com/fr/mobilier-agencement-interieur/decors/H3165_12?country=FR",
        edge: "Chant ABS Egger H3165 ST12 assorti",
    },
    {
        id: "H1367_ST40",
        label: "Chêne Casella naturel clair",
        brand: "Egger",
        ref: "H1367 ST40",
        material: "p2",
        grain: true,
        rgb: [205, 176, 139],
        rgbDark: [193, 163, 126],
        rgbLight: [217, 188, 151],
        colourSource: "Image décor Egger : moyenne, 10e et 90e centiles de clarté",
        url: "https://www.egger.com/fr/mobilier-agencement-interieur/decors/H1367_40?country=FR",
        edge: "Chant ABS Egger H1367 ST40 assorti",
    },
    {
        id: "W1000_ST9",
        label: "Blanc premium",
        brand: "Egger",
        ref: "W1000 ST9",
        material: "p2",
        grain: false,
        rgb: [251, 252, 244],
        colourSource: "Image décor Egger",
        references: "NCS S0502-G, RAL 9003",
        url: "https://www.egger.com/fr/mobilier-agencement-interieur/decors/W1000_9?country=FR",
    },
    {
        // the cheap white of the backs : 8 mm in stock where the W1000 is not, its maker not named by the merchant
        id: "SNOW_WHITE_8685",
        label: "Blanc basique",
        brand: "Jean Hue & Socoda",
        ref: "Les Essentiels Snow White 8685 BS",
        material: "p2",
        grain: false,
        rgb: [255, 255, 255],
        colourSource: "Image décor Jean Hue & Socoda, aplat blanc",
        references: "Décor 8685 Snow White, attribué à Kronospan par des revendeurs (non vérifié)",
        url: "https://www.jeanhue-socoda.fr/melamine/melamines-decoratifs/melamine-decoratif-les-basiques/"
            + "agglomere-melamine-les-essentiels-snow-white-8685-bs-2800x2070mm-08mm",
    },
    {
        id: "CHENE_MASSIF",
        label: "Chêne massif (tasseaux)",
        brand: "",
        ref: "",
        material: "solid",
        grain: true, 
        rgb: [178, 154, 125],
        rgbDark: [158, 132, 101],
        rgbLight: [200, 178, 151],
        colourSource: "Couleur d'affichage reprise du H1180, pas une mesure de chêne massif",
    },
    // shelves only, on the Häfele glass supports of their thickness
    {
        id: "VERRE_5",
        label: "Verre trempé clair 5 mm",
        brand: "",
        ref: "",
        material: "glass",
        grain: false,
        rgb: [206, 222, 222],
        colourSource: "Teinte d'affichage conventionnelle d'un verre clair vu sur chant, pas une mesure",
        thickness: 5,
    },
    {
        id: "VERRE_6",
        label: "Verre trempé clair 6 mm",
        brand: "",
        ref: "",
        material: "glass",
        grain: false,
        rgb: [206, 222, 222],
        colourSource: "Teinte d'affichage conventionnelle d'un verre clair vu sur chant, pas une mesure",
        thickness: 6,
    },
    {
        id: "MDF_FLEX",
        label: "MDF cintrable (à plaquer ou laquer)",
        brand: "",
        ref: "",
        material: "mdf_flex",
        grain: false,
        rgb: [196, 160, 122],
        colourSource: "Teinte brute indicative, la peau reçoit un placage ou une laque",
    },
    {
        id: "CHENE_PLAQUE",
        label: "MDF plaqué chêne",
        brand: "Decospan",
        ref: "MDF-BOARD chêne",
        material: "mdf_veneer",
        ...OAK_VENEER,
    }, 
    {
        id: "CHENE_PLAQUE_AGGLO",
        label: "Aggloméré plaqué chêne",
        brand: "Decospan",
        ref: "Decopanel CHIPBOARD chêne",
        material: "p2_veneer",
        ...OAK_VENEER,
    },
    {
        id: "MDF_LAQUE",
        label: "MDF laqué (teinte libre)",
        brand: "",
        ref: "",
        material: "mdf",
        grain: false,
        rgb: [230, 226, 218],
        colourSource: "Teinte choisie par l'utilisateur",
    },
];


export function decorById(id: string): Decor
{
    for (const d of DECORS)
    {
        if (d.id === id)
        {
            return d;
        }
    }
    throw new Error(`Décor inconnu : ${id}. Choisir un décor de la liste.`);
}


export function materialOfDecor(decor: Decor): BoardMaterial
{
    const m = MATERIALS[decor.material];
    if (m === undefined)
    {
        throw new Error(`Matériau inconnu pour le décor ${decor.id}`);
    }
    return m;
}
