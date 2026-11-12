// The maker's CAD file of each article the export places, or what stands in for it when none exists

export interface CadModel
{
    ref: string;
    label: string;
    // Under the folder of the sources, absent for what the build draws itself
    file?: string;
    rgb: [number, number, number];
    // Drawn by the build when no maker's file exists : a section in the xy plane padded along z, or a cylinder
    draw?: { section: [number, number][]; length: number } | { cylinder: [number, number] };
}

// Blum Product Database, STEP "medium" level : its "low" one fills the parts in, 12 % more volume on the runner
const BLUM = "blum/step";
const HAFELE = "hafele";
const NICKEL: [number, number, number] = [224, 222, 214];
const CARBON: [number, number, number] = [41, 41, 41];
export const STEEL: [number, number, number] = [150, 152, 158];
export const ZINC: [number, number, number] = [192, 192, 192];
// The dark oak of the 3D view would hide them, a beech dowel is pale
const BEECH: [number, number, number] = [219, 190, 150];
const ALUMINIUM_BRASS: [number, number, number] = [176, 150, 96];

export const CAD_MODELS: Record<string, CadModel> = {
    "760H3800S.left": { ref: "760H3800S", label: "Coulisse MOVENTO NL 380, gauche",
                       file: `${BLUM}/760H3800S_45134399.step`, rgb: STEEL },
    "760H3800S.right": { ref: "760H3800S", label: "Coulisse MOVENTO NL 380, droite",
                        file: `${BLUM}/760H3800S_45359220.step`, rgb: STEEL },
    // Told apart by their geometry, the same as the 380 ones of each hand, 100 longer
    // The pull-out behind the drop-down flap of the dresser, its left one positive along x as the 480 one
    "760H4500S.left": { ref: "760H4500S", label: "Coulisse MOVENTO NL 450, gauche",
                       file: `${BLUM}/760H4500S_46204387.step`, rgb: STEEL },
    "760H4500S.right": { ref: "760H4500S", label: "Coulisse MOVENTO NL 450, droite",
                        file: `${BLUM}/760H4500S_46581677.step`, rgb: STEEL },
    // The pull-out once set back behind the gas stays, its left one positive along x as the 450 one, 30 shorter
    "760H4200S.left": { ref: "760H4200S", label: "Coulisse MOVENTO NL 420, gauche",
                       file: `${BLUM}/760H4200S_41524174.step`, rgb: STEEL },
    "760H4200S.right": { ref: "760H4200S", label: "Coulisse MOVENTO NL 420, droite",
                        file: `${BLUM}/760H4200S_42183110.step`, rgb: STEEL },
    "760H4800S.left":{ ref: "760H4800S", label: "Coulisse MOVENTO NL 480, gauche",
                      file: `${BLUM}/760H4800S_42061081.step`, rgb: STEEL },
    "760H4800S.right": { ref: "760H4800S", label: "Coulisse MOVENTO NL 480, droite",
                        file: `${BLUM}/760H4800S_42306320.step`, rgb: STEEL },
    // Their x starts 21 off the side a runner of the same hand starts from, in the frame of that runner
    "T51.7601.left": { ref: "T51.7601", label: "Accouplement MOVENTO, gauche", file: `${BLUM}/T51.7601_46166126.step`,
                      rgb: [209, 84, 8] },
    "T51.7601.right": { ref: "T51.7601", label: "Accouplement MOVENTO, droit", file: `${BLUM}/T51.7601_43107713.step`,
                       rgb: [209, 84, 8] },
    "70T3550.TL": { ref: "70T3550.TL", label: "Charnière CLIP top 110°", file: `${BLUM}/70T3550.TL_47173013.step`,
                   rgb: NICKEL },
    // Twin doors on one upright, each overlaying half of it : its crank sets the door 9.5 further in
    "70T3650.TL": { ref: "70T3650.TL", label: "Charnière CLIP top 110°, portes jumelées",
                   file: `${BLUM}/70T3650.TL_48583334.step`,
                    rgb: NICKEL },
    "174H7100E": { ref: "174H7100E", label: "Embase en croix EXPANDO, NI", file: `${BLUM}/174H7100E_47382329.step`,
                  rgb: NICKEL },
    "956.1004": { ref: "956.1004", label: "TIP-ON version courte, CS", file: `${BLUM}/956.1004_45353099.step`,
                 rgb: CARBON },
    // The long version, its black told by the colour of the file, the same catch plate as the short one
    "956A1004": { ref: "956A1004", label: "TIP-ON version longue, CS", file: `${BLUM}/956A1004_44232195.step`,
                 rgb: CARBON },
    "956A1004.catch": { ref: "956A1004", label: "Contreplaque TIP-ON à coller", file: `${BLUM}/956A1004_41231315.step`,
                       rgb: ZINC },
    "956.1004.catch": { ref: "956.1004", label: "Contreplaque TIP-ON à coller", file: `${BLUM}/956.1004_41231315.step`,
                       rgb: ZINC },
    "956.1201.box": { ref: "956.1201", label: "Embase droite TIP-ON, boîtier, CS",
                     file: `${BLUM}/956.1201_48948575.step`, rgb: CARBON },
    // Only the grey file of the reference holds this plate : the same plate under the black case the order asks for
    "956.1201.plate": { ref: "956.1201", label: "Embase droite TIP-ON, plaque, CS",
                       file: `${BLUM}/956.1201_40223089.step`, rgb: CARBON },
    "262.26.535": { ref: "262.26.535", label: "Boîtier Minifix 15 sans bord", file: `${HAFELE}/262_26_535_1.stp`,
                   rgb: NICKEL },
    "262.28.020": { ref: "262.28.020", label: "Goujon Minifix S100", file: `${HAFELE}/262_28_020_3.stp`, rgb: STEEL },
    // One reference, the screw and its knurled sleeve : its other 2 files sell them apart
    "267.07.903": { ref: "267.07.903", label: "Vis de liaison et son manchon", file: `${HAFELE}/267_07_903.stp`,
                   rgb: ZINC },
    "282.24.727": { ref: "282.24.727", label: "Taquet à ergot", file: `${HAFELE}/282_24_727_4.stp`, rgb: NICKEL },
    "283.33.910": { ref: "283.33.910", label: "Fixation invisible d'étagère", file: `${HAFELE}/283_33_910_5.stp`,
                   rgb: STEEL },
    "637.76.353": { ref: "637.76.353", label: "Pied AXILO H100", file: `${HAFELE}/637_76_353_6.stp`, rgb: CARBON },
    "637.76.333": { ref: "637.76.333", label: "Embase AXILO à visser", file: `${HAFELE}/637_76_333_1.stp`, rgb: CARBON },
    // Its STEP shut, split in its 2 halves to set the flap one by the hinge's settings (drop_flaps.ts) : the body in the
    // floor, and the body in the flap with its setting screw and its arm (342_78_700_1.stp, solids 2 and 0 1 3)
    "342.78.700.floor": { ref: "342.78.700", label: "Charnière d'abattant, côté meuble",
                         file: `${HAFELE}/step/342_78_700_1_meuble.stp`, rgb: NICKEL },
    "342.78.700.flap": { ref: "342.78.700", label: "Charnière d'abattant, côté abattant",
                        file: `${HAFELE}/step/342_78_700_1_abattant.stp`, rgb: NICKEL },
    "637.38.054": { ref: "637.38.054", label: "Clip de plinthe AXILO", file: `${HAFELE}/637_38_054_2.stp`,
                   rgb: [235, 235, 230] },
    "ANTI_TIP_BRACKET": { ref: "ANTI_TIP_BRACKET", label: "Équerre 40 x 40 x 40", rgb: ZINC },
    "DOWEL_8x35": { ref: "DOWEL_8x35", label: "Tourillon 8 x 35", rgb: BEECH },
    // The DuoPower of the hardware list, Ø8 x 40 : the cabinet maker may choose another fixing from the load on the
    // plans
    "PLUG_DUOPOWER_8x40": { ref: "PLUG_DUOPOWER_8x40", label: "Cheville fischer DuoPower 8 x 40", rgb: [120, 120, 120],
                            draw: { cylinder: [4, 40] } },
    // The nylon plug of a solid wall, Ø8 x 40 as listed
    "PLUG_NYLON_8x40": { ref: "PLUG_NYLON_8x40", label: "Cheville nylon 8 x 40", rgb: [235, 235, 230],
                        draw: { cylinder: [4, 40] } },
    "84335807": { ref: "84335807", label: "Poignée Oslo", rgb: ALUMINIUM_BRASS },
};
