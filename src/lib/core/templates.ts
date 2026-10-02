// Starting projects raed from Valentin's sketches, undimensioned sizes taken from the sketch proportions

import type { Carcass, Lining, Project } from "./model";
import { cell, newCarcass, newCorner, newFront, newId, newProject, split, DEFAULT_BATTENS } from "./factory";

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


// Sketch A and the notepad sketch : 2600 wide, 2430 high, base 600 x 500 deep, upper parts 300 deep
export function tvWall(): Project
{
    const project = newProject("Composition TV et bibliothèque");
    const wood = "H1180_ST37";
    const green = "U604_ST9";

    // base unit : 4 columns of 626 between 19 mm uprights, inner width 2562
    const cols = [cell(), cell(), cell(), cell()];
    const baseUnit = newCarcass({
        name: "Meuble bas",
        width: 2600, height: 500, depth: 500, x: 0, y: 100, z: 0,
        decor: wood, backDecor: wood,
        root: split("v", [627, 1272, 1917], cols),
        ends: {
            left: { type: "square" },
            right: { type: "rounded", radius: 250, sweep: 180, technique: "battens", flexThickness: 9,
                    battens: DEFAULT_BATTENS, decor: wood },
        },
    });
    baseUnit.fronts.push(
        newFront(cols[0]!.id, { type: "door", hinge: "left" }, { decor: green }),
        newFront(cols[1]!.id, { type: "drawers", count: 2, loadKg: 15 }, { decor: green }),
        newFront(cols[2]!.id, { type: "drawers", count: 2, loadKg: 15 }, { decor: green }),
        newFront(cols[3]!.id, { type: "door", hinge: "right" }, { decor: green }),
    );


    // left column on the base : door, open decoration niche, door
    const colCells = [cell(), cell(), cell()];
    const column = newCarcass({
        name: "Colonne gauche",
        width: 450, height: 1830, depth: 300, x: 0, y: 600, z: 0,
        decor: wood, backDecor: wood, base: { type: "floor" },
        root: split("h", [700, 1073], colCells),
    });
    column.fronts.push(
        newFront(colCells[0]!.id, { type: "door", hinge: "left" }, { decor: green }),
        newFront(colCells[2]!.id, { type: "door", hinge: "left" }, { decor: green }),
    );

    // top bridge over the screen, hung on the wall, three open niches
    const bridge = newCarcass({
        name: "Bandeau haut",
        width: 1850, height: 300, depth: 300, x: 450, y: 2130, z: 0,
        decor: wood, backDecor: wood, base: { type: "wall" },
        root: split("v", [591, 1201], [cell(), cell(), cell()]),
    });

    // right return standing on the base, adjustable shelves, up to the rounded corner
    const ret = newCarcass({
        name: "Retour droit",
        width: 300, height: 1530, depth: 300, x: 2300, y: 600, z: 0,
        decor: wood, backDecor: wood, base: { type: "floor" },
        root: split("h", [355, 729, 1103], [cell(), cell(), cell(), cell()], ["adjustable", "adjustable", "adjustable"]),
    });

    const corner = newCorner({
        name: "Angle arrondi haut droit",
        cx: 2300, cy: 2130, z: 0, quadrant: "topRight", outerRadius: 300, innerRadius: 0, depth: 300,
        decor: wood, technique: "flex", flexThickness: 9,
    });


    project.items.push(baseUnit, column, bridge, ret, corner);
    project.screen = { diagonalInch: 65, aspectW: 16, aspectH: 9, cx: 1375, bottom: 600, z: 100, wallMounted: false };
    return project;
}


