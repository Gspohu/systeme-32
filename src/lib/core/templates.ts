// Starting projects : the 2 pieces the clients drew and saved, as they meant them once corrected

import type { Carcass, LayoutNode, Lining, Project, SplitNode } from "./model";
import { PIN_BELOW_SHELF } from "./grid";
import { cell, newCarcass, newDevice, newFront, newId, newProject, newWallShelf, split,
        DEFAULT_BATTENS } from "./factory";
import { SOFA_START } from "./room_dressing";

const OAK = "H1180_ST37";
const GREEN = "U604_ST9";
// The dresser backs in the cheapest white sold in 8 mm, 153 EUR HT saved. The TV wall keeps oak ones : its niche
// lining needs an oak 8 mm sheet anyway, and the backs come out of it
const BACK = "SNOW_WHITE_8685";
// The drawer boxes of both pieces : Egger stocks its boards in 19 only in France (availability guide 2026), the
// 16 mm H1180 to order from 24 boards
const BOX = "SNOW_WHITE_8685";
// Every cupboard door of both pieces opens to a push, TIP-ON, the drawers ekep their handles
const PUSH_DOOR = { decor: GREEN, opening: "push" as const };
// Under the ceiling of the TV room, as measured
const TV_CEILING = 2435;
const DESIGNER = "Valentin Pohu";
// Each piece has its technical cupboard, the hole in its back letting mains blocks throught
const TECHNICAL_HOLE = 100;
// Their measure of the HDMI and power jack plugs to pass, 2026-11-04
const TV_CABLE_HOLE = 40;


// The title block of both pieces : ISO 7200:2004 asks for the owner, the creator and the approver
function signed(project: Project): void
{
    Object.assign(project.settings, { owner: DESIGNER, creator: DESIGNER, approver: DESIGNER });
}


function lining(cellId: string, decor: string, full: boolean): Lining
{
    return {
        id: newId("l"),
        cell: cellId,
        decor,
        colour: null,
        thickness: 8,
        faces: { back: true, left: full, right: full, top: full, bottom: full },
    };
}


