import { describe, expect, it } from "vitest";
import { addItem, setFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass, Project } from "./model";


// a column of Colmar against the left wall of its room, or that far rfom it
function column(x: number, door: { type: "door"; hinge: "left" | "right" } | { type: "doubleDoor" }): Project
{
    let p = addItem(newProject("Colmar"), newCarcass({ name: "Colonne de Colmar", width: 600, height: 1800,
                                                         depth: 560, x, y: 100 }));
    const c = p.items[0] as Carcass;
    p = setFront(p, c.id, c.root.id, door);
    return p;
}


function wallWarnings(p: Project): string[]
{
    return analyse(p).checks.filter((k) =>
    {
        return k.message.includes("en s'ouvrant");
    }).map((k) =>
    {
        return k.message;
    });
}


describe("doors hinged against a wall", () =>
{
    it("give the hinge edge a 4 mm reveal and then open clear of the wall", () =>
    {
        const p = column(0, { type: "door", hinge: "left" });
        const door = analyse(p).build.fronts.get(p.items[0]!.id)![0]!;
        expect(door.hingeOverlay).toBeCloseTo(15);
        expect(wallWarnings(p)).toEqual([]);
    });


    it("leave a door hinged away from the wall as it was", () =>
    {
        const p = column(0, { type: "door", hinge: "right" });
        const door = analyse(p).build.fronts.get(p.items[0]!.id)![0]!;
        expect(door.hingeOverlay).toBeCloseTo(17.5);
        // aaginst the wall the edge still hold the usual reveal from the outer face of the side
        expect(door.rect.x).toBeCloseTo(1.5);
    });


    it("warn when a door 1 mm off the wall would pass closer than the hinge adjustment", () =>
    {
        const warnings = wallWarnings(column(1, { type: "door", hinge: "left" }));
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toContain("mm du mur");
        expect(wallWarnings(column(3, { type: "door", hinge: "left" }))).toEqual([]);
    });

    it("trim only the leaf of a double door hinged on the wall side", () =>
    {
        const p = column(0, { type: "doubleDoor" });
        const [leftLeaf, rightLeaf] = analyse(p).build.fronts.get(p.items[0]!.id)!;
        expect(leftLeaf!.hingeOverlay).toBeCloseTo(15);
        expect(rightLeaf!.hingeOverlay).toBeCloseTo(17.5);
    });
});
