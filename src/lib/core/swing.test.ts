import { describe, expect, it } from "vitest";
import { addItem, setFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { tvWall } from "./templates";
import { boxesClash, carried } from "./swing";
import type { Carcass } from "./model";
import type { Motion } from "./parts";
import { X, Y, Z } from "./geometry";


function opening(p: ReturnType<typeof newProject>): string[]
{
    return analyse(p).checks.filter((k) =>
    {
        return k.message.includes("en s'ouvrant") || k.message.includes("ouverts ensemble");
    }).map((k) =>
    {
        return `${k.level} | ${k.message}`;
    });
}


describe("fronts swept through their opening", () =>
{
    it("tells boxes in contact from boxes going into each other", () =>
    {
        const a = { centre: [0, 0, 0] as [number, number, number], axes: [X, Y, Z] as [typeof X, typeof X, typeof X],
                    half: [10, 10, 10] as [number, number, number] };
        expect(boxesClash(a, { ...a, centre: [20, 0, 0] })).toBe(false);
        expect(boxesClash(a, { ...a, centre: [15, 0, 0] })).toBe(true);
        // turned 45 deg about y, its corner reaches 14.1 from its centre
        const door: Motion = { item: "k", front: "f", label: "Porte", kind: "turn", pivot: [0, 0, 0], axis: Y,
                               amount: 45, parts: [], fitted: [], rides: [], source: "", remedy: "" };
        expect(boxesClash(carried(a, door, 1), { ...a, centre: [23, 0, 0] })).toBe(true);
        expect(boxesClash(carried(a, door, 1), { ...a, centre: [25, 0, 0] })).toBe(false);
    });


    it("lets a door open square past a deeper column, then stops it there short of its 110 deg", () =>
    {
        // a 400 deep cupboard in Riquewihr hinged on its left against a 600 deep column : the panel stays right
        // of its hinge line up to 90 deg and only then meets the side of the column
        const column = newCarcass({ name: "Colonne", width: 600, height: 800, depth: 600, x: 0 });
        const box = newCarcass({ name: "Placard", width: 600, height: 800, depth: 400, x: 600 });
        let p = addItem(addItem(newProject("Riquewihr"), column), box);
        const k = p.items[1] as Carcass;
        p = setFront(p, k.id, k.root.id, { type: "door", hinge: "left" });
        expect(opening(p)).toEqual(["warning | Placard, porte 1 : en s'ouvrant (charnières 71B3550 110°), touche "
            + "Colonne, joue droite vers 100°, elle ne s'ouvre qu'à 90° environ. Déplacer l'un des deux ou poser les "
            + "charnières de l'autre côté."]);
        const q = setFront(addItem(addItem(newProject("Riquewihr"), column), box), k.id, k.root.id,
                           { type: "door", hinge: "right" });
        expect(opening(q)).toEqual([]);
    });


    it("refuses a door that meets a carcass standing in front of it before it opens square", () =>
    {
        // an island 300 in front of the cupboard : the free edge of the 597 door reaches it near 30 deg
        const box = newCarcass({ name: "Placard", width: 600, height: 800, depth: 400, x: 600 });
        const island = newCarcass({ name: "Îlot", width: 600, height: 800, depth: 400, x: 600, z: 700 });
        let p = addItem(addItem(newProject("Riquewihr"), box), island);
        const k = p.items[0] as Carcass;
        p = setFront(p, k.id, k.root.id, { type: "door", hinge: "left" });
        const said = opening(p).filter((s) =>
        {
            return s.startsWith("error | Placard");
        });
        expect(said).toHaveLength(1);
        expect(said[0]).toMatch(/touche Îlot, .* vers (30|40)°\. /);
    });


    it("warns that the right door of the TV base and the drawers beside it cannot stand open together", () =>
    {
        const p = tvWall();
        const base = p.items[0] as Carcass;
        const door = base.fronts.at(-1)!;
        expect(opening(p)).toEqual([]);
        // the hinges of the parents' save, on the left : the door swings over the drawers pulled out
        const before = setFront(p, base.id, door.node, { type: "door", hinge: "left" }, { opening: "push" });
        const said = opening(before);
        expect(said).toHaveLength(2);
        for (const s of said)
        {
            const pair = /^warning \| Meuble bas, tiroir [12] et meuble bas, porte \d se heurtent/;
            expect(s).toMatch(pair);
        }
    });
});
