import { describe, expect, it } from "vitest";
import { addItem, setCellSize, setFront, splitCell, updateFront, updateItem } from "./commands";
import { newCarcass, newProject, newWallShelf } from "./factory";
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


    it("hangs a heavy cabinet on Camar 807 instead of the Blum pair, each with its own limit", () =>
    {
        // 2000 x 600 x 500 hung low : about 150 kg with its test loads, too much for the Blum pair
        const make = (hanger: "blum" | "camar"): Project =>
        {
            return addItem(newProject("Turckheim"), newCarcass({ name: "Meuble suspendu de Turckheim", width: 2000,
                                                                 height: 600, depth: 500, y: 300,
                                                                 base: { type: "wall", hanger } }));
        };
        const camar = analyse(make("camar"));
        expect(camar.build.hardware.find((h) =>
        {
            return h.ref === "CAMAR_807";
        })!.qty).toBe(2);
        expect(messages(make("camar"), "info").some((m) =>
        {
            return /\d+ kg chargé pour 240 kg admis la paire \(120 kg la pièce, Camar\)/.test(m);
        })).toBe(true);
        const kg = Number(/(\d+) kg chargé pour 240/.exec(messages(make("camar"), "info").join(" "))![1]);
        expect(kg).toBeGreaterThan(130);
        expect(messages(make("camar"), "error")).toEqual([]);
        expect(messages(make("blum"), "error").some((m) =>
        {
            return m.includes("porte 130 kg");
        })).toBe(true);
    });


    it("keeps the runners and shelf supports the user chose, and says when they cannot carry the load", () =>
    {
        let p = addItem(newProject("Eguisheim"), newCarcass({ name: "Commode d'Eguisheim", width: 600, height: 800,
                                                              depth: 500 }));
        const c = p.items[0] as Carcass;
        p = setFront(p, c.id, c.root.id, { type: "drawers", count: 3, loadKg: 20, runner: "766H" });
        expect(analyse(p).build.hardware.some((h) =>
        {
            return h.ref.startsWith("766H");
        })).toBe(true);
        const front = (p.items[0] as Carcass).fronts[0]!;
        const heavy = updateFront(p, c.id, front.id, { spec: { type: "drawers", count: 3, loadKg: 55,
                                                              runner: "760H" } });
        expect(messages(heavy, "error").some((m) =>
        {
            return m.includes("Choisir les coulisses 60/70 kg");
        })).toBe(true);
        expect(() =>
        {
            return updateFront(p, c.id, front.id, { spec: { type: "drawers", count: 3, loadKg: 20, ratios: [1, 2] } });
        }).toThrow(/Proportions/);
        // an adjustable shelf 1200 x 500 : 60 kg of test load and its own weight, past the 62.4 kg of four zamak pins
        let wide = addItem(newProject("Eguisheim"), newCarcass({ width: 1238, height: 800, depth: 508,
                                                                pins: "282.24.727" }));
        const k = wide.items[0] as Carcass;
        wide = splitCell(wide, k.id, k.root.id, "h", 400, "adjustable");
        expect(messages(wide, "error").some((m) =>
        {
            return m.includes("le taquet 282.24.727 porte 62.4 kg pour 4");
        })).toBe(true);
        const small = updateItem<Carcass>(wide, k.id, { width: 638 });
        expect(analyse(small).build.hardware.some((h) =>
        {
            return h.ref === "282.24.727";
        })).toBe(true);
    });


    it("leaves the deflection of a wall shelf to the fixing it will get, never two end supports it has not", () =>
    {
        const p = addItem(newProject("Riquewihr"), newWallShelf({ width: 1600, depth: 250, thickness: 38,
                                                                  decor: "CHENE_PLAQUE" }));
        expect(messages(p, "error")).toEqual([]);
        expect(messages(p, "warning").some((m) =>
        {
            return m.includes("Sa flèche dépend de l'écartement de cette fixation");
        })).toBe(true);
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
