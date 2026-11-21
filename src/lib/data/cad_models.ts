// The maker's CAD file of each article the export places, or what stands in for it when none exists

import type { ScrewSpec } from "./screws";

export interface CadModel
{
    ref: string;
    label: string;
    // Under the folder of the sources, absent for what the build draws itself
    file?: string;
    rgb: [number, number, number];
    // Drawn by the build when no maker's file exists : a section in the xy plane padded along z, or a cylinder
    draw?: { section: [number, number][]; length: number } | { cylinder: [number, number] };
    // Where the axes and the origin of a file drawn in its own frame go in the frame of the model it stands for
    frame?: { x: [number, number, number]; y: [number, number, number]; z: [number, number, number];
              o: [number, number, number] };
    // What holds it once set : the gamme screws or tightens it right then, a test checks it does
    fixing?: Fixing;
    // Set under what it goes on, the coupling under a drawer : the drawer is turned over for it and its screws
    fromBelow?: boolean;
    // The card of FreeCAD's own material library the build gives a body it draws, by its name, and why that one
    card?: LibraryCard;
}

export interface LibraryCard
{
    name: string;
    why: string;
}

// The screws it's held by, by the start of their label, placed by the export in the frame of the file when it gives
// their holes. Or what's tightened in it : its own screws as soon as it's set, its cam once the board of its bolt is in
export interface Fixing
{
    // elsewhere : its screws go into another board than the one it's named on, an AXILO base into the bottom. at is the
    // top of each head, spec the screw when it's no 3.5 x 15 countersunk, free the way through the article
    screws?: { label: string; at?: [number, number, number][]; away?: [number, number, number]; elsewhere?: boolean;
               spec?: ScrewSpec; free?: number };
    // At : the top of the head of each screw tightened, in the frame of the file, away the way the tool comes out
    tighten?: { operation: string; tool: "pozidriv2"; once: "set" | "mate"; at?: [number, number, number][];
                away?: [number, number, number] };
    source: string;
}

// The T51.7601 comes without screws : 606N at 75 degrees into the front, pre-bored with the T65.1600.01 template
// through 2 slots of Ø4 23 apart in a lip of 2. The 606N, a #6 flat head of ASME B18.6.1 drawn 6.64 at 82 degrees
// and 1.81 high, set back on its axis till it came free of the plastic
const COUPLING_SOURCE = "Notice Blum MOVENTO LIT.MOV5000.09.16 p. 2 (vis 606N à 75°, gabarit T65.1600.01) ; "
    + "fiche Würth B606N-100 (#6 x 5/8\", fraisée, tête Ø6,5) ; fichier STEP Blum T51.7601 (2 oblongs Ø4, entraxe 23)";
const COUPLING_TILT = 15 * Math.PI / 180;
const COUPLING_AWAY: [number, number, number] = [0, -Math.sin(COUPLING_TILT), -Math.cos(COUPLING_TILT)];
const COUPLING_HEAD: [number, number] = [-19.527, 32.42];
const COUPLING_SCREW: ScrewSpec = { kind: "countersunk", diameter: 3.5, length: 16, standard: "ASMEB18.6.1.3",
                                    size: "#6", head: 6.64, headHeight: 1.81 };
// Each hand its own : one row for the 4 screws of a drawer screwed the right coupling before it was set
const couplingScrews = (hand: string): string => { return `Accouplement MOVENTO ${hand} : vis 3,5 x 16 606N`; };
const couplingFixing = (hand: string, xs: number[]): Fixing =>
{
    return { screws: { label: couplingScrews(hand), at: xs.map((x) => { return [x, ...COUPLING_HEAD]; }),
                       away: COUPLING_AWAY, spec: COUPLING_SCREW, free: 4.74 }, source: COUPLING_SOURCE };
};

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

