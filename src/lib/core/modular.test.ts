import { describe, expect, it } from "vitest";
import { addItem, setDividerKind, setModularCell, splitCell } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass, Project, SplitNode } from "./model";

// 800 high in 19 mm : the line runs 9.5 + 32k from the axis of the bottom, its holes 41.5 to 745.5 inside the cell
// a 19 mm shelf still fitting over the last one
function modular(): { p: Project; c: Carcass }
{
    let p = addItem(newProject("Sélestat"), newCarcass({ name: "Buffet de Sélestat", width: 600, height: 800,
                                                         depth: 400 }));
    const c = p.items[0] as Carcass;
    p = setModularCell(p, c.id, c.root.id, true);
    return { p, c: p.items[0] as Carcass };
}


// pin holes only : each Minifix bolt need a 5 mm pilot hole on the same rows, top and bottom
function seriesOn(p: Project, c: Carcass, side: "L" | "R")
{
    return analyse(p).build.parts.find((q) =>
    {
        return q.id === `${c.id}/side/${side}`;
    })!.holes.filter((h) =>
    {
        return h.diameter === 5 && !h.label.startsWith("Goujon");
    });
}


describe("modular cells", () =>
{
    it("drills both sides at every height a shelf may rest on, and nowhere else", () =>
    {
        const { p, c } = modular();
        for (const side of ["L", "R"] as const)
        {
            const holes = seriesOn(p, c, side);
            expect(holes.length).toBe(2 * 23);
            const us = holes.map((h) =>
            {
                return Math.round(h.u);
            });
            expect(Math.min(...us)).toBe(42);
            expect(Math.max(...us)).toBe(746);
        }
    });

    it("never drills twice where an adjustable shelf has its own pins", () =>
    {
        const { p, c } = modular();
        let q = splitCell(p, c.id, c.root.id, "h", 400);
        q = setDividerKind(q, c.id, ((q.items[0] as Carcass).root as SplitNode).id, 0, "adjustable");
        const holes = seriesOn(q, c, "L");
        const keys = new Set(holes.map((h) =>
        {
            return `${h.face}|${h.u.toFixed(2)}|${h.v.toFixed(2)}`;
        }));
        expect(keys.size).toBe(holes.length);
        expect(holes.some((h) =>
        {
            return h.label.startsWith("Taquet");
        })).toBe(true);
    });


    it("keeps both halves modular when the cell is split, and forgets a cell that is gone", () =>
    {
        const { p, c } = modular();
        const q = splitCell(p, c.id, c.root.id, "h", 400);
        const k = q.items[0] as Carcass;
        expect([...k.modularCells].sort()).toEqual((k.root as SplitNode).children.map((n) =>
        {
            return n.id;
        }).sort());
        const off = setModularCell(q, c.id, k.modularCells[0]!, false);
        expect((off.items[0] as Carcass).modularCells.length).toBe(1);
    });
});
