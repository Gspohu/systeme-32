// Project data model, all lengths in millimetres, pure data with no behavour

export const SCHEMA_VERSION = 6;

export type Id = string;


export type Joinery = "minifix" | "dowel" | "clamex";

export interface Settings 
{
    // snapping pitch for dividers and fronts, 32 is the European obring system
    grid: number;
    // gap between two neighbouring fronts
    frontGap: number;
    // reveal left around the outer edge of an overlay front
    edgeReveal: number;
    // saw kerf and trimming of the raw sheet edges, for the nesting
    kerf: number;
    trim: number;
    // weight one person may carry (Code du travail R4541-9)
    handlingKg: number;
    // shelf test load kg/dm2 (UNI 11663 via EN 16122:2012)
    shelfLoad: number;
    joinery: Joinery;
    // workshop conventions, not taken from a manufacturer document
    connectorInset: number;
    dowelFaceDepth: number;
    dowelEdgeDepth: number;
    pinDepth: number;
    shelfSideClearance: number;
    shelfFrontSetback: number;
    hingeEdgeDistance: number;
    // hinge cup distance TB (Blum 3..7)
    hingeTb: number;
    // what the anti-tip brackets are screwed into, it picks the wall plug
    wallType: WallType;
    // the 24 V strip bought, its power and the pitch it may be cut at
    ledWattPerMetre: number;
    ledCutPitch: number;
    // power of one round spot
    spotWatt: number;
}

export type WallType = "solid" | "aerated" | "plasterboard";

export const DEFAULT_SETTINGS: Settings = {
    grid: 32,
    frontGap: 3,
    edgeReveal: 1.5,
    kerf: 4,
    trim: 10,
    handlingKg: 25,
    shelfLoad: 1.0,
    joinery: "minifix",
    connectorInset: 37,
    dowelFaceDepth: 12,
    dowelEdgeDepth: 24,
    pinDepth: 12,
    shelfSideClearance: 1,
    shelfFrontSetback: 20,
    hingeEdgeDistance: 100,
    hingeTb: 5,
    wallType: "solid",
    // Häfele Loox5 LED 3048 as the Home Decor Hardware sheet gives it (833.76.353, 24 V, section length 50 mm)
    ledWattPerMetre: 14.4,
    ledCutPitch: 50,
    // Häfele Loox 24V LED 3001 downlight (TCH Design 2017 p. 5.119)
    spotWatt: 1.7,
};


export type DividerKind = "fixed" | "adjustable";


export interface SplitNode
{
    kind: "split";
    id: Id;
    // "h" stacks children bottom to top with horizontal panels, "v" lays them left to right with uprights
    axis: "h" | "v";
    // lower or left face of each divider, measured from the start of the node inner space
    cuts: number[];
    dividers: DividerKind[];
    // own finish of each divider, null takes the carcass decor
    finishes: (Finish | null)[];
    // own thickness of each shelf, null takes the shelf thickness of the carcass, an upright never has one
    thicknesses: (number | null)[];
    children: LayoutNode[];
}


// A decor, and the lacquer colour when the decor is the lacquered MDF
export interface Finish
{
    decor: string;
    colour: string | null;
}


export interface CellNode
{
    kind: "cell";
    id: Id;
}

export type LayoutNode = SplitNode | CellNode;

export type Opening = "handle" | "push";

export interface DoorFront
{
    type: "door";
    hinge: "left" | "right";
}


export interface DoubleDoorFront
{
    type: "doubleDoor";
}

export interface DrawerFront
{
    type: "drawers";
    count: number;
    // relative heights of each front, bottom to top, equal when absent
    ratios?: number[];
    // drawers fitted with a cutlery insert, bottom to top
    cutlery?: boolean[];
    // expectd load per drawer (kg), drives the runner and TIP-ON choice
    loadKg: number;
    // MOVENTO series asked by the user, the lightest one carrying the load when absent
    runner?: "760H" | "766H";
}

// SlideLine M overlay runs on one track : leaves sit side by side and never cover the whole opening
export interface SlidingFront
{
    type: "sliding";
    leaves: number;
    leafWidth: number;
    damped: boolean;
}


