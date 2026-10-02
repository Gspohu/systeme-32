import { describe, expect, it } from "vitest";
import { CommandError, addItem, mergeFronts, setFront, splitCell, splitFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass, Project, SplitNode } from "./model";

// a shelf put in first, then a door on each cell : what the carcass hold after atking a door off to add the shelf
function twoDoors(): { p: Project; c: Carcass }
{
    let p = addItem(newProject("Haguenau"), newCarcass({ name: "Armoire de Haguenau", width: 600, height: 1600,
                                                         depth: 400 }));
    let c = p.items[0] as Carcass;
    p = splitCell(p, c.id, c.root.id, "h", 800);
    c = p.items[0] as Carcass;
    for (const child of (c.root as SplitNode).children)
    {
        p = setFront(p, c.id, child.id, { type: "door", hinge: "left" });
    }
    return { p, c: p.items[0] as Carcass };
}


describe("one door or one door per cell", () =>
{
    it("turns the two doors into a single one over both cells", () =>
    {
        const { p, c } = twoDoors();
        const q = mergeFronts(p, c.id, c.fronts[0]!.id);
        const k = q.items[0] as Carcass;
        expect(k.fronts.length).toBe(1);
        expect(k.fronts[0]!.node).toBe(c.root.id);
        expect(analyse(q).build.fronts.get(c.id)!.length).toBe(1);
        expect(analyse(q).checks.filter((m) =>
        {
            return m.level === "error";
        })).toEqual([]);
    });

    it("gives each cell its own door again, alike", () =>
    {
        const { p, c } = twoDoors();
        const one = mergeFronts(p, c.id, c.fronts[1]!.id);
        const q = splitFront(one, c.id, (one.items[0] as Carcass).fronts[0]!.id);
        const k = q.items[0] as Carcass;
        expect(k.fronts.map((f) =>
        {
            return f.node;
        }).sort()).toEqual((c.root as SplitNode).children.map((n) =>
        {
            return n.id;
        }).sort());
        expect(new Set(k.fronts.map((f) =>
        {
            return f.id;
        })).size).toBe(2);
        expect(k.fronts[1]!.spec).toEqual(k.fronts[0]!.spec);
    });


    it("says when there is nothing to join or to split", () =>
    {
        const { p, c } = twoDoors();
        const one = mergeFronts(p, c.id, c.fronts[0]!.id);
        const whole = (one.items[0] as Carcass).fronts[0]!.id;
        expect(() =>
        {
            return mergeFronts(one, c.id, whole);
        }).toThrow(CommandError);
        expect(() =>
        {
            return splitFront(p, c.id, c.fronts[0]!.id);
        }).toThrow(CommandError);
    });
});
