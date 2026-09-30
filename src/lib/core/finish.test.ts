import { describe, expect, it } from "vitest";
import { addItem, removeDivider, setDividerFinish, setFront, splitCell, updateFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { computeBom } from "./bom";
import { validateProject } from "./io/project_file";
import type { Carcass, Project, SplitNode } from "./model";


function box(): { p: Project; c: Carcass }
{
    const c = newCarcass({ width: 600, height: 1600, depth: 400 });
    const p = addItem(newProject("essai"), c);
    return { p, c: p.items[0] as Carcass };
}

function shelves(p: Project): { decor: string; colour: string | null; notes: string[]; y: number }[]
{
    const out: { decor: string; colour: string | null; notes: string[]; y: number }[] = [];
    for (const q of analyse(p).build.parts)
    {
        if (q.role === "hdivider")
        {
            out.push({ decor: q.decor, colour: q.colour, notes: q.notes, y: q.frame!.o[1] });
        }
    }
    return out.sort((a, b) =>
    {
        return a.y - b.y;
    });
}

function decorsOf(p: Project): string[]
{
    const decors: string[] = [];
    for (const s of shelves(p))
    {
        decors.push(s.decor);
    }
    return decors;
}


describe("finish per element", () =>
{
    it("gives one shelf its own decor, listed and nested apart from the carcass panels", () =>
    {
        const { p, c } = box();
        const q = splitCell(p, c.id, c.root.id, "h", 800);
        const root = (q.items[0] as Carcass).root as SplitNode;
        const r = setDividerFinish(q, c.id, root.id, 0, { decor: "U604_ST9", colour: null });
        expect(decorsOf(r)).toEqual(["U604_ST9"]);
        const bom = computeBom(r, analyse(r));
        const greenShelf = expect.objectContaining({ decor: "U604_ST9", label: expect.stringMatching(/^Tablette/) });
        expect(bom.cut).toContainEqual(greenShelf);
    });


    it("keeps each finish on its own shelf when shelves are added below or removed", () =>
    {
        const { p, c } = box();
        let q = splitCell(p, c.id, c.root.id, "h", 800); 
        const root = (q.items[0] as Carcass).root as SplitNode;
        q = setDividerFinish(q, c.id, root.id, 0, { decor: "U604_ST9", colour: null });
        // a new hself in the lower cell joins the same split, before the rgeen one
        q = splitCell(q, c.id, root.children[0]!.id, "h", 300);
        expect(decorsOf(q)).toEqual(["W1000_ST9", "U604_ST9"]);
        q = removeDivider(q, c.id, root.id, 0);
        expect(decorsOf(q)).toEqual(["U604_ST9"]);
    });

    it("lacquers a shelf, and forgets the colour once the decor is no lacquer any more", () =>
    {
        const { p, c } = box();
        let q = splitCell(p, c.id, c.root.id, "h", 800);
        const root = (q.items[0] as Carcass).root as SplitNode;
        q = setDividerFinish(q, c.id, root.id, 0, { decor: "MDF_LAQUE", colour: "#b0493a" });
        expect(shelves(q)[0]).toMatchObject({ colour: "#b0493a" });
        expect(shelves(q)[0]!.notes).toContain("Teinte #b0493a");
        q = setDividerFinish(q, c.id, root.id, 0, { decor: "U604_ST9", colour: "#b0493a" });
        expect(shelves(q)[0]!.colour).toBeNull();
    });

    it("drops the lacquer colour of a front moved to another decor", () =>
    {
        const { p, c } = box();
        let q = setFront(p, c.id, c.root.id, { type: "door", hinge: "left" }, { decor: "MDF_LAQUE", colour: "#223344" });
        const f = (q.items[0] as Carcass).fronts[0]!;
        q = updateFront(q, c.id, f.id, { decor: "H1180_ST37" });
        const door = analyse(q).build.parts.find((x) => { return x.role === "door"; })!;
        expect(door.colour).toBeNull();
        expect(door.notes).not.toContainEqual(expect.stringMatching(/^Teinte/));
    });


    it("gives the dividers and linings of a version 1 project no finish", () =>
    {
        const { p, c } = box();
        const q = splitCell(p, c.id, c.root.id, "h", 800);
        const old = JSON.parse(JSON.stringify({ ...q, schema: 1 }));  
        delete old.items[0].root.finishes;
        const back = validateProject(old);
        expect(((back.items[0] as Carcass).root as SplitNode).finishes).toEqual([null]);
    });
});
