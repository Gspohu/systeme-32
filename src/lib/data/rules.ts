// Manufacturer geometry and regulatory limits, one source per block

// Blum KA-150 p. 73 : hinges per door, for a door width FB of 600 mm (read on the chart, axis calibrated)
export const HINGE_CHART = [
    { hinges: 2, maxHeight: 750, maxKg: 6 },
    { hinges: 3, maxHeight: 1500, maxKg: 12 },
    { hinges: 4, maxHeight: 2100, maxKg: 17 },
    { hinges: 5, maxHeight: 2500, maxKg: 22 },
];
export const HINGE_CHART_WIDTH = 600;

// Blum KA-150 p. 75 : cup boring
export const CUP_DIAMETER = 35;
export const CUP_DEPTH = 13;
export const TB_MIN = 3;
export const TB_MAX = 7; 
// Front overlay FA = TB + X - MD : X = 11 full overlay (71B3550), 1.5 twin (71B3650)
export const OVERLAY_X_FULL = 11;
export const OVERLAY_X_TWIN = 1.5;
// Inset door (71B3750) : plate shifted inward by FD + 1.5
export const INSET_PLATE_SHIFT = 1.5;
// Plates on the system 32 line
export const PLATE_LINE = 37;
// Blum KA-150 p. 146 : 174H7100E, its EXPANDO dowels in two Ø5 holes 32 apart about the hinge axis, side 11.5 min
export const EXPANDO_PLATE = { ref: "174H7100E", hole: 5, pitch: 32, minSide: 11.5 };
export const MAX_DOOR_THICKNESS = 26;
// Blum KA-150 p. 74 : how far each hinge hung on the doors opens, BLUMOTION and TIP-ON alike
export const HINGE_OPENING_DEG: Record<string, number> = {
    "71B3550": 110, "71B3650": 110, "71B3750": 110,
    "70T3550.TL": 110, "70T3650.TL": 110, "70T3750.TL": 110,
};


// Blum KA-150 p. 75 : minimum gap F for fronts with R = 1 mm edges, rows TB 3..7, columns FD
export const MIN_GAP_FD = [16, 18, 19, 20, 21, 22, 23, 24, 25, 26];
export const MIN_GAP: Record<number, number[]> = {
    3: [0.5, 0.8, 1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.5, 4.3],
    4: [0.5, 0.8, 1.0, 1.2, 1.4, 1.7, 2.0, 2.5, 3.1, 3.8],
    5: [0.5, 0.8, 0.9, 1.2, 1.4, 1.7, 2.0, 2.4, 2.9, 3.4],
    6: [0.5, 0.8, 0.9, 1.2, 1.3, 1.6, 1.9, 2.3, 2.7, 3.2],
    7: [0.5, 0.8, 0.9, 1.1, 1.3, 1.6, 1.9, 2.2, 2.6, 3.0],
};


// Blum KA-150 p. 172 : TIP-ON for doors, short up to about 1300 mm high, long above and for inset doors
export const TIPON_DOOR_SHORT_MAX_HEIGHT = 1300;
// Häfele 2017 catalogue p. 11.138 : steel M6 connecting screws through two panels, Ø8 through hole, Ø16 heads
// chosen by the clamping range the two thicknesses fall in
export const CONNECTING_SCREWS = [
    { ref: "267.07.902", min: 32, max: 38 },
    { ref: "267.07.903", min: 36, max: 42 },
    { ref: "267.07.904", min: 39, max: 46 },
];
export const CONNECTING_SCREW_HOLE = 8;
export const CONNECTING_SCREW_HEAD = 16;

// Blum KA-150 p. 172 : drilled TIP-ON, Ø10 axis 7.5 mm from the panel face on the cell side, the glue-on catch
// plate 13 x 18 on that axis, placed with template 65.5210.01 clipped on the unit (p. 687)
export const TIPON_AXIS_FROM_FACE = 7.5;
export const TIPON_HOLE_DIAMETER = 10;
export const TIPON_CATCH_PLATE = { across: 13, high: 18 };
// Blum KA-150 p. 173 : straight adapter plate 956.1201 screwed on that face, screws 20 and 37 from the front
// edge, the unit axis 8 mm off the face inside the cell
export const TIPON_ADAPTER = { ref: "956.1201", axisOffFace: 8, screws: [20, 37] };
// Blum KA-150 p. 436 : TIP-ON BLUMOTION front gap FS
export const TIPON_FRONT_GAP = 2.5;
export const TIPON_SYNC_SMALL = { lwMin: 265, lwMax: 313, cut: 241 };

// Blum KA-150 p. 419 : MOVENTO planning
export const MOVENTO = {
    sideMax: 16,
    innerWidthDeduction: 42,
    lengthDeduction: 10,
    depthMargin: 3,
    sideInset: 21,
    bottomRecessMin: 12,
    bottomRecessMax: 15,
    screwAxisAboveLower: 38,
    bottomAboveLower: 28.5,
    topBelowUpper: 7,
    // screw positions on the carcass side, from the front edge
    frontHoles: [28, 37, 69], 
    // rear holes, 37 + offset, by nominal lenght group
    rearOffsets760: [
        { upTo: 270, offsets: [160] },
        { upTo: 350, offsets: [224] },
        { upTo: 520, offsets: [224, 256] },
        { upTo: 600, offsets: [224, 256] },
    ],
    rearOffsets766: [
        { upTo: 450, offsets: [224, 256] },
        { upTo: 600, offsets: [224, 256, 320] },
        { upTo: 750, offsets: [224, 256, 320, 416] },
    ],
    // 760H 550/600 and every 766H show one more rear screw that the catalogue does not dimension
    undimensionedRearHole(series: "760H" | "766H", nl: number): boolean
    {
        return series === "766H" || nl >= 550;
    },
    backHole: { diameter: 6, depth: 10, fromSide: 7, fromBottom: 11 },
    // "concealed full extension" (Blum MOVENTO product information 2022, p. 18) : the stroke is not dimensioned
    // the box is taken out over its whole nominal lenght NL : the share of NL it travels
    extension: 1,
    maxLoad760: 40,
    maxLoad766: 70,
};