// Lift-up flap on a Blum AVENTOS HK top stay lift, hinged along its top edge
export interface LiftFront
{
    type: "lift";
    // Blum counts the handle twice in the front weight of a lift (KA-150 p. 44)
    handleKg: number;
}


// Fixed panel closing a cell, pierced or not : an arch or a round opening shows the inside
export interface PanelFront
{
    type: "panel";
    cutout: "none" | "arch" | "round";
    // border of board kept around the opening
    margin: number;
}


export type FrontSpec = DoorFront | DoubleDoorFront | DrawerFront | SlidingFront | LiftFront | PanelFront;


export interface Front
{
    id: Id;
    node: Id;
    spec: FrontSpec;
    opening: Opening;
    mount: "overlay" | "inset";
    decor: string | null;
    // lacquer colour when the decor is a free colour, with its RAL or NCS name
    colour: string | null;
    colourName: string | null;
}

export interface Lining
{
    id: Id;
    cell: Id;
    decor: string;
    // lacquer colour of a lacquered MDF lining, else null
    colour: string | null;
    thickness: number;
    faces: { back: boolean; left: boolean; right: boolean; top: boolean; bottom: boolean };
}

export type Base =
    | { type: "plinth"; height: number; setback: number; grills?: number }
    | { type: "feet"; height: number }
    // hung on a pair of Blum 48N0510 by default, or on Camar 807 base cabinet hangers for a heavier one
    | { type: "wall"; hanger?: "blum" | "camar" }
    | { type: "floor" };


export type BackMount =
    | { type: "applied"; thickness: number }
    | { type: "groove"; thickness: number; offset: number; depth: number }
    | { type: "none" };


export type CurveTechnique = "flex" | "battens" | "solid";


export interface Battens
{
    width: number;
    gap: number;
    thickness: number;
    decor: string;
}


// a quarter round is open at the back between the side and its skin, `back` closes it like the carcass back
export type End =
    | { type: "square" }
    | { type: "rounded"; radius: number; sweep: 90 | 180; technique: CurveTechnique; flexThickness: 6 |
       9; battens: Battens; decor: string; back?: boolean;
       // an open end has no skin : shaped shelves in the reach of the arc, evenly spread between the end panels
       open?: boolean; shelves?: number };

export interface Carcass
{
    kind: "carcass";
    id: Id;
    name: string;
    wall: Wall;
    // back left bottom corner of the box (the base sits below it)
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    thickness: number;
    // thickness of the shelves, null for the one of the sides
    shelfThickness: number | null;
    decor: string;
    base: Base;
    back: BackMount;
    backDecor: string;
    ends: { left: End; right: End };
    root: LayoutNode;
    fronts: Front[];
    linings: Lining[];
    fixToWall: boolean;
    // the top is sat on : nothing may stand on it and it must carry a person
    seat: Seat | null;
    // top following a roof slope : `height` is then the high side, `slope.height` the low one
    slope: Slope | null;
    rails: HangingRail[];
    lights: CellLight[];
    // strip closing the gap from the top to the ceiling, in the plane of the fronts
    ceilingFiller: boolean;
    shoeRacks: ShoeRack[];
    // cells drilled over their whole hieght on the 32 mm grid, for shelves moved later
    modularCells: Id[];
    outlets: Outlet[];
    // Häfele reference of the shelf supports the user chose, the first one carrying each shelf when absent
    pins?: string;
}

// A hole for a wall socket or a cable : through the back behind a cell, or the panel above or below it
export interface Outlet
{
    id: Id;
    cell: Id;
    panel: "back" | "above" | "below";
    shape: "round" | "rect";
    // diameter of a round hole in `w`, width and height of a rectangle, mm
    w: number;
    h: number;
    // centre offset from the middle of the cell : across, then up on the back or towards the front elsewhere
    dx: number;
    dy: number;
}

// Shoe racks screwed to the back of a cell, levels spread evenly from its floor
export interface ShoeRack
{
    id: Id;
    cell: Id;
    levels: number;
}

export interface Slope
{
    low: "left" | "right";
    height: number;
} 

export interface Seat
{
    // 0 for a bare top, else the cushion laid on it, made by an upholsterer
    cushion: number;
}