// Each runner screwed to its side with 609.1500 chipboard screws (Blum KA-150 p. 430), placed by drawers.ts
const runnerFixing = (ref: string, hand: string): Fixing =>
{
    return { screws: { label: `Coulisse ${ref} ${hand}` }, source: "Blum KA-150 p. 430, vis 609.1500" };
};
// The cup of a CLIP top screwed into the door, its 2 screws placed by the export (cad_hardware.ts, cupScrews)
const CUP_FIXING: Fixing = { screws: { label: "Cuvette de charnière" },
                            source: "Blum CLIP top à visser, 2 vis par cuvette" };
// Pressed into its 2 bores of 5, then its screws turned to spread the split dowels they come in, with the Pozidriv 2
// sellers bundle with these plates (Blum's sheet not read). Its 2 screws 32 apart on the line of the system holes
// their heads 11.1 off the face
const EXPANDO_FIXING: Fixing = { tighten: { operation: "Serrer les vis EXPANDO de chaque embase, elles écartent leurs chevilles",
                                            tool: "pozidriv2", once: "set", at: [[11.1, 16, 0], [11.1, -16, 0]],
                                            away: [1, 0, 0] },
                                 source: "Blum HIO174H7100E, vis prémontées en chevilles fendues, trous Ø5" };
// Its cam turned once the bolt of the other board sits in it : it pulls the 2 boards together. Häfele 262.26.535 takes a
// PZ2, a flat blade or a hex key of 4
const MINIFIX_FIXING: Fixing = { tighten: { operation: "Serrer le boîtier Minifix, il tire le panneau du goujon",
                                            tool: "pozidriv2", once: "mate" },
                                 source: "Häfele 262.26.535, empreinte PZ2, fente ou six pans 4" };

