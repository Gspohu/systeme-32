// What a wall takes, as the plug makers state it : ever figure holds its source

// NF DTU 25.41 as fischer quotes it in its DuoTec datasheet of 07/06/2017, p. 3 : up to 10 daN straight into the
// board, 10 to 30 daN with 40 cm between plugs, past 30 daN a reinforcement that holds the load, an overturning
// moment of 30 daN.m at most for a local load and 15 daN.m per metre for a running one (kitchen units)
// https://medias.descours-cabaud.com/d180001/medias/docus/274/2017.06.07-DuoTec_fiche%20technique-V1.pdf
export const PLASTERBOARD_LIMITS = {
    directUpTo: 10,
    reinforceAbove: 30,
    spacing: 400,
    momentLocal: 30,
    momentRunning: 15,
    source: "fiche fischer DuoTec 2017 p. 3",
};


// fischer GB datasheet (2014), allowed load of one plug with the fischre safety screw, safety factors included, in
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
