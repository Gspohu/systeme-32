// Hardware catalogue, every reference checked against the manufacturer document named in `source`

import { DIAM } from "../core/text";
import { HK_TOP } from "./rules";

// Standard part families of the PBS : D50 and D60 reuse the Free-pbs families, the others are new
export type Family = "D20" | "D21" | "D22" | "D30" | "D31" | "D41" | "D42" | "D50" | "D60" | "D70" | "D80" | "D81";


export const FAMILY_LABELS: Record<Family, string> = {
    D20: "Charnières",
    D21: "Embases",
    D22: "Relevants",
    D30: "Coulisses de tiroir",
    D31: "Ferrures de portes coulissantes",
    D41: "Connecteurs d'assemblage",
    D42: "Tourillons",
    D50: "Ouvertures par pression",
    D60: "Supports et fixations",
    D70: "Taquets d'étagère",
    D80: "Penderie",
    D81: "Éclairage",
};


export interface HardwareItem
{
    id: string;
    family: Family;
    label: string;
    brand: string;
    ref: string;
    source: string;
    url?: string;
}


const BLUM_KA150 = "Blum, Catalogue et manuel de mise en oeuvre 2022/2023 (KA-150)";
const BLUM_KA150_URL = "https://publications.blum.com/2022/catalogue/fr/";
const HAFELE_UK = "Häfele U.K., Furniture Fittings Technology 2018";
const HETTICH_SLM = "Hettich, SlideLine M brochure HMV 17723 (2017)";
const HETTICH_SLM_URL = "https://web.hettich.com/fileadmin/media/RES/SlideLineM_2017_HMV_17723_fr.pdf";
const LAMELLO_P14 = "Lamello, Clamex P-14 operating instructions and P-System brochure";


export const HARDWARE: Record<string, HardwareItem> = {};

function add(item: HardwareItem): HardwareItem
{
    HARDWARE[item.id] = item;
    return item;
}


// Hinges, catalogue p. 74 : screw-on cup, BLUMOTION with spring, or no spring for TIP-ON
add({ id: "71B3550", family: "D20", label: "Charnière CLIP top BLUMOTION 110°, en applique", brand: "Blum",
     ref: "71B3550", source: `${BLUM_KA150} p. 74`, url: BLUM_KA150_URL });
add({ id: "71B3650", family: "D20", label: "Charnière CLIP top BLUMOTION 110°, portes jumelées", brand: "Blum",
     ref: "71B3650", source: `${BLUM_KA150} p. 74`, url: BLUM_KA150_URL });
add({ id: "71B3750", family: "D20", label: "Charnière CLIP top BLUMOTION 110°, porte encastrée", brand: "Blum",
     ref: "71B3750", source: `${BLUM_KA150} p. 74`, url: BLUM_KA150_URL });
add({ id: "70T3550.TL", family: "D20", label: "Charnière CLIP top 110° sans ressort, en applique (TIP-ON)",
     brand: "Blum", ref: "70T3550.TL", source: `${BLUM_KA150} p. 74`, url: BLUM_KA150_URL });
add({ id: "70T3650.TL", family: "D20", label: "Charnière CLIP top 110° sans ressort, portes jumelées (TIP-ON)",
     brand: "Blum", ref: "70T3650.TL", source: `${BLUM_KA150} p. 74`, url: BLUM_KA150_URL });
add({ id: "70T3750.TL", family: "D20", label: "Charnière CLIP top 110° sans ressort, porte encastrée (TIP-ON)",
     brand: "Blum", ref: "70T3750.TL", source: `${BLUM_KA150} p. 74`, url: BLUM_KA150_URL });
add({ id: "173H7100", family: "D21", label: "Embase en croix 37/32, distance 0, réglage excentrique", brand: "Blum",
     ref: "173H7100", source: `${BLUM_KA150} p. 146`, url: BLUM_KA150_URL });
add({ id: "609.1500", family: "D41", label: `Vis agglo ${DIAM}3,5 x 15`, brand: "Blum", ref: "609.1500",
     source: `${BLUM_KA150} p. 74 et 432`, url: BLUM_KA150_URL });
