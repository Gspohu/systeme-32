import { describe, expect, it } from "vitest";
import { CommandError, addItem, setDividerThickness, setFront, updateItem } from "./commands";
import { cell, newCarcass, newProject, split } from "./factory";
import { analyse } from "./analysis";
import { resolveLayout } from "./layout";
import { validateProject } from "./io/project_file";
import type { Carcass, Project, SplitNode } from "./model";

// 19 mm sides, one shelf at 700 and an upright in the upper half
function bookcase(shelfThickness: number | null): { p: Project; c: Carcass }
{
    const c = newCarcass({ name: "Bibliothèque de Colmar", width: 900, height: 1600, depth: 400, shelfThickness,
                           root: split("h", [700], [cell(), split("v", [400], [cell(), cell()])]) });
    const p = addItem(newProject("Colmar"), c);
    return { p, c: p.items[0] as Carcass };
}


function shelfOf(p: Project)
{
    return analyse(p).build.parts.find((q) =>
    {
        return q.role === "hdivider";
    })!;
}


describe("shelf thickness", () =>
{
    it("gives the shelves the carcass shelf thickness and leaves the uprights at the sides", () =>
    {
        const { c } = bookcase(22);
        const lay = resolveLayout(c);
        const shelf = lay.dividers.find((d) =>
        {
            return d.axis === "h";
        })!;
        const upright = lay.dividers.find((d) =>
        {
            return d.axis === "v";
        })!;
        expect(shelf.h).toBe(22);
        expect(upright.w).toBe(19);
        // the cell above start on the upper face of the 22 mm shelf
        expect(upright.y).toBe(19 + 700 + 22);
        expect(lay.nodes.get((c.root as SplitNode).children[0]!.id)!.walls.top).toBe(22);
    });

    it("lets one shelf be thicker than the others, and null gives it the carcass one back", () =>
    {
        const { p, c } = bookcase(22);
        const r = setDividerThickness(p, c.id, c.root.id, 0, 25);
        expect(shelfOf(r).thickness).toBe(25);
        expect(shelfOf(r).frame!.o[1] - c.y).toBe(19 + 700 + 25);
        const back = setDividerThickness(r, c.id, c.root.id, 0, null);
        expect(shelfOf(back).thickness).toBe(22);
        expect(shelfOf(updateItem<Carcass>(back, c.id, { shelfThickness: null })).thickness).toBe(19);
    });


    it("drills the joints of a thicker shelf at the middle of its own edge", () =>
    {
        const { p, c } = bookcase(25);
        const b = analyse(p).build;
        const shelf = shelfOf(p);
        const side = b.parts.find((q) =>
        {
            return q.id === `${c.id}/side/L`;
        })!;
        const joint = b.joints.find((j) =>
        {
            return j.edgePart === shelf.id && j.facePart === side.id;
        })!;
        expect(joint.line).toBeCloseTo(19 + 700 + 12.5 - (side.frame!.o[1] - c.y), 9);
    });

    it("lets a door overlay half of the thicker shelf above it", () =>
    {
        const { p, c } = bookcase(25);
        const q = setFront(p, c.id, (c.root as SplitNode).children[0]!.id, { type: "door", hinge: "left" });
        const door = analyse(q).build.fronts.get(c.id)![0]!;
        expect(door.rect.y + door.rect.h).toBeCloseTo(19 + 700 + 12.5 - q.settings.frontGap / 2, 9);
    });


    it("refuses an upright of its own thickness and a shelf that would crush the cell above", () =>
    {
        const { p, c } = bookcase(null);
        const upper = (c.root as SplitNode).children[1] as SplitNode;
        expect(() =>
        {
            return setDividerThickness(p, c.id, upper.id, 0, 25);
        }).toThrow(CommandError);
        expect(() =>
        {
            return setDividerThickness(p, c.id, c.root.id, 0, 900);
        }).toThrow(/Épaisseur impossible/);
    });

    it("reads a version 4 file with every shelf as thick as the sides", () =>
    {
        const { p } = bookcase(null);
        const old = JSON.parse(JSON.stringify({ ...p, schema: 4 }));
        delete old.items[0].shelfThickness;
        delete old.items[0].modularCells;
        delete old.items[0].root.thicknesses;
        delete old.items[0].root.children[1].thicknesses;
        const k = validateProject(old).items[0] as Carcass;
        expect(k.shelfThickness).toBeNull();
        expect(k.modularCells).toEqual([]);
        expect((k.root as SplitNode).thicknesses).toEqual([null]);
        expect(((k.root as SplitNode).children[1] as SplitNode).thicknesses).toEqual([null]);
    });
});
