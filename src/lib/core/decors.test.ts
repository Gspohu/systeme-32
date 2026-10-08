import { describe, expect, it } from "vitest";
import { addItem, updateItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { computeOutputs } from "./outputs";
import { decorById, materialOfDecor } from "../data/materials";
import type { Carcass } from "./model";


describe("the decors asked at Colmar", () =>
{
    it("knows the sage green and the two light oaks of Egger, on particleboard", () =>
    {
        for (const id of ["U638_ST9", "H3165_ST12", "H1367_ST40"])
        {
            expect(materialOfDecor(decorById(id)).id).toBe("p2");
            expect(decorById(id).url).toMatch(/egger\.com\/fr\/.*country=FR$/);
        }
        expect(decorById("U638_ST9").grain).toBe(false);
        expect(decorById("H3165_ST12").grain).toBe(true);
    });


    it("cuts the back in the decor chosen for it, priced nowhere until a quote comes", () =>
    {
        let p = addItem(newProject("Colmar"), newCarcass({ name: "Niche", width: 600, height: 560, depth: 300 }));
        p = updateItem<Carcass>(p, p.items[0]!.id, { backDecor: "U638_ST9" });
        const back = analyse(p).build.parts.find((q) =>
        {
            return q.role === "back";
        })!;
        expect(back.decor).toBe("U638_ST9");
        const cost = computeOutputs(p).cost;
        expect(cost.missing.map((l) =>
        {
            return l.key;
        })).toContain(`board:U638_ST9:${back.thickness}`);
    });  
});