// Sketch B : 2440 high including a 100 plinth, 500 deep, width read from the proportions (about 2880)
// A 2880 top does not fit a 2800 sheet : five column carcasses of 576 side by side, as a workshop would build it
export function dresser(): Project
{
    const project = newProject("Vaisselier bibliothèque");
    const white = "W1000_ST9";
    const green = "U604_ST9";
    const wood = "H1180_ST37"; 
    const W = 576;
    const column = (i: number, name: string, root: ReturnType<typeof split>): Carcass =>
    {
        return newCarcass({
            name, width: W, height: 2340, depth: 500, x: i * W, y: 100, z: 0, decor: white, backDecor: white, root,
        });
    };

    // column 1 : door below a fixed shelf, crockery niche with two adjustable shelves above
    const c1Door = cell();
    const c1Niche = [cell(), cell(), cell()];
    const k1 = column(0, "Colonne 1, vaisselle", split("h", [900], [c1Door, split("h", [440,
        900], c1Niche, ["adjustable", "adjustable"])]));
    k1.fronts.push(newFront(c1Door.id, { type: "door", hinge: "left" }, { decor: green }));
    for (const c of c1Niche)
    {
        k1.linings.push(lining(c.id, wood, false));
    }

    // column 2 : books on five adjustable shelves, wood backs
    const c2 = [cell(), cell(), cell(), cell(), cell(), cell()];
    const k2 = column(1, "Colonne 2, livres", split("h", [364, 747, 1130, 1513, 1896], c2, ["adjustable",
        "adjustable", "adjustable", "adjustable", "adjustable"]));
    for (const c of c2)
    {
        k2.linings.push(lining(c.id, wood, false));
    }


    // column 3 : door, three cutlery drawers, open niche fully lined
    const c3Door = cell();
    const c3Drawers = cell();
    const c3Niche = cell();
    const k3 = column(2, "Colonne 3, argenterie", split("h", [700, 1169], [c3Door, c3Drawers, c3Niche]));
    k3.fronts.push(
        newFront(c3Door.id, { type: "door", hinge: "left" }, { decor: green }),
        newFront(c3Drawers.id, { type: "drawers", count: 3, loadKg: 10, cutlery: [true, true, true] }, { decor: green }),
    );
    k3.linings.push(lining(c3Niche.id, wood, true));


    // column 4 : full height door over three adjustable shelves
    const col4 = split("h", [575, 1150, 1725], [cell(), cell(), cell(), cell()], ["adjustable", "adjustable",
        "adjustable"]);
    const k4 = column(3, "Colonne 4, rangement", col4);
    k4.fronts.push(newFront(col4.id, { type: "door", hinge: "right" }, { decor: green }));


    // column 5 : door, niche, door
    const c5 = [cell(), cell(), cell()];
    const k5 = column(4, "Colonne 5", split("h", [900, 1300], c5));
    k5.fronts.push(
        newFront(c5[0]!.id, { type: "door", hinge: "right" }, { decor: green }),
        newFront(c5[2]!.id, { type: "door", hinge: "right" }, { decor: green }),   
    );
    k5.linings.push(lining(c5[1]!.id, wood, true));

    project.items.push(k1, k2, k3, k4, k5);
    return project;
}


// Sketch C, drawn with the parents : a wide niche no row of columns can give, their sides would cut it
// A full height column at each end, three carcasses stacked between them
// TODO every size is read off the sketch proportions, to set from the parents' own measures
export function dresserNiche(): Project
{
    const project = newProject("Vaisselier à niche");
    const white = "W1000_ST9";
    const green = "U604_ST9";
    const box = (name: string, x: number, y: number, width: number, height: number,
        root: ReturnType<typeof split>, standing: boolean): Carcass =>
    {
        return newCarcass({ name, width, height, depth: 500, x, y, z: 0, decor: white, backDecor: white, root,
                            base: standing ? { type: "floor" } : { type: "plinth", height: 100, setback: 50 } });
    };

    // the end columns are cut at different heights, the doors do not line up across the niche
    const left = [cell(), cell(), cell()];
    const kl = box("Colonne gauche", 0, 100, 600, 2340, split("h", [636, 1500], left), false);
    const right = [cell(), cell(), cell()];
    const kr = box("Colonne droite", 2200, 100, 680, 2340, split("h", [776, 1666], right), false);
    for (const c of left)
    {
        kl.fronts.push(newFront(c.id, { type: "door", hinge: "left" }, { decor: green }));
    }
    for (const c of right)
    {
        kr.fronts.push(newFront(c.id, { type: "door", hinge: "right" }, { decor: green }));
    }


    // three full height bays, each a cupboard under a 171 high drawer : the uprights carry the shelves
    const doors = [cell(), cell(), cell()];
    const drawers = [cell(), cell(), cell()];
    const bays = [0, 1, 2].map((k) =>
    {
        return split("h", [632], [doors[k]!, drawers[k]!]);
    });
    const low = box("Placards et tiroirs", 600, 100, 1600, 860, split("v", [512, 1040], bays), false);
    low.fronts.push(
        newFront(doors[0]!.id, { type: "door", hinge: "left" }, { decor: green }),
        newFront(doors[1]!.id, { type: "door", hinge: "left" }, { decor: green }),
        newFront(doors[2]!.id, { type: "door", hinge: "right" }, { decor: green }),
    );
    for (const c of drawers)
    {
        low.fronts.push(newFront(c.id, { type: "drawers", count: 1, loadKg: 10 }, { decor: green }));
    }

    // the niche : two narrow columns of small shelves around a 1084 wide opening
    const sideShelves = (): ReturnType<typeof split> =>
    {
        return split("h", [201, 421], [cell(), cell(), cell()]);
    };
    const niche = box("Niche", 600, 960, 1600, 680, split("v", [220, 1323], [sideShelves(), cell(),
        sideShelves()]), true);

    // doors of three widths on the top row, against the grid look
    const top = [cell(), cell(), cell()];
    const high = box("Placards hauts", 600, 1640, 1600, 800, split("v", [603, 1111], top), true);
    high.fronts.push(
        newFront(top[0]!.id, { type: "door", hinge: "left" }, { decor: green }),
        newFront(top[1]!.id, { type: "door", hinge: "left" }, { decor: green }),
        newFront(top[2]!.id, { type: "door", hinge: "right" }, { decor: green }),
    );

    project.items.push(kl, low, niche, high, kr);
    return project;
}


export const TEMPLATES = [
    { id: "tv", label: "Composition TV et bibliothèque", make: tvWall },
    { id: "dresser", label: "Vaisselier bibliothèque", make: dresser },
    { id: "dresserNiche", label: "Vaisselier à niche", make: dresserNiche },
];
