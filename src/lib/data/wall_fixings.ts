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


// Fischer DuoPower datasheet (June 2020), art. 555008, wood screw of 5 : 25 daN recommended in a hollow brick
// Hlz 12, safety factor included, one plug in the brick, not the joint. A german brick, this wall never probed :
// a yardstick for the cabinet maker, not an allowed load
// https://fiproductmedia.azureedge.net/media/Certification%20Documents/Technical%20Datasheets/fischer/TDB_01_DUOPOWER-HD-FR.pdf
export const HOLLOW_BRICK_YARDSTICK = {
    load: 25,
    source: "fischer DuoPower 8 x 40 (555008) en brique creuse Hlz 12, charge recommandée de la fiche technique 2020",
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