add({ id: "956.1004", family: "D50", label: "TIP-ON pour portes, version courte avec aimant", brand: "Blum",
     ref: "956.1004", source: `${BLUM_KA150} p. 172`, url: BLUM_KA150_URL });
add({ id: "956A1004", family: "D50", label: "TIP-ON pour portes, version longue avec aimant", brand: "Blum",
     ref: "956A1004", source: `${BLUM_KA150} p. 172`, url: BLUM_KA150_URL });


// AVENTOS HK top, catalogue p. 44 (handle), 48 (TIP-ON), 51 : sets of two symmetrical mechanisms
// fixed with 8 chipboard screws dia 4 x 35 through the integrated positioning system
for (const m of HK_TOP.mechanisms)
{
    add({ id: m.handle, family: "D22", label: `Set AVENTOS HK top, LF ${m.lfMin}-${m.lfMax}, ${m.deg}°`, brand: "Blum",
         ref: m.handle, source: `${BLUM_KA150} p. 44`, url: BLUM_KA150_URL });
    add({ id: m.push, family: "D22", label: `Set AVENTOS HK top pour TIP-ON, LF ${m.lfMin}-${m.lfMax}, ${m.pushDeg}°`,
         brand: "Blum", ref: m.push, source: `${BLUM_KA150} p. 48`, url: BLUM_KA150_URL });
}
add({ id: "22K8000", family: "D22", label: "Jeu de caches AVENTOS HK top, gauche et droit", brand: "Blum",
     ref: "22K8000",
     source: `${BLUM_KA150} p. 44`, url: BLUM_KA150_URL });
add({ id: "20S4200", family: "D22", label: "Jeu d'équerres de façade AVENTOS HK top à visser, façade bois",
     brand: "Blum",
     ref: "20S4200", source: `${BLUM_KA150} p. 44`, url: BLUM_KA150_URL });
add({ id: "956.1201", family: "D50", label: "Embase droite TIP-ON 20/17, version courte", brand: "Blum", ref: "956.1201",
     source: `${BLUM_KA150} p. 51`, url: BLUM_KA150_URL });


// MOVENTO runners, catalogue p. 418 : 760H 40 kg, 766H 60/70 kg
export const MOVENTO_760H = [250, 270, 300, 320, 350, 380, 400, 420, 450, 480, 500, 520, 550, 600];
export const MOVENTO_766H = [450, 500, 520, 550, 580, 600, 650, 700, 750];
for (const nl of MOVENTO_760H)
{
    const ref = `760H${String(nl * 10).padStart(4, "0")}S`;
    add({ id: ref, family: "D30", label: `Coulisse MOVENTO BLUMOTION S 40 kg, NL ${nl}`, brand: "Blum", ref,
         source: `${BLUM_KA150} p. 418`, url: BLUM_KA150_URL });
}
for (const nl of MOVENTO_766H)
{
    const ref = `766H${String(nl * 10).padStart(4, "0")}S`;
    add({ id: ref, family: "D30", label: `Coulisse MOVENTO BLUMOTION S 60/70 kg, NL ${nl}`, brand: "Blum", ref,
         source: `${BLUM_KA150} p. 418`, url: BLUM_KA150_URL });
}
add({ id: "T51.7601", family: "D30", label: "Accouplement MOVENTO gauche/droit", brand: "Blum", ref: "T51.7601",
     source: `${BLUM_KA150} p. 418`, url: BLUM_KA150_URL });

// TIP-ON BLUMOTION for MOVENTO, catalogue p. 436 : set chosen by nominal lenght and drawer weight
export interface TipOnSet
{
    ref: string;
    nlMin: number;
    nlMax: number;
    kgMin: number;
    kgMax: number;
}

