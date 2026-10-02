import { describe, expect, it } from "vitest";
import { CommandError, addItem, distributeEvenly, moveDivider, setCellSize } from "./commands";
import { cell, newCarcass, newProject, split } from "./factory";
import { resolveLayout } from "./layout";
import type { Carcass, Project, SplitNode } from "./model";

// 800 high in 19 mm : 762 inside, three shelves at unevne heights
function shelved(): { p: Project; c: Carcass }
{
    const c = newCarcass({ name: "Bibliothèque de Guebwiller", width: 600, height: 800, depth: 300,
                           root: split("h", [100, 300, 500], [cell(), cell(), cell(), cell()]) });
    const p = addItem(newProject("Guebwiller"), c);
    return { p, c: p.items[0] as Carcass };
}


function heights(p: Project): number[]
{
    const c = p.items[0] as Carcass;
    const lay = resolveLayout(c);
    return (c.root as SplitNode).children.map((n) =>
    {
        return lay.nodes.get(n.id)!.h;
    });
}


describe("spacing", () =>
{
    it("spreads three shelves evenly, each cell within a mm of a quarter of what the shelves leave", () =>
    {
        const { p, c } = shelved();
        const q = distributeEvenly(p, c.id, c.root.id);
        expect(((q.items[0] as Carcass).root as SplitNode).cuts).toEqual([176, 372, 567]);
        for (const h of heights(q))
        {
            // (762 - 3 x 19) / 4 = 176.25
            expect(Math.abs(h - 176.25)).toBeLessThanOrEqual(1);
        }
    });

    it("keeps a typed position to the mm, and snaps a dragged one on the grid", () =>
    {
        const { p, c } = shelved();
        const typed = moveDivider(p, c.id, c.root.id, 0, 19 + 150, true);
        expect(((typed.items[0] as Carcass).root as SplitNode).cuts[0]).toBe(150);
        const dragged = moveDivider(p, c.id, c.root.id, 0, 19 + 150);
        expect(((dragged.items[0] as Carcass).root as SplitNode).cuts[0]).toBe(160);
    });


    it("gives a cell the height asked by moving the divider after it, or before it for the last one", () =>
    {
        const { p, c } = shelved();
        const kids = (c.root as SplitNode).children;
        expect(heights(setCellSize(p, c.id, kids[0]!.id, 180))[0]).toBe(180);
        expect(heights(setCellSize(p, c.id, kids[3]!.id, 200))[3]).toBe(200);
        expect(heights(setCellSize(p, c.id, kids[1]!.id, 150))[1]).toBe(150);
    });

    it("refuses a size that crushes the next cell, and a cell that fills the whole carcass", () =>
    {
        const { p, c } = shelved();
        expect(() =>
        {
            return setCellSize(p, c.id, (c.root as SplitNode).children[0]!.id, 600);
        }).toThrow(/Taille impossible/);
        const bare = addItem(newProject("Guebwiller"), newCarcass({ width: 600, height: 800, depth: 300 }));
        const k = bare.items[0] as Carcass;
        expect(() =>
        {
            return setCellSize(bare, k.id, k.root.id, 300);
        }).toThrow(CommandError);
    });
});