export const CAD_MODELS: Record<string, CadModel> = {
    "760H3800S.left": { ref: "760H3800S", label: "Coulisse MOVENTO NL 380, gauche",
                       file: `${BLUM}/760H3800S_45134399.step`, rgb: STEEL, fixing: runnerFixing("760H3800S",
                           "gauche") },
    "760H3800S.right": { ref: "760H3800S", label: "Coulisse MOVENTO NL 380, droite",
                        file: `${BLUM}/760H3800S_45359220.step`, rgb: STEEL, fixing: runnerFixing("760H3800S",
                            "droite") },
    // Told apart by their geometry, the same as the 380 ones of each hand, 100 longer
    // The pull-out behind the drop-down flap of the dresser, its left one positive along x as the 480 one
    "760H4500S.left": { ref: "760H4500S", label: "Coulisse MOVENTO NL 450, gauche",
                       file: `${BLUM}/760H4500S_46204387.step`, rgb: STEEL, fixing: runnerFixing("760H4500S",
                           "gauche") },
    "760H4500S.right": { ref: "760H4500S", label: "Coulisse MOVENTO NL 450, droite",
                        file: `${BLUM}/760H4500S_46581677.step`, rgb: STEEL, fixing: runnerFixing("760H4500S",
                            "droite") },
    // The pull-out once set back behind the gas stays, its left one positive along x as the 450 one, 30 shorter
    "760H4200S.left": { ref: "760H4200S", label: "Coulisse MOVENTO NL 420, gauche",
                       file: `${BLUM}/760H4200S_41524174.step`, rgb: STEEL, fixing: runnerFixing("760H4200S",
                           "gauche") },
    "760H4200S.right": { ref: "760H4200S", label: "Coulisse MOVENTO NL 420, droite",
                        file: `${BLUM}/760H4200S_42183110.step`, rgb: STEEL, fixing: runnerFixing("760H4200S",
                            "droite") },
    "760H4800S.left":{ ref: "760H4800S", label: "Coulisse MOVENTO NL 480, gauche",
                      file: `${BLUM}/760H4800S_42061081.step`, rgb: STEEL, fixing: runnerFixing("760H4800S", "gauche") },
    "760H4800S.right": { ref: "760H4800S", label: "Coulisse MOVENTO NL 480, droite",
                        file: `${BLUM}/760H4800S_42306320.step`, rgb: STEEL, fixing: runnerFixing("760H4800S",
                            "droite") },
    // Their x starts 21 off the side a runner of the same hand starts from, in the frame of that runner
    "T51.7601.left": { ref: "T51.7601", label: "Accouplement MOVENTO, gauche", file: `${BLUM}/T51.7601_46166126.step`,
                      rgb: [209, 84, 8], fromBelow: true, fixing: couplingFixing("gauche", [45.5, 68.5]) },
    "T51.7601.right": { ref: "T51.7601", label: "Accouplement MOVENTO, droit", file: `${BLUM}/T51.7601_43107713.step`,
                       rgb: [209, 84, 8], fromBelow: true, fixing: couplingFixing("droit", [-45, -68]) },
    "70T3550.TL": { ref: "70T3550.TL", label: "Charnière CLIP top 110°", file: `${BLUM}/70T3550.TL_47173013.step`,
                   rgb: NICKEL, fixing: CUP_FIXING },
    // The damped one of a door opened by a pull, Häfele 342.42.600 closed. Its file holds the cup round its centre :
    // the Ø35 of the cup, y -10.2 to 0 there, and z 38.5 to 48.7 in the 70T3550.TL, give X = -x, Y = -z, Z = 38.5 - y
    // the arm then lying on that of the 70T within a millimetre
    "71B3550": { ref: "71B3550", label: "Charnière CLIP top BLUMOTION 110°", file: `${HAFELE}/342_42_600_1.stp`,
                rgb: NICKEL, frame: { x: [-1, 0, 0], y: [0, 0, -1], z: [0, -1, 0], o: [0, 0,
                    38.5] }, fixing: CUP_FIXING },
    // Twin doors on one upright, each overlaying half of it : its crank sets the door 9.5 further in
    "70T3650.TL": { ref: "70T3650.TL", label: "Charnière CLIP top 110°, portes jumelées",
                   file: `${BLUM}/70T3650.TL_48583334.step`,
                    rgb: NICKEL, fixing: CUP_FIXING },
    "174H7100E": { ref: "174H7100E", label: "Embase en croix EXPANDO, NI", file: `${BLUM}/174H7100E_47382329.step`,
                  rgb: NICKEL, fixing: EXPANDO_FIXING },
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
                       file: `${BLUM}/956.1201_40223089.step`, rgb: CARBON,
                       fixing: { screws: { label: "Embase TIP-ON 956.1201 : vis" }, source: "Blum KA-150 p. 173" } },
    "262.26.535": { ref: "262.26.535", label: "Boîtier Minifix 15 sans bord", file: `${HAFELE}/262_26_535_1.stp`,
                   rgb: NICKEL, fixing: MINIFIX_FIXING },
    "262.28.020": { ref: "262.28.020", label: "Goujon Minifix S100", file: `${HAFELE}/262_28_020_3.stp`, rgb: STEEL },
    // One reference, the screw and its knurled sleeve : its other 2 files sell them apart
    // The sleeve pushed in from one side, the screw driven into it from the other : one solid with a rim at each end
    // went through no hole. Häfele's file cut in its 2 solids, the frame kept (267_07_903.stp, solids 1 and 0)
    "267.07.903.sleeve": { ref: "267.07.903", label: "Vis de liaison, manchon", file: `${HAFELE}/267_07_903_manchon.stp`,
                          rgb: ZINC },
    "267.07.903.screw": { ref: "267.07.903", label: "Vis de liaison, vis", file: `${HAFELE}/267_07_903_vis.stp`,
                         rgb: ZINC },
    "282.24.727": { ref: "282.24.727", label: "Taquet à ergot", file: `${HAFELE}/282_24_727_4.stp`, rgb: NICKEL },
    "283.33.910": { ref: "283.33.910", label: "Fixation invisible d'étagère", file: `${HAFELE}/283_33_910_5.stp`,
                   rgb: STEEL },
    "637.76.353": { ref: "637.76.353", label: "Pied AXILO H100", file: `${HAFELE}/637_76_353_6.stp`, rgb: CARBON },
    "637.76.333": { ref: "637.76.333", label: "Embase AXILO à visser", file: `${HAFELE}/637_76_333_1.stp`, rgb: CARBON,
                   fixing: { screws: { label: "Embase AXILO 637.76.333, vis", elsewhere: true },
                             source: "Häfele AXILO, embase à visser" } },
    // Its STEP shut, split in its 2 halves to set the flap one by the hinge's settings (drop_flaps.ts) : the body in the
    // floor, and the body in the flap with its setting screw and its arm (342_78_700_1.stp, solids 2 and 0 1 3)
    "342.78.700.floor": { ref: "342.78.700", label: "Charnière d'abattant, côté meuble",
                         file: `${HAFELE}/step/342_78_700_1_meuble.stp`, rgb: NICKEL },
    "342.78.700.flap": { ref: "342.78.700", label: "Charnière d'abattant, côté abattant",
                        file: `${HAFELE}/step/342_78_700_1_abattant.stp`, rgb: NICKEL },
    // Its STEP gives the strut as an open shell crossing itself : rebuilt in sound solids by scripts/gas_stay_step.py
    // each framed on its joint. Rod and body : origin at the socket, z along the stay. Brackets : origin at the ball
    "365.01.901.rod": { ref: "365.01.901", label: "Compas 365.01.901, vérin, tige",
                       file: `${HAFELE}/step/365_01_901_tige.step`, rgb: STEEL },
    "365.01.901.body": { ref: "365.01.901", label: "Compas 365.01.901, vérin, corps",
                        file: `${HAFELE}/step/365_01_901_corps.step`, rgb: STEEL },
    "365.01.901.cabinet": { ref: "365.01.901", label: "Compas 365.01.901, équerre de corps",
                           file: `${HAFELE}/step/365_01_901_equerre_corps.step`, rgb: ZINC },
    "365.01.901.flap": { ref: "365.01.901", label: "Compas 365.01.901, équerre d'abattant",
                        file: `${HAFELE}/step/365_01_901_equerre_abattant.step`, rgb: ZINC },
    "637.38.054": { ref: "637.38.054", label: "Clip de plinthe AXILO", file: `${HAFELE}/637_38_054_2.stp`,
                   rgb: [235, 235, 230],
                   fixing: { screws: { label: "Clip de plinthe : vis" },
                            source: "Häfele AXILO, clip vissé sur la plinthe" } },
    "ANTI_TIP_BRACKET": { ref: "ANTI_TIP_BRACKET", label: "Équerre 40 x 40 x 40", rgb: ZINC,
                          card: { name: "Steel-Generic", why: "équerre en acier galvanisé de la liste de quincaillerie, "
                                  + "nuance non donnée" } },
    "DOWEL_8x35": { ref: "DOWEL_8x35", label: "Tourillon 8 x 35", rgb: BEECH,
                    card: { name: "Wood-Generic", why: "tourillon en hêtre de la liste de quincaillerie, "
                            + "fiche bois générique de FreeCAD" } },
    // The DuoPower of the hardware list, Ø8 x 40 : the cabinet maker may choose another fixing from the load on the
    // plans
    "PLUG_DUOPOWER_8x40": { ref: "PLUG_DUOPOWER_8x40", label: "Cheville fischer DuoPower 8 x 40", rgb: [120, 120, 120],
                            draw: { cylinder: [4, 40] },
                            card: { name: "PA6-Generic",
                                   why: "fischer : corps porteur gris en nylon, ailettes rouges en "
                                    + "polypropylène, la fiche est celle du nylon" } },
    // The nylon plug of a solid wall, Ø8 x 40 as listed
    "PLUG_NYLON_8x40": { ref: "PLUG_NYLON_8x40", label: "Cheville nylon 8 x 40", rgb: [235, 235, 230],
                        draw: { cylinder: [4, 40] },
                        card: { name: "PA6-Generic", why: "cheville en nylon de la liste de quincaillerie" } },
    "84335807": { ref: "84335807", label: "Poignée Oslo", rgb: ALUMINIUM_BRASS,
                 fixing: { screws: { label: "Vis Ø4 x 16 fraisée de la poignée Oslo" },
                          source: "vis fournies avec la poignée" },
                 card: { name: "Aluminum-Generic", why: "poignée en aluminium d'après la fiche Leroy Merlin, alliage "
                         + "non publié" } },
};