export const TIPON_BLUMOTION_SETS: TipOnSet[] = [
    { ref: "T60L7040", nlMin: 270, nlMax: 320, kgMin: 0, kgMax: 10 },
    { ref: "T60L7140", nlMin: 270, nlMax: 320, kgMin: 10, kgMax: 20 },
    { ref: "T60L7340", nlMin: 350, nlMax: 600, kgMin: 0, kgMax: 20 },
    { ref: "T60L7540", nlMin: 350, nlMax: 600, kgMin: 15, kgMax: 40 },
    { ref: "T60L7570", nlMin: 450, nlMax: 750, kgMin: 35, kgMax: 70 },
];
for (const s of TIPON_BLUMOTION_SETS)
{
    add({ id: s.ref, family: "D50", label: `Set TIP-ON BLUMOTION MOVENTO, NL ${s.nlMin}-${s.nlMax}, ${s.kgMin}-${s.kgMax} kg`,  
          brand: "Blum", ref: s.ref, source: `${BLUM_KA150} p. 436`, url: BLUM_KA150_URL });
}
add({ id: "T60.300D", family: "D50", label: "Synchronisation TIP-ON BLUMOTION (LW 265-313, à recouper LW - 241)",
     brand: "Blum", ref: "T60.300D", source: `${BLUM_KA150} p. 436`, url: BLUM_KA150_URL });
add({ id: "T60.000D", family: "D50", label: "Adaptateur de synchronisation TIP-ON BLUMOTION (LW >= 314)",
     brand: "Blum", ref: "T60.000D", source: `${BLUM_KA150} p. 436`, url: BLUM_KA150_URL });

// Suspension, catalogue p. 586
add({ id: "48N0510.02", family: "D60", label: "Ferrure de suspension à visser, droite (130 kg la paire)",
     brand: "Blum", ref: "48N0510.02", source: `${BLUM_KA150} p. 586`, url: BLUM_KA150_URL });
add({ id: "48N0510.03", family: "D60", label: "Ferrure de suspension à visser, gauche (130 kg la paire)",
     brand: "Blum", ref: "48N0510.03", source: `${BLUM_KA150} p. 586`, url: BLUM_KA150_URL });

// Anti-tip fixing of a standing carcass : no manufacturer datasheet could be read (Häfele and Würth refuse
// bots, Camar and Emuca list no reference), sizes follow the Furnica guide, a retailer blog
// https://furnica.fr/blogs/infos/securite-anti-basculement-armoire-dressing-fixation-murale
const ANTI_TIP = "Guide Furnica (vendeur), convention d'atelier : pas une donnée fabricant, référence au choix du distributeur";
add({ id: "ANTI_TIP_BRACKET", family: "D60", label: "Équerre anti-basculement acier galvanisé 40 x 40 x 40, ép. 2 mm",
     brand: "", ref: "Générique", source: ANTI_TIP });
add({ id: "SCREW_4x16", family: "D60", label: "Vis aggloméré 4 x 16, équerre dans le dessus du caisson", brand: "",
     ref: "Générique", source: ANTI_TIP });
add({ id: "WALL_SCREW_5x50", family: "D60", label: "Vis 5 x 50, équerre dans le mur", brand: "", ref: "Générique",
     source: ANTI_TIP });
// Slat walls : a 20 mm cleat before the 40 mm plug asks for a 70 mm screw, the slats are glued and pinned
const SLATS = ("Convention d'atelier, pas une donnée fabricant, référence au choix du distributeur");
add({ id: "WALL_SCREW_5x70", family: "D60", label: "Vis 5 x 70, liteau ou lisse dans le mur, le sol ou le plafond",
     brand: "", ref: "Générique", source: SLATS });   
add({ id: "BRAD_1_6x40", family: "D60", label: "Pointe tête homme 1,6 x 40, latte collée sur liteau", brand: "",
     ref: "Générique", source: SLATS });
add({ id: "PLUG_NYLON_8x40", family: "D60", label: `Cheville nylon universelle ${DIAM}8 x 40, béton ou brique pleine`,
     brand: "", ref: "Générique", source: ANTI_TIP });
add({ id: "PLUG_AERATED", family: "D60", label: "Cheville hélicoïdale pour béton cellulaire", brand: "",
     ref: "Générique", source: ANTI_TIP });
add({ id: "PLUG_HOLLOW_METAL", family: "D60", label: "Cheville métallique à expansion pour plaque de plâtre, vis fournie",
     brand: "", ref: "Générique", source: ANTI_TIP });