// Clothes rail across a cell, hung under the panel above it, or pulled down on a wardrobe lift
export interface HangingRail
{
    id: Id;
    cell: Id;
    kind: "fixed" | "lift";
}


// LED profile or round spots recessed in the underside of the panel above a cell
export interface CellLight
{
    id: Id;
    cell: Id;
    kind: "strip" | "spots";
    // spots spread evenly across the cell, unused by a strip
    spots: number;
    // from the front edge of that panel to the groove or to the spot holes
    setback: number;
    kelvin: 2700 | 3000 | 4000;
}


// Quarter round joining two boxes in the front view, like the top right corner of the TV wall
export interface RoundCorner
{
    kind: "corner";
    id: Id;
    name: string;
    wall: Wall;
    // centre of the arcs in the front view, and back plane of the part
    cx: number;
    cy: number;
    z: number;
    // quadrant the arc covers, measured from the centre
    quadrant: "topRight" | "topLeft" | "bottomRight" | "bottomLeft";
    outerRadius: number;
    innerRadius: number;
    depth: number;
    thickness: number;
    decor: string;
    technique: CurveTechnique;
    flexThickness: 6 | 9;
    battens: Battens;
}

export interface WallShelf
{
    kind: "wallShelf";
    id: Id;
    name: string;
    wall: Wall;
    x: number;
    y: number;
    z: number;
    width: number;
    depth: number;
    // TODO no concealed bracket is sourced yet, the least thickness it needs is unknown
    thickness: number;
    decor: string;
    // a desk top is checked for its height and the room left for the legs
    purpose: "shelf" | "desk";
    // radius of the two front corners, 0 for a square one
    corners: { left: number; right: number };
}

export interface HangingBox
{
    kind: "box";
    id: Id;
    name: string;
    wall: Wall;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    thickness: number;
    decor: string;
}

// Vertical slats : on cleats against a wal, or as a room divider between a floor and a ceiling rail
export interface SlatWall
{
    kind: "slats";
    id: Id;
    name: string;
    wall: Wall;
    mode: "wall" | "divider";
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    // face seen from the room, and depth away from the wall or through the divider
    slatWidth: number;
    slatDepth: number;
    // wished gap, the real one spreads the slats over the whole width
    gap: number;
    decor: string;
}


// Library ladder hooked on a rail along the wall : the rail is built, the ladder bought, and its load, slope and
// rail brackets come from its maker (none could be read)
export interface LadderRail
{
    kind: "ladder";
    id: Id;
    name: string;
    wall: Wall;
    x: number;
    // height of the rail axis from the floor, and distance of the back of the rail from the wall
    y: number;
    z: number;
    width: number;
    railDiameter: number;
    ladderWidth: number;
    // left edge of the ladder along the rail, where the drawings show it
    ladderAt: number;
}


export type Item = Carcass | RoundCorner | WallShelf | HangingBox | SlatWall | LadderRail;

// Wall an item stands against, seen from the room : x runs left to right, z comes out of the wall
export type Wall = "back" | "left" | "right";

// Inside faces of the room : the back wall runs along x, the side walls along the depth
export interface Room
{
    width: number;
    depth: number;
    height: number;
}

export interface Screen
{
    diagonalInch: number;
    aspectW: number;
    aspectH: number;
    // centre of the screen in the front view, and its front plane
    cx: number;
    bottom: number;
    z: number;
    wallMounted: boolean;
}


export interface PriceEntry  
{
    // euros excluding VAT : per unit for hardware, per m2 for boards, per metre for edges
    value: number;
    unit: "u" | "m2" | "m";
    source: string | null;
    date: string | null;
}


export interface Project
{
    schema: number;
    id: Id;
    name: string;
    created: string;
    updated: string;
    settings: Settings;
    items: Item[];
    screen: Screen | null;
    prices: Record<string, PriceEntry>;
    // user images packed in the archive, keyed by decor id
    textures: Record<string, UserTexture>;
    room: Room;
}

// a room of 4 x 4 m under a 2.50 m ceiling until the real one is measured (convention)
export const DEFAULT_ROOM: Room = { width: 4000, depth: 4000, height: 2500 };

// A photo of a decor sample : its file in the archive and the panel width it shows, in mm
export interface UserTexture
{
    file: string;
    tileMm: number;
}
