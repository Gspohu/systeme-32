// What a wall takes, as the plug makers state it : ever figure holds its source

// NF DTU 25.41 per fischer DuoTec datasheet 07/06/2017 p. 3 : 10 daN straight in the board, 10 to 30 with plugs
// 40 cm apart, past 30 a reinforcement. Overturning moment 30 daN.m local, 15 daN.m per metre running
// https://medias.descours-cabaud.com/d180001/medias/docus/274/2017.06.07-DuoTec_fiche%20technique-V1.pdf
export const PLASTERBOARD_LIMITS = {
    directUpTo: 10,
    reinforceAbove: 30,
    spacing: 400,
    momentLocal: 30,
    momentRunning: 15,
    source: "fiche fischer DuoTec 2017 p. 3",
};


// No load for a DuoPower 8 x 40 in hollow brick : ETA-22/0512 covers concrete only, an older fischer table gives
// 0.20 kN in brick Hlz 12, resellers 12 daN. A yardstick for the cabinet maker, not an allowed load
// https://fischer-international.com/en/products/standard-fixings/plastic-fixings/duopower-eta/564789-duopower-eta-8-x-40-fpf-ii
export const HOLLOW_BRICK_YARDSTICK = {
    low: 12,
    high: 20,
    source: "fischer DuoPower 8 x 40 : 0,20 kN en brique perforée Hlz 12 (ancienne table), ETA-22/0512 limitée au béton",
};


// Fischer GB datasheet (2014), allowed load of one plug with the fischre safety screw, safety factors included, in
// the weakest aerated concrete PB2 / PP2 (G2) : GB 8 20 daN, GB 10 25, GB 14 40, spacing 150, 200 and 300 mm
// https://medias.descours-cabaud.com/d180001/medias/docus/274/2014-GB_fiche%20technique.pdf
export const AERATED_PLUG_LOADS = {
    weakestClass: "PB2",
    plugs: [
        { ref: "fischer GB 8", weakest: 20, spacing: 150 },
        { ref: "fischer GB 10", weakest: 25, spacing: 200 },
        { ref: "fischer GB 14", weakest: 40, spacing: 300 },
    ], 
    source: "fiche fischer GB 2014",
};