// Clothes rails, Häfele U.K. TCH Design 2017 : the tube is left generic, the check takes the thinnest Ø 25
// wall still sold (0.6 mm, 801.12.523 p. 2.49), the supports keep their catalogue geometry
const HAFELE_TCHD = "Häfele U.K., TCH Design 2017";
add({ id: "RAIL_TUBE_25", family: "D80", label: `Tube de penderie rond acier ${DIAM}25, paroi 0,6 mm mini, barre 2,5 m`, 
     brand: "", ref: "Générique", source: `${HAFELE_TCHD} p. 2.49, calcul fait pour la paroi de 0,6 mm`,
     url: "https://assets.daro.com/HafeleLiterature/17D2-49.pdf" });
add({ id: "803.53.220", family: "D80", label: `Rosace de tringle ${DIAM}25 chromée, ${DIAM}48, 2 vis ${DIAM}4`, 
     brand: "Häfele", 
     ref: "803.53.220", source: `${HAFELE_TCHD} p. 2.48`, url: "https://assets.daro.com/HafeleLiterature/17D2-48.pdf" });
add({ id: "SCREW_4x16_RAIL", family: "D80", label: "Vis aggloméré 4 x 16, rosaces et support central de tringle",
     brand: "", ref: "Générique", source: `${HAFELE_TCHD} p. 2.48 (vis ${DIAM}4 à commander à part), longueur par convention` });
add({ id: "802.02.250", family: "D80", label: `Support central de tringle ${DIAM}25 sous tablette, hauteur 66 mm`,
     brand: "Häfele", ref: "802.02.250", source: `${HAFELE_TCHD} p. 2.48`,
     url: "https://assets.daro.com/HafeleLiterature/17D2-48.pdf" });
// Pull down rails, TCH Design 2017 p. 2.40, nickel-plated with a black pull rod, fixings included
for (const [ref, range] of [["805.20.326", "440-610"], ["805.20.352", "600-1000"], ["805.20.356", "770-1200"]] as const)
{
    add({ id: ref, family: "D80", label: `Ascenseur de penderie Servetto 2004, largeur intérieure ${range} mm, 10 kg`,
         brand: "Häfele", ref, source: `${HAFELE_TCHD} p. 2.40`, url: "https://assets.daro.com/HafeleLiterature/17D2-40.pdf" });
}
// Library ladder : no maker's sheet could be read, the rail and the ladder are bought together from one maker
const LADDER = "Générique, aucune fiche fabricant lue : charge, inclinaison et supports selon la notice de l'échelle";
add({ id: "LADDER_RAIL", family: "D60", label: "Rail d'échelle de bibliothèque, tube rond", brand: "", ref: "Générique",
     source: LADDER });
add({ id: "LADDER_SET", family: "D60", label: "Échelle de bibliothèque à crochets, avec supports de rail et embouts",
     brand: "", ref: "Générique", source: LADDER });
// Shoe racks, TCH Design 2017 p. 2.35 and 2.36, width adjustable
add({ id: "892.11.901", family: "D80", label: "Range-chaussures Tac, largeur réglable 560 à 1000 mm, 102 x 221 mm",
     brand: "Häfele", ref: "892.11.901", source: `${HAFELE_TCHD} p. 2.35`,
     url: "https://assets.daro.com/HafeleLiterature/17D2-35.pdf" });
add({ id: "892.12.906", family: "D80", label: "Range-chaussures, largeur réglable 480 à 750 mm, 87 x 205 mm",
     brand: "Häfele", ref: "892.12.906", source: `${HAFELE_TCHD} p. 2.36`,
     url: "https://assets.daro.com/HafeleLiterature/17D2-36.pdf" });
// LED : Loox 2017 survives as old stock and the Loox5 LED 3048 is marked discontinued by the one retailer
// read on 2026-09-30, the strip, profile and driver stay generic, sized with the figures those sheets give
const LED = "Générique, dimensionné d'après Häfele Loox (TCH Design 2017 p. 5.138, 5.149, 5.203), référence au choix du distributeur";
add({ id: "LED_PROFILE_RECESS", family: "D81", label: "Profilé aluminium à encastrer, corps 18 x 8,5 mm, diffuseur opale",
     brand: "", ref: "Générique", source: LED, url: "https://assets.daro.com/HafeleLiterature/17D5-203.pdf" });
