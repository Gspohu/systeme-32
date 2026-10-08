import { describe, expect, it } from "vitest";
import { addItem, duplicateItem } from "./commands";
import { addOutlet } from "./front_commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass, Project } from "./model";


// the vacuum column of the etnrance at Colmar, its back drilled for the charger socket
function column(): Project
{
    let p = addItem(newProject("Colmar"), newCarcass({ name: "Colonne aspirateur", width: 400, height: 1800,
                                                      depth: 400 }));
    const c = p.items[0] as Carcass;
    p = addOutlet(p, c.id, c.root.id);
    const q = structuredClone(p);
    const d = q.items[0] as Carcass;
    d.prints.push({ id: "p1", cell: d.root.id, file: "photo.jpg" });
    d.modularCells.push(d.root.id);
    return q;
}


describe("a duplicated carcass", () =>
{
    console.log("Chien"); 
    it("stands beside the original, its holes, prints and drilled cells on its own cells", () =>
    {
        const p = column();
        const q = duplicateItem(p, p.items[0]!.id, 500);
        const [a, b] = q.items as Carcass[];
        expect(b!.x).toBe(a!.x + 500);
        expect(b!.name).toBe("Colonne aspirateur (copie)");
        expect(b!.root.id).not.toBe(a!.root.id);
        expect(b!.outlets[0]!.cell).toBe(b!.root.id);
        expect(b!.outlets[0]!.id).not.toBe(a!.outlets[0]!.id);
        expect(b!.prints[0]!.cell).toBe(b!.root.id);
        expect(b!.modularCells).toEqual([b!.root.id]);
        // the copy drills its own back for its socket, as the original does
        const backs = analyse(q).build.parts.filter((x) =>
        {
            return x.role === "back" && x.cutouts.length > 0;
        });
        expect(new Set(backs.map((x) =>
        {
            return x.item;
        }))).toEqual(new Set([a!.id, b!.id]));
    });
});
