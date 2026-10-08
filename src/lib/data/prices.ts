// Public prices read on 1 and 2 October 2026, excluding VAT : TTC divided by 1.2, pounds and dollars at the ECB rate of
// that day, import costs left out. An order of magnitude, a professional quote will differ

export interface PriceEntry
{
    // euros excluding VAT : per unit for hardware, per m2 for boards, per metre for edges, per hour of work
    value: number;
    unit: "u" | "m2" | "m" | "h";
    source: string | null;
    date: string | null;
    // quantity sold together, in the unit of the price : a roll of 50 m, a box of 300 screws. Bought whole
    pack?: number;
    // a board also sold in other sizes than 2800 x 2070, each at its own price per m2 excluding VAT : the nesting
    // buys the cheapest one thta holds the parts
    formats?: { length: number; width: number; value: number; source: string | null }[];
}


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

function entry(value: number, unit: PriceEntry["unit"], source: string, date = READ_ON, pack?: number): PriceEntry
{
    return pack === undefined ? { value, unit, source, date } : { value, unit, source, date, pack };
}


const JHS = "Jean Hue & Socoda";


function handlePrices(list: [string, number][]): Record<string, PriceEntry>
{
    const out: Record<string, PriceEntry> = {};
    for (const [ref, usd] of list)
    {
        out[`hw:${ref}`] = entry(fromUsd(usd), "u", `Home Decor Hardware (US), ${String(usd).replace(".", ",")} USD HT `
            + "la poignée, vis fournies, en stock", READ_ON_2);
    }
    return out;
}

// 46 wide to band a 39 thcik shelf, the 40 one leaves the bander nothing to trim, whatever the core
const OAK_EDGE = entry(ht(315.9 / 50), "m", `${JHS}, chant Decospan Querkus chêne 46 x 0,8, rouleau de 50 m à `
                       + "315,90 EUR TTC, en stock", READ_ON_2, 50);


