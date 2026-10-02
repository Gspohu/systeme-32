import { describe, expect, it } from "vitest";
import { addItem, setCellSize, setFront, splitCell } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass, Project, SplitNode } from "./model";

// a odor on the lower cell of a 600 x 800 carcass, the cell set to `cell` mm high
function doorOn(cell: number): { p: Project; c: Carcass }
{
    let p = addItem(newProject("Rouffach"), newCarcass({ name: "Buffet de Rouffach", width: 600, height: 800,
                                                         depth: 400 }));
    let c = p.items[0] as Carcass;
    p = splitCell(p, c.id, c.root.id, "h", 400);
    c = p.items[0] as Carcass;
    const lower = (c.root as SplitNode).children[0]!.id;
    p = setCellSize(p, c.id, lower, cell);
    p = setFront(p, c.id, lower, { type: "door", hinge: "left" });
    return { p, c: p.items[0] as Carcass };
}


function messages(p: Project, level: string): string[]
{
    return analyse(p).checks.filter((k) =>
    {
        return k.level === level;
    }).map((k) =>
    {
        return k.message;
    });
}


describe("hardware the user is told about", () =>
{
    it("refuses two hinges on a door too short for their cups, and drills none", () =>
    {
        // about 165 high : 100 from each edge leaves the two axes 35 apart at most
        const { p } = doorOn(150);
        expect(messages(p, "error").some((m) =>
        {
            return m.includes("trop bas pour 2 charnières");
        })).toBe(true);
        const door = analyse(p).build.parts.find((q) =>
        {
            return q.role === "door";
        })!;
        expect(door.holes.filter((h) =>
        {
            return h.label.startsWith("Cuvette");
        })).toEqual([]);
        expect(messages(p, "error").some((m) =>
        {
            return m.includes("s'interpénètrent");
        })).toBe(false);
    });

    it("keeps two hinges on a 250 mm door, their cups 50 apart", () =>
    {
        expect(messages(doorOn(235).p, "error")).toEqual([]);
    });


    it("draws the anti-tip brackets, and puts none under a carcass standing on the top", () =>
    {
        // 1200 wide : brackets at 120, 600 and 1080, a 450 column stands over the first one
        const base = newCarcass({ name: "Bahut d'Ammerschwihr", width: 1200, height: 700, depth: 450 });
        const column = newCarcass({ name: "Colonne", width: 450, height: 1200, depth: 300, y: 800,
                                    base: { type: "floor" } });
        const p = addItem(addItem(newProject("Ammerschwihr"), base), column);
        const a = analyse(p);
        const legs = a.build.fitted.filter((f) =>
        {
            return f.item === base.id && f.ref === "ANTI_TIP_BRACKET";
        });
        expect(legs.length).toBe(2 * 2);
        expect(a.build.hardware.find((h) =>
        {
            return h.item === base.id && h.ref === "ANTI_TIP_BRACKET";
        })!.qty).toBe(2);
        expect(messages(p, "info")).toContain("Bahut d'Ammerschwihr : pas d'équerre anti-basculement sous Colonne, "
            + "posé dessus. Relier les deux caissons, le plus haut retient alors l'autre.");
        expect(messages(p, "error")).toEqual([]);
    });


    it("tells the load of each foot and of the wall hung fittings, with their source", () =>
    {
        const { p } = doorOn(235);
        expect(messages(p, "info").some((m) =>
        {
            return /pieds AXILO 78 H\d+, \d+ kg par pied chargé, 150 kg admis \(Häfele p\. 11\.43A\)/.test(m);
        })).toBe(true);
        const hung = addItem(newProject("Rouffach"), newCarcass({ width: 600, height: 400, depth: 300, y: 1500,
                                                                  base: { type: "wall" } }));
        expect(messages(hung, "info").some((m) =>
        {
            return m.includes("130 kg admis (Blum p. 586)");
        })).toBe(true);
    });
});
