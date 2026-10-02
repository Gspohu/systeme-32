// Public prices read on 1 and 2 October 2026, excluding VAT : TTC divided by 1.2, pounds and dollars at the ECB rate of
// that day, import costs left out. An order of magnitude, a professional quote will differ

import type { PriceEntry } from "../core/model";


const READ_ON = "2026-10-01";
const READ_ON_2 = "2026-10-02";
// ECB euro reference rates of 1 October 2026
const GBP = 0.85373;
const USD = 1.1298;
const SHEET_M2 = 2.8 * 2.07;

function ht(ttc: number): number
{
    return Math.round(ttc / 1.2 * 1000) / 1000;
}

function fromGbp(gbp: number): number
{
    return Math.round(gbp / GBP * 1000) / 1000;
}

function fromUsd(usd: number): number
{
    return Math.round(usd / USD * 1000) / 1000;
}

function perSheet(eurHt: number): number
{
    return Math.round(eurHt / SHEET_M2 * 100) / 100;
}

function entry(value: number, unit: PriceEntry["unit"], source: string, date = READ_ON): PriceEntry
{
    return { value, unit, source, date };
}


const JHS = "Jean Hue & Socoda";

export const DEFAULT_PRICES: Record<string, PriceEntry> = {
    "board:H1180_ST37:19": entry(perSheet(143.36), "m2", "Houdard, 143,36 EUR HT le panneau 2800 x 2070, en stock"),
    "board:H1180_ST37:8": entry(ht(38.84), "m2", `${JHS}, 38,84 EUR TTC/m2 (225,12 le panneau), en stock`),
    // Egger makes every thickness but its stocked one to order (decor availability guide 2020), no merchant
    // shows a price for 16 : the 19 one stands in until a quote comes
    "board:H1180_ST37:16": entry(perSheet(143.36), "m2", "Estimation au prix du 19 mm (Houdard, 143,36 EUR HT le "
                                 + "panneau) : 16 mm sur commande chez Egger, avec délai, sans prix public"),
    "board:CHENE_PLAQUE:39": entry(ht(79.57), "m2", "Barillet, Decospan replaqué chêne fil A/B 2800 x 2070 x 39 à "
                                   + "79,57 EUR TTC/m2, âme aggloméré : le MDF ne se fait pas en 39", READ_ON_2),
    "board:W1000_ST9:19": entry(ht(22.82), "m2", `${JHS}, 22,82 EUR TTC/m2 (132,26 le panneau), en stock`),
    "board:U604_ST9:19": entry(perSheet(101.3), "m2", "Houdard, 101,30 EUR HT le panneau 2800 x 2070, en stock"),
    // battens on their net area : a 2000 x 140 x 20 board is 0.28 m2
    "board:CHENE_MASSIF:20": entry(ht(29.9 / 0.28), "m2",
                                   "Brico Dépôt, chêne massif raboté 2000 x 140 x 20 à 29,90 TTC"),

    "edge:W1000_ST9": entry(ht(1.77), "m", `${JHS}, chant ABS Egger W1000 ST9 23 x 0,8 à 1,77 EUR TTC/m`),
    "edge:H1180_ST37": entry(ht(2.11), "m", `${JHS}, chant ABS Egger H1180 ST37 23 x 0,8 à 2,11 EUR TTC/m`),
    "edge:U604_ST9": entry(ht(1.77), "m", `${JHS}, chant ABS Egger U604 ST9 23 x 0,8 à 1,77 EUR TTC/m, en réassort`),
    // 46 wide to band a 39 thick shelf, the 40 one leaves the bander nothing to trim
    "edge:CHENE_PLAQUE": entry(ht(315.9 / 50), "m", `${JHS}, chant Decospan Querkus chêne 46 x 0,8, rouleau de 50 m à `
                               + "315,90 EUR TTC, en stock", READ_ON_2),

    "hw:71B3550": entry(fromGbp(2.42), "u", "Interfit (UK), 2,42 GBP HT la charnière"),
    "hw:173H7100": entry(fromGbp(0.42), "u", "Interfit (UK), 0,42 GBP HT l'embase"),
    "hw:760H4800S": entry(fromGbp(25.92), "u", "Interfit (UK), 25,92 GBP HT la paire"),
    "hw:71B3650": entry(fromGbp(2.70), "u", "Interfit (UK), 2,70 GBP HT la charnière, lu le 2 octobre"),
    "hw:760H3800S": entry(fromGbp(25.36), "u", "Interfit (UK), 25,36 GBP HT la paire, lu le 2 octobre"),
    "hw:T51.7601": entry(fromGbp(3.28), "u", "Interfit (UK), 3,28 GBP HT la paire gauche et droite"),
    "hw:48N0510.02": entry(fromGbp(1.14), "u", "Interfit (UK), 1,14 GBP HT la ferrure"),
    "hw:48N0510.03": entry(fromGbp(1.14), "u", "Interfit (UK), 1,14 GBP HT la ferrure"),
    "hw:609.1500": entry(fromGbp(2.66 / 100), "u", "Interfit (UK), 2,66 GBP HT le sachet de 100"),
    "hw:637.76.352": entry(fromGbp(0.99), "u", "Interfit (UK), pied AXILO 80 mm à 0,99 GBP HT"),
    // sold one by one in Spain : the 21 % of the Spanish VAT comes off, not the French 20
    "hw:637.76.333": entry(Math.round(0.67 / 1.21 * 1000) / 1000, "u",
                           "Monastil (Espagne), 0,67 EUR TTC l'embase avec 21 % de TVA, en stock", READ_ON_2),

    "hw:262.25.035": entry(fromUsd(0.35), "u", "Home Decor Hardware (US), 0,35 USD HT le boîtier"),
    "hw:262.28.020": entry(fromUsd(0.44), "u", "Home Decor Hardware (US), 0,44 USD HT le 262.28.026, "
                           + "même goujon B34 brut"),
    "hw:282.24.727": entry(fromUsd(0.22), "u", "Home Decor Hardware (US), 0,22 USD HT le taquet"),
    "hw:637.38.054": entry(fromUsd(0.77), "u", "Home Decor Hardware (US), 0,77 USD HT le clip"),

    "hw:ANTI_TIP_BRACKET": entry(ht(1.59), "u", "Brico Dépôt, équerre d'assemblage 40 x 40 x 40 à 1,59 EUR TTC"),
    "hw:DOWEL_8x35": entry(ht(4.99 / 100), "u", "Brico Dépôt, 100 tourillons hêtre 8 x 40 à 4,99 TTC, 8 x 35 non vendu"),
    "hw:PLUG_NYLON_8x40": entry(ht(1.89 / 20), "u", "Brico Dépôt, lot de 20 chevilles nylon 8 x 40 à 1,89 EUR TTC"),
    "hw:SCREW_4x16": entry(ht(8.09 / 200), "u", "Brico Dépôt, boîte de 200 vis fischer 4 x 16 à 8,09 EUR TTC"),
    "hw:WALL_SCREW_5x50": entry(ht(34.9 / 500), "u", "Brico Dépôt, boîte de 500 vis fischer 5 x 50 à 34,90 EUR TTC"),

    // no workshop seen publishes its sawing and banding apart from the board : Houdard, SM Bois, Leroy Merlin
    // Design ADF, Fouchard, tosize and Mauris quote them or fold them into a price per m2
    // TODO a merchant's own scale, or a quote from the cabinet maker, should replace this one
    "service:cut": entry(4, "u", "Indicatif, source non vérifiée : usinage.services, 4 EUR le trait de scie compté "
                         + "une fois par pièce, HT ou TTC non précisé", READ_ON_2),
    "service:edging": entry(5, "m", "Indicatif, source non vérifiée : usinage.services, collage de chant à 5 EUR le "
                            + "mètre, HT ou TTC non précisé", READ_ON_2),
};

// Left unpriced, never counted as zero : W1000 in 8 and 16 mm priced only by store at Gedimat, flexible MDF out
// of stock or unreadable
