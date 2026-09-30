// Constructors with sensble defaults for evrey item, and for a blank project

import {
    DEFAULT_ROOM, DEFAULT_SETTINGS, SCHEMA_VERSION, type Battens, type Carcass, type CellNode, type DividerKind, type Front,
    type FrontSpec, type HangingBox, type LadderRail, type LayoutNode, type Project, type RoundCorner, type SlatWall, type SplitNode,
    type WallShelf,
} from "./model";
import { DEFAULT_PRICES } from "../data/prices";


let counter = 0;

export function newId(prefix: string): string
{
    counter++;
    const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `${prefix}-${rnd}${counter.toString(36)}`;
}


export function cell(): CellNode
{
    return { kind: "cell", id: newId("c") };
}


export function split(axis: "h" | "v", cuts: number[], children: LayoutNode[], dividers?: DividerKind[]): SplitNode
{
    const kinds = dividers ?? new Array<DividerKind>(cuts.length).fill("fixed");
    return { kind: "split", id: newId("s"), axis, cuts, dividers: kinds, finishes: new Array(cuts.length).fill(null),
             children };
}


export const DEFAULT_BATTENS: Battens = { width: 20, gap: 10, thickness: 20, decor: "CHENE_MASSIF" };


export function newCarcass(o: Partial<Carcass> & { width: number; height: number; depth: number }): Carcass
{
    return {
        kind: "carcass",
        id: newId("k"),
        name: "Caisson",
        wall: "back",
        x: 0,
        y: 100,
        z: 0,
        thickness: 19,
        decor: "W1000_ST9",
        base: { type: "plinth", height: 100, setback: 50 },
        back: { type: "applied", thickness: 8 },
        backDecor: "W1000_ST9",
        ends: { left: { type: "square" }, right: { type: "square" } },
        root: cell(),
        fronts: [],
        linings: [],
        fixToWall: true,
        seat: null, 
        slope: null,
        rails: [],
        lights: [],
        ceilingFiller: false,
        shoeRacks: [],
        ...o,
    };
}


export function newFront(node: string, spec: FrontSpec, o?: Partial<Front>): Front
{
    return { id: newId("f"), node, spec, opening: "handle", mount: "overlay", decor: null, colour: null,
            colourName: null, ...o };
}


export function newCorner(o: Partial<RoundCorner> & { cx: number; cy: number }): RoundCorner
{
    return {
        kind: "corner",
        id: newId("r"),
        name: "Angle arrondi",
        wall: "back",
        z: 0,
        quadrant: "topRight",
        outerRadius: 300,
        innerRadius: 0,
        depth: 300,
        thickness: 19,
        decor: "W1000_ST9",
        technique: "flex",
        flexThickness: 9,
        battens: DEFAULT_BATTENS,
        ...o,
    };
}


export function newWallShelf(o: Partial<WallShelf>): WallShelf
{
    return { kind: "wallShelf", id: newId("w"), name: "Étagère murale", wall: "back", x: 0, y: 1200, z: 0, width: 800,
            depth: 250, thickness: 38, decor: "W1000_ST9", purpose: "shelf", corners: { left: 0, right: 0 }, ...o };
}


export function newBox(o: Partial<HangingBox>): HangingBox
{
    return { kind: "box", id: newId("b"), name: "Caisson ouvert suspendu", wall: "back", x: 0, y: 1200, z: 0, width: 400,
             height: 600,
            depth: 300, thickness: 19, decor: "H1180_ST37", ...o };
}


export function newSlats(o: Partial<SlatWall>): SlatWall
{
    return { kind: "slats", id: newId("t"), name: "Tasseaux muraux", wall: "back", mode: "wall", x: 0, y: 0, z: 0,
             width: 1200,
             height: 2400, slatWidth: 40, slatDepth: 20, gap: 20, decor: "CHENE_MASSIF", ...o };
}


// Every size here is a starting value to set from the chosen ladder's sheet
export function newLadder(o: Partial<LadderRail>): LadderRail
{
    return { kind: "ladder", id: newId("e"), name: "Échelle sur rail", wall: "back", x: 0, y: 2000, z: 400, width: 2400,
             railDiameter: 30, ladderWidth: 450, ladderAt: 0, ...o };
}


export function newProject(name: string): Project
{
    const now = new Date().toISOString();
    return {
        schema: SCHEMA_VERSION,
        id: newId("p"),
        name,
        created: now,
        updated: now,
        settings: { ...DEFAULT_SETTINGS },
        items: [],
        screen: null,
        prices: structuredClone(DEFAULT_PRICES),
        textures: {},
        room: { ...DEFAULT_ROOM },
    };
}
