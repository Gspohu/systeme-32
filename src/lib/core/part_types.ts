// What a part, its drilling, its joints and the build of a whole project are made of

import type { ResolvedLayout } from "./layout";
import type { FrontPanel } from "./fronts";
import type { Frame, Outline, Vec3 } from "./geometry";

export type Edge = "u0" | "u1" | "v0" | "v1";


export interface Hole
{
    // part coordinates of the axis, and the face or edge it is drilled from
    u: number;
    v: number;
    // 0 marks a screw position without pre-drilling
    diameter: number;
    depth: number;
    face: "A" | "B" | Edge;
    // for edge holes, distance of the axis from face A across the thickness
    w?: number;
    label: string;
}


export interface Groove
{
    face: "A" | "B";
    // along u or v, at `at` on the other axis
    along: "u" | "v";
    at: number;
    from: number;
    to: number;
    width: number;
    depth: number;
    label: string;
    // taken off the section in the deflection check of a shelf, a joinery slot is too short to count
    weakens?: boolean;
}

// A pocket let into an edge, `length` along it centred at `at`, `across` the thickness centred `w` from face A
export interface Pocket
{
    edge: Edge;
    at: number;
    length: number;
    across: number;
    w: number;
    depth: number;
    label: string;
}

export type PartRole =
    | "side" | "top" | "bottom" | "back" | "hdivider" | "vdivider" | "shelf" | "plinth"
    | "door" | "drawerFront" | "leaf" | "flap"
    | "boxSide" | "boxEnd" | "boxBottom"
    | "lining" | "endPanel" | "former" | "skin" | "batten" | "flange" | "wallShelf" | "slat" | "cleat" | "filler" | "panel";


export interface Part
{
    id: string;
    item: string;
    itemName: string;
    label: string;
    role: PartRole;
    // lenght runs along the grain when the decor has one
    length: number;
    width: number;
    thickness: number;
    decor: string;
    material: string;
    grain: boolean;
    quantity: number;
    edges: Edge[];
    outline: Outline;
    // openings cut through the board, inside the outline
    cutouts: Outline[];
    // face A is at w = 0 and drilling goes along +n
    frame: Frame | null;
    holes: Hole[];
    grooves: Groove[];
    pockets?: Pocket[];
    notes: string[];
    // flexible skins and battens are cut flat but sit on an arc in the model
    curve: CurveShape | null;
    // lacquer colour of a lacquered MDF part, shown in 3D and noted for the painter
    colour: string | null;
    // where each end of the board lies on face B, along u, measured from where it lies on face A : a plumb cut
    // under a roof or a chamfered head, the outline being face A only
    bevel: { u0: number; u1: number };
}

export interface CurveShape
{
    // arc centre in world and cylinder axis : "y" works in the x-z plane (angle 0 = +x, 90 = +z)
    // "z" works in the x-y plane (angle 0 = +x, 90 = +y)
    centre: Vec3;
    axis: "y" | "z";
    // radius of the outer afce of the skin, the skin thickness goes inward
    rOuter: number;
    thickness: number;
    a0: number;
    a1: number;
    // extent along the axis, measured from the centre
    from: number;
    to: number;
    // flat run continuing the skin towards -z from the arc end at angle `straightAt` (axis "y" only)
    straight: number;
    straightAt: number;
}


// Butt joint : the edge `edge` of part `edgePart` sits against face `face` of part `facePart`
export interface Joint
{
    edgePart: string;
    edge: Edge;
    facePart: string;
    face: "A" | "B";
    // on the face part, the joint line centre is at `line` on axis `lineAxis`, from `from` to `to` on the other axis
    lineAxis: "u" | "v";
    line: number;
    from: number;
    to: number;
    // on the edge part, the same span measured along its edge, same direction as from/to
    edgeFrom: number;
    // true when the edge part coordinate runs opposite to the face part coordinate
    reversed: boolean;
}

export interface HardwareLine
{
    ref: string;
    qty: number;
    item: string;
    itemName: string;
    // part or front the line belongs to, for the drawings
    target: string | null;
    note: string | null;
    // the other item hardware joining two of them goes into
    partner?: string;
}


export interface Build
{
    parts: Part[];
    joints: Joint[];
    hardware: HardwareLine[];
    fronts: Map<string, FrontPanel[]>;
    layouts: Map<string, ResolvedLayout>;
    errors: string[];
    // buildable, but away from a rule worth keeping
    warnings: string[];
    // what the hardware chosen admits, told the user without being a fault
    infos: string[];
    // point loads at mid span in N, a rail centre support hanging from a shelf
    midLoads: Map<string, number>;
    // tube lengths to cut, packed into bars over the whole project once every item is built
    railCuts: { item: string; itemName: string; length: number }[];
    // hardware as volumes, for the 3D view, the clash checks and the drawings
    fitted: Fitted[];
    // how each front opens on the hardware it got
    motions: Motion[];
    // bar handles as the front view draws them : the bar from end to end, in the plane of the façades of its carcass
    handles: { item: string; front: string; ref: string; x0: number; y0: number; x1: number; y1: number }[];
    // pictures pasted on cell backs, in the frame of their wall : lower left corner, the face it lies on, its size
    prints: { item: string; cell: string; file: string; x: number; y: number; z: number; w: number; h: number }[];
    // socket holes as the front views draw them, in the frame of their carcass : a hole in a shelf seen edge on
    outlets: { item: string; id: string; shape: "round" | "rect"; x: number; y: number; w: number; h: number;
               edgeOn: boolean; hidden: boolean }[];
}


// A front opening on its hardware, in the frame of its wall : turned `amount` degrees about `axis` through
// `pivot`, or pushed `amount` mm along `axis`. It carries `parts` and `fitted`, and rides on `rides`
export interface Motion
{
    item: string;
    front: string;
    label: string;
    kind: "turn" | "slide";
    pivot: Vec3;
    axis: Vec3;
    amount: number;
    parts: string[];
    fitted: string[];
    rides: string[];
    // the hardware that sets the movement, quoted in the message of a clash, and what to do then
    source: string;
    remedy: string;
}


// A piece of hardware or the space its maker reserves for it, in the frame of the wall of its item : a box, or
// a cylinder along `axes[2]` of radius `half[0]`
export interface Fitted
{
    key: string;
    item: string;
    ref: string;
    label: string;
    shape: "box" | "cylinder";
    centre: Vec3;
    axes: [Vec3, Vec3, Vec3];
    half: Vec3;
    // the part it is let into, never counted as clashing with it
    host: string | null;
    // inside a closed carcass : drawn in 3D only when the hardware is asked for
    hidden: boolean;
}