// Their TV wall save : a 2600 base with a quarter round end, a left column, two oak shelves on the wall
// Corrected : one door over each group of cells their adjustable shelves part, small doors could not take
// two hinges
export function tvWall(): Project
{
    const project = newProject("Composition TV et bibliothèque");

    // Four columns of 627 : a door before an adjustable shelf, two pairs of drawers, a door again
    // adjustable shelves rest on the system 32 line, 9.5 + 32k from the bottom : 5 mm under the parents' save
    const leftDoor = split("h", [216], [cell(), cell()], ["adjustable"]);
    const drawersA = cell();
    const drawersB = cell();
    const rightDoor = split("h", [216], [cell(), cell()], ["adjustable"]);
    // The quarter round end left open, not sat on unless asked : its low board on the floor held by the back of the
    // end, one shaped shelf betwen
    const baseUnit = newCarcass({
        name: "Meuble bas",
        width: 2600, height: 500, depth: 400, x: 0, y: 100, z: 0,
        decor: OAK, backDecor: OAK,
        // A return on the right hides the feet from the open quarter round
        base: { type: "plinth", height: 100, setback: 50, returns: ["right"] },
        root: split("v", [627, 1272, 1917], [leftDoor, drawersA, drawersB, rightDoor]),
        ends: {
            left: { type: "square" },
            right: { type: "rounded", radius: 300, sweep: 90, technique: "battens", flexThickness: 9,
                     battens: DEFAULT_BATTENS, decor: OAK, open: true, shelves: 1, back: true, floor: true },
        },
    });
    // The left column stands in the middle of the span of the left cell : a board on edge under it, to the side and the
    // upright standing on the feet, under the column and Gilles' one over its whole length
    // 139 off the back puts its connectors on a row of the system, 37 + 7 x 32 from the front
    baseUnit.stiffeners = [{ cell: leftDoor.id, z: 139, height: 100 }];
    // Held to the wall through its back, behind the two doors over the reach of their shelves : no bracket on a top that
    // shows, none fits under the ceiling on the column either
    baseUnit.backWallScrews = [100, 560, 2040, 2500].map((x) =>
    {
        return { x, y: 430 };
    });
    baseUnit.fronts.push(
        newFront(leftDoor.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(drawersA.id, { type: "drawers", count: 2, loadKg: 15, boxDecor: BOX }, { decor: GREEN }),
        newFront(drawersB.id, { type: "drawers", count: 2, loadKg: 15, boxDecor: BOX }, { decor: GREEN }),
        // Hinged on the right, it swings towards the quarter round and clears the drawers pulled out beside it
        newFront(rightDoor.id, { type: "door", hinge: "right" }, PUSH_DOOR),
    );


    // The column on the base : a door over three cells of adjustable shelves, an open lined niche, a door again
    // The lowest cell is the technical one, the box in it
    const technical = cell();
    const lower = split("h", [152, 344], [technical, cell(), cell()], ["adjustable", "adjustable"]);
    const niche = cell();
    // Both 64 over where their save had them : lower, the holes of the first would meet the hinge plate at 1225.5
    const upper = split("h", [212, 404], [cell(), cell(), cell()], ["adjustable", "adjustable"]);
    // Up to their ceiling of 2435 less 25, closed by a filler scribed on site : room to lift it over the top of the
    // base it slides onto, and for a ceiling never quite level. Its upper cell gives up what the 1830 lost
    const column = newCarcass({
        name: "Colonne gauche",
        width: 450, height: TV_CEILING - 25 - 600, depth: 300, x: 0, y: 600, z: 0,
        decor: OAK, backDecor: OAK, base: { type: "floor" }, ceilingFiller: true,
        root: split("h", [700, 1073], [lower, niche, upper]),
    });
    column.backWallScrews = [60, 390].flatMap((x) =>
    {
        return [{ x, y: 600 }, { x, y: 1731 }];
    });
    column.fronts.push(
        newFront(lower.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(upper.id, { type: "door", hinge: "left" }, PUSH_DOOR),
    );
    column.linings.push(lining(niche.id, OAK, true));

    // Gilles' open column against it, 300 x 150 since 2026-10-17, up under the lower wall shelf, no back. Bays of 122
    // and 121 either side of his upright, the right shelves half a pitch higher : 281 clear takes a 240 book
    const lowLeftBay = cell();
    const lowRightBay = cell();
    const bookLeft = split("v", [122], [split("h", [280, 580, 880], [lowLeftBay, cell(), cell(), cell()]),
                                         split("h", [130, 430, 730, 1030], [lowRightBay, cell(), cell(), cell(),
                                             cell()])]);
    const books = newCarcass({
        name: "Colonne à livres",
        width: 300, height: 1260, depth: 150, x: 450, y: 600, z: 0,
        decor: OAK, backDecor: OAK, base: { type: "floor" }, back: { type: "none" },
        root: bookLeft,
        // Open and seen on every shelf : dowelled and glued in the workshop, nothing showing in it
        joinery: "dowel", hiddenLinks: true,
        // Held by the column, itself bolted to the base, it carries little
        unlinkedFrom: [baseUnit.id],
    });
    // One through the back, wide enough for the mains blocks as on the dresser. HDMI and TV power come level with it
    // through Gilles' column behind his books : 696.5 off the floor, 85 off the wall, clear of the shelf holes at 45
    column.outlets.push({ id: newId("o"), cell: technical.id, panel: "back", shape: "round", w: TECHNICAL_HOLE,
                          h: TECHNICAL_HOLE, dx: 0, dy: 0 });
    column.outlets.push({ id: newId("o"), cell: technical.id, panel: "right", shape: "round", w: TV_CABLE_HOLE,
                          h: TV_CABLE_HOLE, dx: -69, dy: 1.5 });
    books.outlets.push({ id: newId("o"), cell: lowLeftBay.id, panel: "left", shape: "round", w: TV_CABLE_HOLE,
                         h: TV_CABLE_HOLE, dx: 10, dy: -62.5 });
    books.outlets.push({ id: newId("o"), cell: lowLeftBay.id, panel: "right", shape: "round", w: TV_CABLE_HOLE,
                         h: TV_CABLE_HOLE, dx: 10, dy: -62.5 });
    books.outlets.push({ id: newId("o"), cell: lowRightBay.id, panel: "right", shape: "round", w: TV_CABLE_HOLE,
                         h: TV_CABLE_HOLE, dx: 10, dy: 12.5 });

    // Their 38 mm oak shelves in the Decospan 39, the nearets board sold, on the chipboard core priced
    // Hollow brick holds little : brackets on the column at their left end, the lower one on Gilles' column too, and
    // more wall supports than Häfele's spacing needs, 5 and 3 for 3 and 2
    const shelves = [[1860, 1600, 5], [2230, 800, 3]].map(([y, width, supports]) =>
    {
        return newWallShelf({ x: 450, y, width, depth: 250, thickness: 39, decor: "CHENE_PLAQUE_AGGLO",
                              corners: { left: 0, right: 50 }, tied: true, supports });
    });

    // Their amplifier laid long since 2026-10-17, flush with the front : its bass port is at the
    // back. Moved right of the
    // stored screen once the screen went on an arm, 30 clear, its old place taken by Gilles' column
    const amplifier = newDevice({
        name: "Ampli Marshall Stanmore", x: 1580, y: 600, z: 215, width: 350, height: 185, depth: 185, massKg: 5.1,
        source: "Marshall Stanmore 1re génération, 350 x 185 x 185 mm et 5,1 kg (fiche manua.ls), posé à plat",
        look: "amplifier",
    });
    // The 2 boxes of their mini 4K side by side on the floor of the technical cell, 60 clear behind for the plugs
    const server = newDevice({
        name: "Freebox Server mini 4K", x: 30, y: 619, z: 60, width: 180, height: 45, depth: 190, massKg: 0.66,
        source: "180 x 45 x 190 mm et 0,66 kg d'un comparateur en ligne, à vérifier sur l'appareil, posé à plat", 
    });
    const player = newDevice({
        name: "Freebox Player mini 4K", x: 230, y: 619, z: 60, width: 155, height: 31, depth: 118, massKg: 0.34,
        source: "155 x 31 x 118 mm (test Génération NT), 0,34 kg estimés, à peser",
    });
    project.items.push(baseUnit, column, books, ...shelves, amplifier, server, player);
    // Their set, read off its back label, on a wall arm : put away 30 right of Gilles' 300 column, swung out over it
    // to face the middle of their 1880 sofa
    project.screen = {
        diagonalInch: 32, aspectW: 16, aspectH: 9, cx: 1162, bottom: 664, z: 80, wallMounted: false,
        frame: { w: 764, h: 463, d: 30 }, massKg: 7, vesa: [200, 200],
        source: "Samsung UE32D4000NW (étiquette du dos) : 763,6 x 463,1 x 29,9 mm et 7 kg sans pied, VESA 200 x 200 "
            + "(fiches tvsfaq et manua.ls, aucune fiche Samsung lue : mesurer l'écart des trous au dos)",
        arm: {
            model: "One For All WM 2251", maxKg: 30, vesa: [[75, 75], [100, 100], [200, 100], [200, 200]],
            reachMin: 49, reachMax: 393, plateW: 240, plateH: 249, x: 1076, y: 896,
            out: { cx: 940, z: 250 },
            source: "fiche oneforall.com relevée le 2026-10-08 : 13 à 43 pouces, VESA 75 x 75 à 200 x 200, 30 kg, "
                + "49 à 393 mm du mur, 180° ; platine prise à son encombrement de 24 x 24,9 cm",
        },
    };
    const sc = project.screen;
    // Their room : left wall 3100 to the facing wall, their 1880 sofa backed on it, centred on the swung out screen
    // Measured on 2026-10-23 : back wall 3050 long, 2435 high, hollow brick
    project.settings.wallType = "hollow";
    signed(project);
    project.room = { ...project.room, width: 3050, height: TV_CEILING, depth: 3100, walls: ["left"],
                     sofas: [{ id: newId("sofa"), name: "Canapé", ...SOFA_START, width: 1880,
                               x: sc.arm!.out!.cx - 1880 / 2, distance: 3100 }] };
    return project;
}


// The middle of the dressers, 2 mm taken from the right column on 2026-10-17 : its fronts of 531 to the mm
// An outer front covers its side, 25.5 more than its bay, a middle one half of each upright, 16 more : bays
// of 505.5, 515 and 505.5 for the drawers and both rows of cupboards
const DRESSER_MIDDLE = 1602;
const DRESSER_BAYS = [505.5, 1039.5] as const;
// The cupboards under the drawers 632 clear, the high cupboards standing from 1640 : the joints the columns follow
const DRESSER_CUPBOARD_CUT = 632;
const DRESSER_HIGH_Y = 1640;


function dresserBox(name: string, x: number, y: number, width: number, height: number, root: LayoutNode,
    standing: boolean): Carcass
{
    return newCarcass({ name, width, height, depth: 500, x, y, z: 0, decor: OAK, backDecor: BACK, root,
                        base: standing ? { type: "floor" } : { type: "plinth", height: 100, setback: 50 } });
}


// What both dressers share : a full height column at each end, the row of cupboards under three drawers
// between them, and their alcove. The part over the drawers is each variant's own
// TODO the end column widths and every split are read off the sketch, their save only gives the envelope
function dresserFrame(name: string, upper: Carcass[], bottles = false): Project
{
    const project = newProject(name);
    const box = dresserBox;

    // Each cell of the end columns keeps a movable shelf about its middle, its pins
    // in the hole of the line nearest, the fixed shelves staying to tie the sides of 2256
    const movable = (y0: number, h: number, steps = 0, why: string | null = null): SplitNode =>
    {
        const hole = 19 / 2 + 32 * (Math.round((y0 + (h - 19) / 2 - PIN_BELOW_SHELF - 19 / 2) / 32) + steps);
        return { ...split("h", [hole + PIN_BELOW_SHELF - y0], [cell(), cell()], ["adjustable"]), notes: [why] };
    };
    // The left column cut at two heights, the right one behind a single full height door over its two shelves
    // Its fixed shelves on the joints of the fronts beside it, a few mm off read as a mistake : under the cupboard
    // shelf of the bays, then on the bottom of the high cupboards
    const cutLow = DRESSER_CUPBOARD_CUT;
    const cutHigh = DRESSER_HIGH_Y - 100 - 19 - 19 / 2;
    // Its middle shelf 4 steps up : on the middle its holes meet the hinge plate of that door at 1097.5 and 1129.5
    const off = "Posée 4 trous (128 mm) au-dessus du milieu de sa case : au milieu, ses taquets tomberaient sur les "
        + "trous de l'embase de charnière de la porte";
    const left = [movable(19, cutLow), movable(cutLow + 38, cutHigh - cutLow - 19, 4, off), movable(cutHigh + 38,
        2256 - cutHigh - 57)];
    const kl = box("Colonne gauche", 0, 100, 600, 2256, split("h", [cutLow, cutHigh], left), false);
    const rightRoot = split("h", [776, 1666], [movable(19, 776), movable(814, 871), movable(1704, 533)]);
    const kr = box("Colonne droite", 600 + DRESSER_MIDDLE, 100, 2280 - DRESSER_MIDDLE, 2256, rightRoot, false);
    for (const c of left)
    {
        kl.fronts.push(newFront(c.id, { type: "door", hinge: "left" }, PUSH_DOOR)); 
    }
    kr.fronts.push(newFront(rightRoot.id, { type: "door", hinge: "right" }, PUSH_DOOR));
    // The hole for the mains in the back of the middle cell, its centre 100 in from the left and from the movable
    // shelf : over it, with the LED driver and controller the lead of the niche brings down, one
    // technical place and not 2
    const mains = left[1]!;
    const over = cutHigh - cutLow - 19 - mains.cuts[0]! - 19;
    kl.outlets.push({ id: newId("o"), cell: mains.children[1]!.id, panel: "back", shape: "round", w: TECHNICAL_HOLE,
                      h: TECHNICAL_HOLE,
                      dx: -((600 - 2 * 19) / 2 - 100), dy: -(over / 2 - 100) });


    // Three full height bays, each a cupboard under a 171 high drawer : the uprights carry the shelves
    // Each cupboard halved by a fixed shelf : 632 clear gives 306 under it and 307 over it
    // With its bottles the middle one keeps its whole 632 for a pull-out behind a drop-down flap
    const doors: LayoutNode[] = [0, 1, 2].map((k) =>
    {
        return bottles && k === 1 ? cell() : split("h", [306], [cell(), cell()]);
    });
    const drawers = [cell(), cell(), cell()];
    const bays = [0, 1, 2].map((k) =>
    {
        return split("h", [DRESSER_CUPBOARD_CUT], [doors[k]!, drawers[k]!]);
    });
    const low = box("Placards et tiroirs", 600, 100, DRESSER_MIDDLE, 860, split("v", [...DRESSER_BAYS], bays), false);
    // 20 bottles or so of 1.3 kg in the pull-out
    low.fronts.push(
        newFront(doors[0]!.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        // The flap inset between the uprights, standing on the leaves of its hinges
        bottles ? newFront(doors[1]!.id, { type: "drop", pullOut: { loadKg: 30, boxDecor: BOX } },
                           { ...PUSH_DOOR, mount: "inset" })
            : newFront(doors[1]!.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(doors[2]!.id, { type: "door", hinge: "right" }, PUSH_DOOR),
    );
    for (const c of drawers)
    {
        low.fronts.push(newFront(c.id, { type: "drawers", count: 1, loadKg: 10, boxDecor: BOX }, { decor: GREEN }));
    }

    project.items.push(kl, low, ...upper, kr);
    // Their alcove as measured : 3010 wide, 2440 under the ceiling, returns 660 on the left and 610 on the right
    // the 2880 of the piece centred in it
    project.room = { ...project.room, width: 3010, height: 2440, returns: { left: 660, right: 610 } };
    for (const k of [kl, low, ...upper, kr])
    {
        k.x += (3010 - 2880) / 2;
    }
    // The two 65 mm gaps to the returns closed by fillers in the front decor, scribed on site
    kl.sideFillers = { left: 65, right: 0 };
    kr.sideFillers = { left: 0, right: 65 };
    signed(project);
    return project;
}


// Their dresser, as their sketch wants it : a wide niche no row of columns can give, their sides would cut it
export function dresser(): Project
{
    const box = dresserBox;
    // 2 small columns loose in the niche : 220 clear inside, 300 deep, 5 under the niche top
    // to slide in (10 showed, 2026-11-06), 6 forward of the back to clear the wall screw heads they hide
    const looseColumn = (name: string, x: number): Carcass =>
    {
        const c = box(name, x, 960 + 19, 258, 680 - 2 * 19 - 5, split("h", [179, 377], [cell(), cell(), cell()]), true);
        // Dowelled and glued in the workshop : small enough to carry whole, every shelf in the open. No back : its
        // glued top, bottom and fixed shelves keep it square, the back of the niche is behind it
        return Object.assign(c, { depth: 300, z: 8 + 6, fixToWall: false, freeStanding: true, joinery: "dowel" as const,
                                  back: { type: "none" as const } });
    };
    const opening = cell();
    const niche = box("Niche", 600, 960, DRESSER_MIDDLE, 680, opening, true);
    // No doubled top : the high cupboards span the niche, 0.3 mm under their dishes, 1 mm with
    // creep (Kser EN 1995-1-1 7.1, gamma method annex B). Top and bottom over the sides : cupboard sides stand on a
    // full width board
    niche.hiddenLinks = true;
    niche.overSides = true;
    // Held by the wall in the middle of the piece, tying all it's screwed to : next to its sides, behind the columns
    niche.backWallScrews = [79, DRESSER_MIDDLE - 79].flatMap((x) =>
    {
        return [{ x, y: 140 }, { x, y: 480 }];
    });
    // A LED strip let into the underside of its top, lighting the opening, switched and dimmed over Wi-Fi
    // Its driver and controller behind the door of the left column, by the mains hole of that cell
    niche.lights.push({ id: newId("li"), cell: opening.id, kind: "strip", spots: 0, setback: 30, kelvin: 3000,
                        wifi: true, leadThrough: "left" });

    // The top row parted like the bays under it : its doors line up with theirs acros the niche
    // Each cupboard halved by a fixed shelf : 678 clear gives 329 under it and 330 over it
    const top = [0, 1, 2].map(() =>
    {
        return split("h", [329], [cell(), cell()]);
    });
    const high = box("Placards hauts", 600, DRESSER_HIGH_Y, DRESSER_MIDDLE, 716, split("v",
        [...DRESSER_BAYS], top), true);
    high.fronts.push(
        newFront(top[0]!.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(top[1]!.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(top[2]!.id, { type: "door", hinge: "right" }, PUSH_DOOR),
    );
    return dresserFrame("Vaisselier bibliothèque", [niche, high, looseColumn("Petite colonne gauche", 600 + 19),
                                                    looseColumn("Petite colonne droite", 600 + DRESSER_MIDDLE -
                                                                19 - 258)], true);
}


// The variant asked on 2026-10-17 : no niche box, its two triple columns set in the opening at each end, 300 deep
// against the wall after their save of that evening. The strip goes under the cupboards above, over the opening
export function smallNichesDresser(): Project
{
    const box = dresserBox;
    const triple = (name: string, x: number): Carcass =>
    {
        const c = box(name, x, 960, 250, 680, split("h", [201, 421], [cell(), cell(), cell()]), true);
        c.depth = 300;
        return c;
    };
    const top = [cell(), cell(), cell()];
    const high = box("Placards hauts", 600, DRESSER_HIGH_Y, DRESSER_MIDDLE, 716, split("v", [...DRESSER_BAYS],
        top), true);
    high.fronts.push(
        newFront(top[0]!.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(top[1]!.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(top[2]!.id, { type: "door", hinge: "right" }, PUSH_DOOR),
    );
    // Its middle cell is the one wholly over the opening, the side ones sit partly on the small columns
    high.lights.push({ id: newId("li"), cell: top[1]!.id, kind: "strip", spots: 0, setback: 30, kelvin: 3000,
                       wifi: true, under: true });
    return dresserFrame("Vaisselier petites niches", [triple("Petite niche gauche", 600), high,
                                                      triple("Petite niche droite", 600 + DRESSER_MIDDLE - 250)]);
}


// Their second sketch of 2026-10-17 : no small niches, an open column of shelves either side running up to the
// top, a narrower niche between them under a cupboard of two doors. The 400 / 800 / 400 and the 760 high niche
// are its proportions rounded, nothing on it is dimensioned
export function openDresser(): Project
{
    const box = dresserBox;
    // Over the drawers 1396 are left : 1358 inside, three equal cells of 440 between two shelves
    const column = (name: string, x: number): Carcass =>
    {
        return box(name, x, 960, 400, 1396, split("h", [440, 899], [cell(), cell(), cell()]), true);
    };
    const opening = cell();
    const niche = box("Niche", 1000, 960, DRESSER_MIDDLE - 800, 760, opening, true);
    niche.lights.push({ id: newId("li"), cell: opening.id, kind: "strip", spots: 0, setback: 30, kelvin: 3000,
                        wifi: true });
    // Two doors over the niche, a shelf behind each halfway up its 598
    const halves = [0, 1].map(() =>
    {
        return split("h", [289], [cell(), cell()]);
    });
    const wide = DRESSER_MIDDLE - 800;
    const high = box("Placard haut", 1000, 1720, wide, 636, split("v", [(wide - 38 - 19) / 2], halves), true);
    high.fronts.push(
        newFront(halves[0]!.id, { type: "door", hinge: "left" }, PUSH_DOOR),
        newFront(halves[1]!.id, { type: "door", hinge: "right" }, PUSH_DOOR),
    );
    return dresserFrame("Vaisselier colonnes ouvertes", [column("Colonne ouverte gauche", 600), niche, high,
                                                         column("Colonne ouverte droite", 1000 + wide)]);
}


export const TEMPLATES = [
    { id: "tv", label: "Composition TV et bibliothèque", make: tvWall },
    { id: "dresser", label: "Vaisselier bibliothèque", make: dresser },
    { id: "dresser-small", label: "Vaisselier petites niches", make: smallNichesDresser },
    { id: "dresser-open", label: "Vaisselier colonnes ouvertes", make: openDresser },
];
