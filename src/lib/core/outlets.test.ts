import { describe, expect, it } from "vitest";
import { CommandError, addItem, addOutlet, splitCell, updateOutlet, updateItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { validateProject } from "./io/project_file";
import type { Carcass, Project, SplitNode } from "./model";

// 600 x 800 x 400 in 19 mm, an 8 mm applied back, a fixed shelf asked at 400 : the grid put it 384 above the
// inner bottom, the olwer cell start at 19 and ends at 403
function tvUnit(): { p: Project; c: Carcass; lower: string; upper: string }
{
    let p = addItem(newProject("Munster"), newCarcass({ name: "Meuble TV de Munster", width: 600, height: 800,
                                                        depth: 400 }));
    let c = p.items[0] as Carcass;
    p = splitCell(p, c.id, c.root.id, "h", 400);
    c = p.items[0] as Carcass;
    const [lower, upper] = (c.root as SplitNode).children.map((n) =>
    {
        return n.id;
    });
    return { p, c, lower: lower!, upper: upper! };
}


function holed(p: Project, c: Carcass, cell: string, patch: Parameters<typeof updateOutlet>[3]): Project
{
    const q = addOutlet(p, c.id, cell);
    const o = (q.items[0] as Carcass).outlets.at(-1)!;
    return updateOutlet(q, c.id, o.id, patch);
}


function partOf(p: Project, id: string)
{
    return analyse(p).build.parts.find((q) =>
    {
        return q.id === id;
    })!;
}


describe("socket holes", () =>
{
    it("cuts the back behind the middle of a cell, the starting 80 mm square", () =>
    {
        const { p, c, lower } = tvUnit();
        const back = partOf(addOutlet(p, c.id, lower), `${c.id}/back`);
        expect(back.cutouts.length).toBe(1);
        // the back runs u up and v across : centre 211 high and 300 across
        expect(back.cutouts[0]!.start).toEqual([171, 260]);
        expect(back.cutouts[0]!.segments[1]).toEqual({ kind: "line", x: 251, y: 340 });
    });

    it("cuts a round cable hole through the shelf above a cell, half way in its depth", () =>
    {
        const { p, c, lower } = tvUnit();
        const q = holed(p, c, lower, { panel: "above", shape: "round", w: 60 });
        const shelf = analyse(q).build.parts.find((x) =>
        {
            return x.role === "hdivider";
        })!;
        expect(shelf.cutouts.length).toBe(1);
        expect(shelf.cutouts[0]!.start).toEqual([281, 226]);
        expect(shelf.notes).toContain("Trou Ø60 pour prise ou câble, d'après le DXF");
    });


    it("reaches the carcass top above an upper cell and the bottom below a lower one", () =>
    {
        const { p, c, lower, upper } = tvUnit();
        const q = holed(holed(p, c, upper, { panel: "above", shape: "round", w: 60 }), c, lower,
                        { panel: "below", shape: "round", w: 60 });
        expect(partOf(q, `${c.id}/top`).cutouts.length).toBe(1);
        expect(partOf(q, `${c.id}/bottom`).cutouts.length).toBe(1);
    });

    it("says when the hole leaves its cell or finds no back to go through", () =>
    {
        const { p, c, lower } = tvUnit();
        const out = holed(p, c, lower, { dx: 300 });
        expect(analyse(out).checks.some((k) =>
        {
            return k.message.includes("sort de sa case");
        })).toBe(true);
        const bare = updateItem<Carcass>(addOutlet(p, c.id, lower), c.id, { back: { type: "none" } });
        expect(analyse(bare).checks.some((k) =>
        {
            return k.message.includes("aucun panneau de fond");
        })).toBe(true);
    });


    it("refuses a size of nothing, and reads a version 5 file with no hole", () =>
    {
        const { p, c, lower } = tvUnit();
        expect(() =>
        {
            return holed(p, c, lower, { w: 0 });
        }).toThrow(CommandError);
        const old = JSON.parse(JSON.stringify({ ...p, schema: 5 }));
        delete old.items[0].outlets;
        expect((validateProject(old).items[0] as Carcass).outlets).toEqual([]);
    });
});