export const DEFAULT_PRICES: Record<string, PriceEntry> = {
    "board:H1180_ST37:19": entry(perSheet(143.36), "m2", "Houdard, 143,36 EUR HT le panneau 2800 x 2070, en stock"),
    "board:H1180_ST37:8": entry(ht(38.84), "m2", `${JHS}, 38,84 EUR TTC/m2 (225,12 le panneau), en stock`),
    // Egger makes every thickness but its stocked one to order (decor availability guide 2020), no merchant
    // shows a price for 16 : the 19 one stands in until a quote comes
    "board:H1180_ST37:16": entry(perSheet(143.36), "m2", "Estimation au prix du 19 mm (Houdard, 143,36 EUR HT le "
                                 + "panneau) : 16 mm sur commande chez Egger, avec délai, sans prix public"),
    "board:CHENE_PLAQUE_AGGLO:39": entry(ht(79.57), "m2", "Barillet, Decospan replaqué chêne fil A/B 2800 x 2070 x 39 à "
                                         + "79,57 EUR TTC/m2, âme aggloméré", READ_ON_2),
    "board:W1000_ST9:19": entry(ht(22.82), "m2", `${JHS}, 22,82 EUR TTC/m2 (132,26 le panneau), en stock`),
    "board:SNOW_WHITE_8685:8": entry(ht(22.98), "m2", `${JHS}, réf. 1001137234, 22,98 EUR TTC/m2 (133,22 le panneau `
                                     + "2800 x 2070), en stock", READ_ON_2),
    "board:U604_ST9:19": entry(perSheet(101.3), "m2", "Houdard, 101,30 EUR HT le panneau 2800 x 2070, en stock"),
    // by the whole board, its format in SOLID_STOCK
    "board:CHENE_MASSIF:20": entry(ht(29.9), "u", "Brico Dépôt, planche rabotée chêne massif 2000 x 140 x 20, "
                                   + "réf. 3663602861539, 29,90 EUR TTC la pièce", "2026-10-08"),

    "edge:W1000_ST9": entry(ht(1.77), "m", `${JHS}, chant ABS Egger W1000 ST9 23 x 0,8 à 1,77 EUR TTC/m`),
    "edge:H1180_ST37": entry(ht(2.11), "m", `${JHS}, chant ABS Egger H1180 ST37 23 x 0,8 à 2,11 EUR TTC/m`),
    "edge:U604_ST9": entry(ht(1.77), "m", `${JHS}, chant ABS Egger U604 ST9 23 x 0,8 à 1,77 EUR TTC/m, en réassort`),
    "edge:CHENE_PLAQUE": OAK_EDGE,
    "edge:CHENE_PLAQUE_AGGLO": OAK_EDGE,

    "hw:71B3550": entry(fromGbp(2.42), "u", "Interfit (UK), 2,42 GBP HT la charnière"),
    "hw:173H7100": entry(fromGbp(0.42), "u", "Interfit (UK), 0,42 GBP HT l'embase"),
    "hw:174H7100E": entry(fromGbp(0.57), "u", "Interfit (UK), 0,57 GBP HT l'embase nickelée", "2026-10-03"),
    "hw:760H4800S": entry(fromGbp(25.92), "u", "Interfit (UK), 25,92 GBP HT la paire"),
    "hw:71B3650": entry(fromGbp(2.70), "u", "Interfit (UK), 2,70 GBP HT la charnière, lu le 2 octobre"),
    "hw:760H3800S": entry(fromGbp(25.36), "u", "Interfit (UK), 25,36 GBP HT la paire, lu le 2 octobre"),
    "hw:70T3550.TL": entry(fromGbp(1.33), "u", "Interfit (UK), 1,33 GBP HT la charnière sans ressort", READ_ON_2),
    "hw:70T3650.TL": entry(fromGbp(1.61), "u", "Interfit (UK), 1,61 GBP HT la charnière sans ressort", READ_ON_2),
    // sold as a set with its strike plaet, black or white at the same price
    "hw:956.1004": entry(fromGbp(3.60), "u", "Interfit (UK), 3,60 GBP HT le jeu 956.1004 B.SET avec contreplaque",   
                         READ_ON_2),
    "hw:956A1004": entry(fromGbp(4.51), "u", "Interfit (UK), 4,51 GBP HT le jeu 956A1004 W.SET avec contreplaque",
                         READ_ON_2),
    "hw:956.1201": entry(fromGbp(0.80), "u", "Interfit (UK), 0,80 GBP HT l'embase 956.1201 G grise", "2026-10-03"),
    "hw:T51.7601": entry(fromGbp(3.28), "u", "Interfit (UK), 3,28 GBP HT la paire gauche et droite"),
    "hw:48N0510.02": entry(fromGbp(1.14), "u", "Interfit (UK), 1,14 GBP HT la ferrure"),
    "hw:48N0510.03": entry(fromGbp(1.14), "u", "Interfit (UK), 1,14 GBP HT la ferrure"),
    "hw:609.1500": entry(fromGbp(2.66 / 100), "u", "Interfit (UK), 2,66 GBP HT le sachet de 100", READ_ON, 100),
    "hw:637.76.352": entry(fromGbp(0.99), "u", "Interfit (UK), pied AXILO 80 mm à 0,99 GBP HT"),
    // no public price in France nor the UK : Polish zloty at the ECB rate of 7 October 2026, 4.3825
    "hw:637.76.353": entry(Math.round(2.1 / 4.3825 * 1000) / 1000, "u",
                           "Intar (Pologne), pied AXILO 100 mm à 2,10 zł HT, "
                           + "réf. TAMNS-403425, livraison en France non vérifiée", "2026-10-07"),
    "hw:283.33.910": entry(fromGbp(2.68 / 1.2), "u", "Swansea Timber (UK), 2,68 GBP TTC la fixation, en stock",
                           READ_ON_2),
    // sold one by one in Spain : the 21 % of the Spanish VAT comes off, not the French 20
    "hw:637.76.333": entry(Math.round(0.67 / 1.21 * 1000) / 1000, "u",
                           "Monastil (Espagne), 0,67 EUR TTC l'embase avec 21 % de TVA, en stock", READ_ON_2),

    "hw:262.25.035": entry(fromUsd(0.35), "u", "Home Decor Hardware (US), 0,35 USD HT le boîtier"),
    "hw:267.07.902": entry(fromUsd(0.76), "u", "Home Decor Hardware (US), 0,76 USD HT la vis de liaison", "2026-10-03"),
    "hw:267.07.903": entry(fromUsd(0.87), "u", "Home Decor Hardware (US), 0,87 USD HT la vis de liaison", "2026-10-03"),
    "hw:262.28.020": entry(fromUsd(0.44), "u", "Home Decor Hardware (US), 0,44 USD HT le 262.28.026, "
                           + "même goujon B34 brut"),
    "hw:282.24.727": entry(fromUsd(0.22), "u", "Home Decor Hardware (US), 0,22 USD HT le taquet"),
    "hw:637.38.054": entry(fromUsd(0.77), "u", "Home Decor Hardware (US), 0,77 USD HT le clip"),
    // the list price, the 20 % off shown on 2 October left out
    ...handlePrices([["100.45.120", 1.5], ["100.45.121", 1.57], ["100.45.122", 1.73], ["100.45.123", 1.97],
                     ["100.45.124", 2.25], ["100.45.125", 2.41], ["100.45.126", 2.76], ["100.45.127", 2.91],
                     ["100.45.128", 3.15]]),

    // generic LED parts read at Ledkia, one of each per lit cell : a 2 m profile, a 5 m reel, one lead
    "hw:LED_PROFILE_RECESS": entry(ht(6.99), "u", "Estimation : Ledkia, profilé encastré Lithos H12 2 m avec diffuseur "
                                  + "à 6,99 EUR TTC, son corps à vérifier contre la rainure 18 x 8,5", READ_ON_2),
    "hw:LED_STRIP_24V": entry(ht(6.49), "u", "Ledkia, ruban 24 V 8 mm coupe 5 cm, 12 W/m, bobine de 5 m à 6,49 EUR TTC",
                              READ_ON_2),
    "hw:LED_LEAD": entry(ht(1.11), "u", "Ledkia, connecteur câblé pour ruban 8 mm à 1,11 EUR TTC", READ_ON_2),
    "hw:LED_DRIVER_24V": entry(ht(7.49), "u", "Ledkia, alimentation 24 V 60 W 2,5 A à 7,49 EUR TTC hors remise",
                               READ_ON_2),
    "hw:SHELLY_PLUS_RGBW_PM": entry(ht(28.49), "u", "Alternate, Shelly Plus RGBW PM à 28,49 EUR TTC, momentanément "
                                    + "indisponible", READ_ON_2),
    "hw:ANTI_TIP_BRACKET": entry(ht(1.59), "u", "Brico Dépôt, équerre d'assemblage 40 x 40 x 40 à 1,59 EUR TTC"),
    "hw:DOWEL_8x35": entry(ht(4.99 / 100), "u", "Brico Dépôt, 100 tourillons hêtre 8 x 40 à 4,99 TTC, 8 x 35 non vendu",  
                           READ_ON, 100),
    "hw:PLUG_NYLON_8x40": entry(ht(1.89 / 20), "u", "Brico Dépôt, lot de 20 chevilles nylon 8 x 40 à 1,89 EUR TTC",
                                READ_ON, 20),
    "hw:SCREW_4x16": entry(ht(8.09 / 200), "u", "Brico Dépôt, boîte de 200 vis fischer 4 x 16 à 8,09 EUR TTC", READ_ON,
                           200),
    "hw:SCREW_4x30": entry(ht(13.5 / 300), "u", "Brico Dépôt, boîte de 300 vis fischer PowerFast II 4 x 30 à 13,50 EUR TTC",
                           "2026-10-03", 300),
    "hw:WALL_SCREW_5x50": entry(ht(34.9 / 500), "u", "Brico Dépôt, boîte de 500 vis fischer 5 x 50 à 34,90 EUR TTC",
                                READ_ON, 500),

    // no workshop seen publishes its sawing and banding apart from the board : Houdard, SM Bois, Leroy Merlin
    // Design ADF, Fouchard, tosize and Mauris quote them or fold them into a price per m2
    // TODO a merchant's own scale, or a quote from the cabinet maker, should replace this one
    "service:cut": entry(4, "u", "Indicatif, source non vérifiée : usinage.services, 4 EUR le trait de scie compté "
                         + "une fois par pièce, HT ou TTC non précisé", READ_ON_2),
    "service:print": entry(ht(29.9), "m2", "DimensionShop, papier peint intissé 225 g/m² pré-encollé imprimé sur "
                           + "mesure à 29,90 EUR TTC le m², 1 m² facturé au moins, port offert dès 100 EUR", READ_ON_2),
    "service:edging": entry(5, "m", "Indicatif, source non vérifiée : usinage.services, collage de chant à 5 EUR le "
                            + "mètre, HT ou TTC non précisé", READ_ON_2),
};

// Left unpriced, never counted as zero : W1000 in 8 and 16 mm priced only by store at Gedimat, flexible MDF out
// of stock or unreadable