add({ id: "LED_END_CAPS", family: "D81", label: "Paire d'embouts du profilé", brand: "", ref: "Générique",
     source: LED });
add({ id: "LED_STRIP_24V", family: "D81", label: "Ruban LED 24 V, 8 à 10 mm de large, en profilé aluminium", brand: "",
     ref: "Générique", source: LED, url: "https://www.homedecorhardware.com/hf-833-76-353.html" });
add({ id: "LED_LEAD", family: "D81", label: "Cordon d'alimentation du ruban vers l'alimentation", brand: "",
     ref: "Générique", source: LED });
add({ id: "LED_DRIVER_24V", family: "D81", label: "Alimentation 24 V à tension constante", brand: "", ref: "Générique",
     source: LED, url: "https://assets.daro.com/HafeleLiterature/17D5-149.pdf" });
add({ id: "LED_SPOT_ROUND", family: "D81",
     label: `Spot LED rond 24 V à encastrer, collerette ${DIAM}65, perçage ${DIAM}55 x 11, câble 2,5 m`, brand: "",
     ref: "Générique", source: "Générique, dimensionné d'après Häfele Loox 24V LED 3001 (TCH Design 2017 p. 5.119)",
     url: "https://assets.daro.com/HafeleLiterature/17D5-119.pdf" });

// Sliding doors
add({ id: "9156338", family: "D31", label: "Kit SlideLine M en applique, amorti, 30 kg, porte >= 450",
     brand: "Hettich", ref: "9156338", source: `${HETTICH_SLM} p. 8`, url: HETTICH_SLM_URL });
add({ id: "9156339", family: "D31", label: "Kit SlideLine M en applique, non amorti, porte >= 300", brand: "Hettich",
     ref: "9156339", source: `${HETTICH_SLM} p. 8`, url: HETTICH_SLM_URL });
add({ id: "9209167", family: "D31", label: "Kit 2 profilés SlideLine M h18 (étagère 18/19), 2500 mm", brand: "Hettich",
     ref: "9209167", source: `${HETTICH_SLM} p. 11`, url: HETTICH_SLM_URL });
add({ id: "9209218", family: "D31", label: "Kit 2 profilés SlideLine M h18 (étagère 18/19), 4000 mm",
     brand: "Hettich", ref: "9209218", source: `${HETTICH_SLM} p. 11`, url: HETTICH_SLM_URL });


// Connectors
add({ id: "262.25.035", family: "D41", label: "Boîtier Minifix 15 avec bord, bois 19 mm", brand: "Häfele",
     ref: "262.25.035", source: `${HAFELE_UK} p. 7.14`, url: "https://assets.daro.com/HafeleLiterature/18T7-14.pdf" });
add({ id: "262.28.020", family: "D41", label: `Goujon Minifix S100 B34, filet 8, avant-trou ${DIAM}5`, brand: "Häfele",
     ref: "262.28.020", source: `${HAFELE_UK} p. 7.19`, url: "https://assets.daro.com/HafeleLiterature/18T7-19.pdf" });
add({ id: "145334", family: "D41", label: "Clamex P-14, boîte de 80 paires", brand: "Lamello", ref: "145334",
     source: LAMELLO_P14, url: "https://lamello.com/fileadmin/products/Operating_instructions_Clamex_P14.pdf" });
add({ id: "145415", family: "D41", label: "Tenso P-14, boîte de 80 paires", brand: "Lamello", ref: "145415",
     source: LAMELLO_P14, url: "https://lamello.com/fileadmin/products/Operating_instructions_Clamex_P14.pdf" });
add({ id: "DOWEL_8x35", family: "D42", label: `Tourillon hêtre ${DIAM}8 x 35 cannelé`, brand: "",
     ref: "Générique", source: "Article générique, sans référence fabricant" });


// Plinth ventilation grill, p. 11.60 : black here, also 571.77.705 white, .500 grey, .900 matt silver, .200 chrome
add({ id: "571.77.300", family: "D60", label: "Grille de ventilation de plinthe 458 x 65, noire, découpe 448 x 55",
     brand: "Häfele", ref: "571.77.300", source: `${HAFELE_UK} p. 11.60`,
     url: "https://assets.daro.com/HafeleLiterature/18T11-60.pdf" });

