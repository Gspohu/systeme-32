// Public prices read on 1 October 2026, excluding VAT : TTC divided by 1.2, pounds and dollars at the ECB rate of
// that day, import costs left out. An order of magnitude, a professional quote will differ

import type { PriceEntry } from "../core/model";


const READ_ON = "2026-10-01";
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
    "board:W1000_ST9:19": entry(ht(22.82), "m2", `${JHS}, 22,82 EUR TTC/m2 (132,26 le panneau), en stock`),
    "board:U604_ST9:19": entry(perSheet(101.3), "m2", "Houdard, 101,30 EUR HT le panneau 2800 x 2070, en stock"),
    // battens on their net area : a 2000 x 140 x 20 board is 0.28 m2
    "board:CHENE_MASSIF:20": entry(ht(29.9 / 0.28), "m2", "Brico Dépôt, chêne massif raboté 2000 x 140 x 20 à 29,90 TTC"),

    "edge:W1000_ST9": entry(ht(1.77), "m", `${JHS}, chant ABS Egger W1000 ST9 23 x 0,8 à 1,77 EUR TTC/m`),
    "edge:H1180_ST37": entry(ht(2.11), "m", `${JHS}, chant ABS Egger H1180 ST37 23 x 0,8 à 2,11 EUR TTC/m`),
    "edge:U604_ST9": entry(ht(1.77), "m", `${JHS}, chant ABS Egger U604 ST9 23 x 0,8 à 1,77 EUR TTC/m, en réassort`),

    "hw:71B3550": entry(fromGbp(2.42), "u", "Interfit (UK), 2,42 GBP HT la charnière"),
    "hw:173H7100": entry(fromGbp(0.42), "u", "Interfit (UK), 0,42 GBP HT l'embase"),
    "hw:760H4800S": entry(fromGbp(25.92), "u", "Interfit (UK), 25,92 GBP HT la paire"),
    "hw:T51.7601": entry(fromGbp(3.28), "u", "Interfit (UK), 3,28 GBP HT la paire gauche et droite"),
    "hw:48N0510.02": entry(fromGbp(1.14), "u", "Interfit (UK), 1,14 GBP HT la ferrure"),
    "hw:48N0510.03": entry(fromGbp(1.14), "u", "Interfit (UK), 1,14 GBP HT la ferrure"),
    "hw:609.1500": entry(fromGbp(2.66 / 100), "u", "Interfit (UK), 2,66 GBP HT le sachet de 100"),
    "hw:637.76.352": entry(fromGbp(0.99), "u", "Interfit (UK), pied AXILO 80 mm à 0,99 GBP HT"),

    "hw:262.25.035": entry(fromUsd(0.35), "u", "Home Decor Hardware (US), 0,35 USD HT le boîtier"),
    "hw:262.28.020": entry(fromUsd(0.44), "u", "Home Decor Hardware (US), 0,44 USD HT le 262.28.026, même goujon B34 brut"),
    "hw:282.24.727": entry(fromUsd(0.22), "u", "Home Decor Hardware (US), 0,22 USD HT le taquet"),
    "hw:637.38.054": entry(fromUsd(0.77), "u", "Home Decor Hardware (US), 0,77 USD HT le clip"),

    "hw:ANTI_TIP_BRACKET": entry(ht(1.59), "u", "Brico Dépôt, équerre d'assemblage 40 x 40 x 40 à 1,59 EUR TTC"),
    "hw:DOWEL_8x35": entry(ht(4.99 / 100), "u", "Brico Dépôt, 100 tourillons hêtre 8 x 40 à 4,99 TTC, 8 x 35 non vendu"),
    "hw:PLUG_NYLON_8x40": entry(ht(1.89 / 20), "u", "Brico Dépôt, lot de 20 chevilles nylon 8 x 40 à 1,89 EUR TTC"),
    "hw:SCREW_4x16": entry(ht(8.09 / 200), "u", "Brico Dépôt, boîte de 200 vis fischer 4 x 16 à 8,09 EUR TTC"),
    "hw:WALL_SCREW_5x50": entry(ht(34.9 / 500), "u", "Brico Dépôt, boîte de 500 vis fischer 5 x 50 à 34,90 EUR TTC"),
};

// Left unpriced, never counted as zero : H1180 in 16 mm stocked nowhere, W1000 in 8 and 16 mm priced only by
// store at Gedimat, flexible MDF out of stock or unreadable, plate 637.76.333 sold in a kit only, cutting and
// edge banding quoted on request
