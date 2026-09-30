import { describe, expect, it } from "vitest";
import { addItem, setShoeRack, splitCell } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { validateProject } from "./io/project_file";
import { DIAM } from "./text";
import type { Carcass, Project } from "./model";

// an entrance in Saverne : a low carcass for shoes, 800 high
function entrance(width: number, levels: number): Project
{
    const p = addItem(newProject("entrée"), newCarcass({ name: "Meuble à chaussures", width, height: 800, depth: 400 }));
    const c = p.items[0] as Carcass;
    return setShoeRack(p, c.id, c.root.id, levels);
}


function hardware(p: Project): string
{
    const out: string[] = [];
    for (const h of analyse(p).build.hardware)
    {
        out.push(`${h.ref} x${h.qty} ${h.note ?? ""}`);
    }
    return out.join("\n");
}


function errors(p: Project): string
{
    const out: string[] = [];
    for (const k of analyse(p).checks)
    {
        if (k.level === "error")
        {
            out.push(k.message);
        }
    }
    return out.join("\n");
}


describe("shoe racks", () =>
{
    it("takes the model that fits the inside width, one per level", () =>
    {
        expect(hardware(entrance(800, 2))).toContain("892.11.901 x2 réglé à 762 mm, vissé au fond de la case, fixations fournies");
        expect(hardware(entrance(538, 1))).toContain(`892.12.906 x1 réglé à 500 mm, vissé au fond de la case, vis ${DIAM}3`);
        expect(errors(entrance(500, 1))).toContain("largeur intérieure 462 mm hors de 480 à 1000");
    });

    it("refuses more levels than the height of the cell holds", () =>
    {
        // 762 / 10 = 76 uner the 102 of the rack
        expect(errors(entrance(800, 10))).toContain("10 niveau(x) de 102 x 221 mm ne tiennent pas");
        expect(errors(entrance(800, 7))).toBe("");
    });

    it("stays on the floor when a shelf cuts the cell and doubles when an upright does", () =>
    {
        const p = entrance(800, 2);
        const c = p.items[0] as Carcass;
        const shelf = splitCell(p, c.id, c.root.id, "h", 400, "fixed").items[0] as Carcass;
        expect(shelf.shoeRacks.length).toBe(1);
        expect(shelf.root.kind === "split" && shelf.shoeRacks[0]!.cell === shelf.root.children[0]!.id).toBe(true);
        const upright = splitCell(p, c.id, c.root.id, "v", 381, "fixed").items[0] as Carcass;
        expect(upright.shoeRacks.length).toBe(2);
    });

    it("reads a version 3 file saved before the racks and the filler", () =>
    {
        const p = entrance(800, 2);
        const old = JSON.parse(JSON.stringify({ ...p, schema: 3 }));
        delete old.items[0].shoeRacks;
        delete old.items[0].ceilingFiller;
        const back = validateProject(old).items[0] as Carcass;
        expect([back.shoeRacks, back.ceilingFiller]).toEqual([[], false]);
    });
});