// Feet and plinth, Häfele U.K. 2018 p. 11.43A-C
const HAFELE_AXILO_URL = "https://assets.daro.com/HafeleLiterature/18T11-43A-D.pdf";
add({ id: "637.76.333", family: "D60", label: "AXILO 78, embase à visser", brand: "Häfele",
     ref: "637.76.333", source: `${HAFELE_UK} p. 11.43A`, url: HAFELE_AXILO_URL });
add({ id: "637.38.054", family: "D60", label: "AXILO 78, clip de plinthe à visser", brand: "Häfele", ref: "637.38.054",
     source: `${HAFELE_UK} p. 11.43B`, url: HAFELE_AXILO_URL });

export interface Foot
{
    ref: string;
    height: number;
    min: number;
    max: number;
}


// Load 150 kg per foot, adjustment under load limited to an 80 kg cabinet
export const AXILO_FEET: Foot[] = [
    { ref: "637.76.351", height: 60, min: 53, max: 80 },
    { ref: "637.76.352", height: 80, min: 70, max: 100 },
    { ref: "637.76.353", height: 100, min: 90, max: 120 },
    { ref: "637.76.354", height: 125, min: 115, max: 145 },
    { ref: "637.76.355", height: 150, min: 140, max: 170 },
    { ref: "637.76.356", height: 180, min: 170, max: 200 },
];
export const AXILO_LOAD_PER_FOOT = 150;
export const AXILO_ADJUST_MAX_CABINET = 80;
for (const f of AXILO_FEET)
{
    add({ id: f.ref, family: "D60", label: `AXILO 78, pied H${f.height} (réglage ${f.min}-${f.max})`,
         brand: "Häfele", ref: f.ref, source: `${HAFELE_UK} p. 11.43A`, url: HAFELE_AXILO_URL });
}

// Shelf supports for 5 mm holes, Häfele loads for 4 supports evenly loaded
export interface ShelfSupport
{
    ref: string;
    label: string;
    kgFor4: number;
}


export const SHELF_SUPPORTS: ShelfSupport[] = [
    { ref: "282.24.727", label: `Taquet ${DIAM}5 zamak nickelé avec ergot`, kgFor4: 62.4 },
    { ref: "282.33.703", label: `Taquet ${DIAM}5 plastique blanc`, kgFor4: 80 },
    { ref: "282.26.730", label: `Taquet ${DIAM}5 fileté zamak nickelé`, kgFor4: 150 },
];
for (const s of SHELF_SUPPORTS)
{
    add({ id: s.ref, family: "D70", label: `${s.label} (${s.kgFor4} kg pour 4)`, brand: "Häfele",
         ref: s.ref, source: `${HAFELE_UK} p. 7.158-7.159`,
         url: "https://assets.daro.com/HafeleLiterature/18T7-158.pdf" });
}


// Glass shelf supports for 5 mm holes, p. 7.166 : chosen by the glass thickness, no load is published for them
export const GLASS_SUPPORTS: Record<number, string> = { 5: "281.42.403", 6: "281.41.907" };
add({ id: "281.42.403", family: "D70", label: `Support de tablette verre ${DIAM}5, verre de 4 ou 5 mm, transparent`,
     brand: "Häfele", ref: "281.42.403", source: `${HAFELE_UK} p. 7.166`,
     url: "https://assets.daro.com/HafeleLiterature/18T7-166.pdf" });
add({ id: "281.41.907", family: "D70", label: `Support de tablette verre ${DIAM}5, verre de 6 mm maxi, arrêt anti-soulèvement`,
     brand: "Häfele", ref: "281.41.907", source: `${HAFELE_UK} p. 7.166`,
     url: "https://assets.daro.com/HafeleLiterature/18T7-166.pdf" });


export function hardware(id: string): HardwareItem
{
    const h = HARDWARE[id];
    if (h === undefined)
    {
        throw new Error(`Article de quincaillerie inconnu : ${id}`);
    }
    return h;
}