// Blum KA-150 p. 44, 46, 48, and KH 205 to 600 with widths up to 1800 from the AVENTOS range table p. 23 of
// the Blum HK top brochure (2019)
// https://www.hpponline.co.uk/DocumentHandler/2679093/blum-aventos-hk-top-brochure.pdf
// power factor LF = KH (mm) x FG (kg) with the handle counted twice, ranges overlap
export const HK_TOP = {
    minHeight: 205,
    maxHeight: 600,
    maxWidth: 1800,
    // for two mechanisms, a third one needs a centre upright
    maxKg: 18,
    // the housing, 30 wide against each side, runs 187 back from the front edge and down to 173 under the panel above
    housingWidth: 30,
    minInnerHeight: 173,
    minInnerDepth: 187,
    maxTopOverlay: 25.4,
    // bracket screws on the front, from the underside of the panel above and in from the inner side face
    bracketFirst: 62,
    bracketPitch: 32,
    bracketScrews: 4,
    bracketInset: 12.5,
    // cornice space at full opening, Y = FH x 0.29 + FD - SOB
    clearanceFactor: 0.29,
    mechanisms: [
        { lfMin: 420, lfMax: 1610, handle: "22K2300", push: "22K2300T", deg: 107, pushDeg: 107 },
        { lfMin: 930, lfMax: 2800, handle: "22K2500", push: "22K2500T", deg: 107, pushDeg: 107 },
        { lfMin: 1730, lfMax: 5200, handle: "22K2700", push: "22K2700T", deg: 107, pushDeg: 100 },
        { lfMin: 3200, lfMax: 9000, handle: "22K2900", push: "22K2900T", deg: 107, pushDeg: 100 },
    ],
};


// Hettich SlideLine M brochure 2017 p. 4-6 (overlay, one track)
export const SLIDELINE_M = {
    minWidth: 300,
    minWidthDamped: 450,
    maxWidth: 1800,
    maxHeight: 2000,
    heightToWidth: 2,
    maxKg: 30,
    minThickness: 16,
    maxThickness: 25,
    shelfThicknesses: [15, 16, 18, 19, 22, 25],
};


// Häfele U.K. 2018 p. 7.142, concealed shelf support 283.33.910 : a pin Ø 12 x 104 into the back edge of the shelf
// its plate 68 x 20 let into a pocket 70 x 22 x 12, two Ø 5 screws in the wall, 700 apart at most under an even load
export const CONCEALED_SHELF_SUPPORT = {
    ref: "283.33.910",
    minThickness: 24,
    pinDiameter: 12,
    pinDepth: 104,
    pocket: { width: 70, height: 22, depth: 12 },
    plate: { width: 68, height: 20 },
    wallScrews: 2,
    orderMultiple: 4,
    maxSpacing: 700,
    // most load spread over the shelf for its depth, kg/m2, nothing given past 300 deep
    loads: [{ depth: 200, kgPerM2: 200 }, { depth: 250, kgPerM2: 140 }, { depth: 300, kgPerM2: 80 }],
};


// Häfele U.K. 2018 p. 7.14 and 7.19 : Minifix 15, 19 mm board
export const MINIFIX = {
    housingDiameter: 15,
    housingDepth: 14.5,
    // axis at half the thickness of the board, B from the butting edge
    distanceB: 34,
    boltPilot: 5,
    boltDepth: 11,
};

// Lamello P-System : groove cutter 100.4 x 7, depth 14, lever access 6 mm
export const LAMELLO_P14 = {
    cutterDiameter: 100.4,
    grooveWidth: 7,
    grooveDepth: 14,
    accessDiameter: 6,
    minThickness90: 15,
    minThicknessMitre: 18,
    // tensile strength per connector (N)
    tensile: { particleboard: 800, mdf: 900, beech: 1000 },
};

// Shelf deflection : EN 16122:2012 6.1.4 method, UNI 11663 requirement max 0.5 % of the span
// load 1.0 kg/dm2 for general domestic use, 1.5 kg/dm2 for kitchn and bathroom (CATAS table)
export const SHELF_DEFLECTION_LIMIT = 0.005;
export const SHELF_TEST_LOADS = [
    { id: "domestic", label: "Usage domestique courant (UNI 11663)", kgPerDm2: 1.0 },
    { id: "kitchen", label: "Cuisine et salle de bains (UNI 11663)", kgPerDm2: 1.5 },
];

// Code du travail R4541-9 : 55 kg habitual carrying, 25 kg for women
export const HANDLING_LIMITS = [
    { kg: 25, label: "25 kg (R4541-9, limite la plus basse)" },
    { kg: 55, label: "55 kg (R4541-9, port habituel)" },
];

export const GRAVITY = 9.81;
