// Starting projects : the two pieces Valentin's parents drew and saved, as they meant them once corrected

import type { Carcass, Lining, Project } from "./model";
import { cell, newCarcass, newFront, newId, newProject, newWallShelf, split, DEFAULT_BATTENS } from "./factory";

const OAK = "H1180_ST37";
const GREEN = "U604_ST9";

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

    // four columns of 627 : a door before an adjustable shelf, two pairs of drawers, a door again
    const cables = cell();
    const leftDoor = split("h", [224], [cables, cell()], ["adjustable"]);
    const drawersA = cell();
    const drawersB = cell();
    const rightDoor = split("h", [224], [cell(), cell()], ["adjustable"]);
    // the quarter round end left open, one shaped shelf parting its 500 of height in two, closed at the back
    const baseUnit = newCarcass({
        name: "Meuble bas",
        width: 2600, height: 500, depth: 400, x: 0, y: 100, z: 0,
        decor: OAK, backDecor: OAK,
        root: split("v", [627, 1272, 1917], [leftDoor, drawersA, drawersB, rightDoor]),
        ends: {
            left: { type: "square" },
            right: { type: "rounded", radius: 300, sweep: 90, technique: "battens", flexThickness: 9,
                     battens: DEFAULT_BATTENS, decor: OAK, open: true, shelves: 1, back: true },
        },
    });
    // a 60 mm hole through the back of the lower left cell for the cables, to set from the grommet bought
    baseUnit.outlets.push({ id: newId("o"), cell: cables.id, panel: "back", shape: "round", w: 60, h: 60, dx: 0,
                            dy: 0 });
    baseUnit.fronts.push(
        newFront(leftDoor.id, { type: "door", hinge: "left" }, { decor: GREEN }),
        newFront(drawersA.id, { type: "drawers", count: 2, loadKg: 15 }, { decor: GREEN }),
        newFront(drawersB.id, { type: "drawers", count: 2, loadKg: 15 }, { decor: GREEN }),
        newFront(rightDoor.id, { type: "door", hinge: "left" }, { decor: GREEN }),
    );


    // the column on the base : a door over three cells of adjustable shelves, an open lined niche, a door again
    const lower = split("h", [160, 352], [cell(), cell(), cell()], ["adjustable", "adjustable"]);
    const niche = cell();
    const upper = split("h", [156, 348], [cell(), cell(), cell()], ["adjustable", "adjustable"]);
    const column = newCarcass({
        name: "Colonne gauche",
        width: 450, height: 1830, depth: 300, x: 0, y: 600, z: 0,
        decor: OAK, backDecor: OAK, base: { type: "floor" },
        root: split("h", [700, 1073], [lower, niche, upper]),
    });
    column.fronts.push(
        newFront(lower.id, { type: "door", hinge: "left" }, { decor: GREEN }),
        newFront(upper.id, { type: "door", hinge: "left" }, { decor: GREEN }),
    );
    column.linings.push(lining(niche.id, OAK, true));

    // their 38 mm oak shelves in the Decospan 39, the nearest board sold
    const shelves = [[1860, 1600], [2230, 800]].map(([y, width]) =>
    {
        return newWallShelf({ x: 450, y, width, depth: 250, thickness: 39, decor: "CHENE_PLAQUE",
                              corners: { left: 0, right: 50 } });
    });

    project.items.push(baseUnit, column, ...shelves);
    project.screen = { diagonalInch: 65, aspectW: 16, aspectH: 9, cx: 1375, bottom: 600, z: 100, wallMounted: false };
    return project;
}


// Their dresser, as their sketch wants it : a wide niche no row of columns can give, their sides would cut it
// A full height column at each end, three carcasses stacked between them
// TODO the end column widths and every split are read off the sketch, their save only gives the envelope
export function dresser(): Project
{
    const project = newProject("Vaisselier bibliothèque");
    const box = (name: string, x: number, y: number, width: number, height: number,
        root: ReturnType<typeof split>, standing: boolean): Carcass =>
    {
        return newCarcass({ name, width, height, depth: 500, x, y, z: 0, decor: OAK, backDecor: OAK, root,
                            base: standing ? { type: "floor" } : { type: "plinth", height: 100, setback: 50 } });
    };

    // the left column cut at two heights, the right one behind a single full height door over its two shelves
    const left = [cell(), cell(), cell()];
    const kl = box("Colonne gauche", 0, 100, 600, 2256, split("h", [636, 1500], left), false);
    const rightRoot = split("h", [776, 1666], [cell(), cell(), cell()]);
    const kr = box("Colonne droite", 2200, 100, 680, 2256, rightRoot, false);
    for (const c of left)
    {
        kl.fronts.push(newFront(c.id, { type: "door", hinge: "left" }, { decor: GREEN }));
    }
    kr.fronts.push(newFront(rightRoot.id, { type: "door", hinge: "right" }, { decor: GREEN }));
    // an 80 mm hole for the mains in the back of the middle cell, its centre 100 in from the left and the bottom
    kl.outlets.push({ id: newId("o"), cell: left[1]!.id, panel: "back", shape: "round", w: 80, h: 80,
                      dx: -((600 - 2 * 19) / 2 - 100), dy: -((1500 - 636 - 19) / 2 - 100) });


    // three full height bays, each a cupboard under a 171 high drawer : the uprights carry the shelves
    const doors = [cell(), cell(), cell()];
    const drawers = [cell(), cell(), cell()];
    const bays = [0, 1, 2].map((k) =>
    {
        return split("h", [632], [doors[k]!, drawers[k]!]);
    });
    const low = box("Placards et tiroirs", 600, 100, 1600, 860, split("v", [512, 1040], bays), false);
    low.fronts.push(
        newFront(doors[0]!.id, { type: "door", hinge: "left" }, { decor: GREEN }),
        newFront(doors[1]!.id, { type: "door", hinge: "left" }, { decor: GREEN }),
        newFront(doors[2]!.id, { type: "door", hinge: "right" }, { decor: GREEN }),
    );
    for (const c of drawers)
    {
        low.fronts.push(newFront(c.id, { type: "drawers", count: 1, loadKg: 10 }, { decor: GREEN }));
    }

    // the niche : two narrow columns of small shelves around a 1084 wide opening, close to their 1100 x 600 box
    const sideShelves = (): ReturnType<typeof split> =>
    {
        return split("h", [201, 421], [cell(), cell(), cell()]);
    };
    const niche = box("Niche", 600, 960, 1600, 680, split("v", [220, 1323], [sideShelves(), cell(),
        sideShelves()]), true);

    // the top row parted like the bays under it : its doors line up with theirs acros the niche
    const top = [cell(), cell(), cell()];
    const high = box("Placards hauts", 600, 1640, 1600, 716, split("v", [512, 1040], top), true);
    high.fronts.push(
        newFront(top[0]!.id, { type: "door", hinge: "left" }, { decor: GREEN }),
        newFront(top[1]!.id, { type: "door", hinge: "left" }, { decor: GREEN }),
        newFront(top[2]!.id, { type: "door", hinge: "right" }, { decor: GREEN }),
    );

    project.items.push(kl, low, niche, high, kr);
    return project;
}


export const TEMPLATES = [
    { id: "tv", label: "Composition TV et bibliothèque", make: tvWall },
    { id: "dresser", label: "Vaisselier bibliothèque", make: dresser },
];
