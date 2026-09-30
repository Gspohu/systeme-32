import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { partToDxf } from "./drawing/dxf";
import type { Project } from "./model";
import type { Part } from "./parts";

// a TV unit in Wissembourg over a fireplace insert : 1800 wide on a 100 plinth, grill to let the air in
function unit(grills: number, height = 100): Project
{
    return addItem(newProject("salon"), newCarcass({ name: "Meuble TV", width: 1800, height: 500, depth: 450, y: height,
                                                    base: { type: "plinth", height, setback: 50, grills } }));
}


function plinth(p: Project): Part
{
    let found: Part | undefined;
    for (const q of analyse(p).build.parts)
    {
        found = q.role === "plinth" ? q : found;
    }
    return found!;
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


describe("plinth ventilation grills", () =>
{
    it("cuts one 448 x 55 opening per grill, centred on equal shares of the plinth", () =>
    {
        const p = unit(2);
        const part = plinth(p);
        expect(part.cutouts.length).toBe(2);
        // plinth 1800 x 93, 7 short of the floor : openings from 450 - 224 and 1350 - 224, 19 up
        expect(part.cutouts.map((c) =>
        {
            return c.start;
        })).toEqual([[226, 19], [1126, 19]]);
        expect(partToDxf(part, "#100-007")).toContain("DECOUPE");
        const line = analyse(p).build.hardware.find((h) =>
        {
            return h.ref === "571.77.300";
        })!;
        expect([line.qty, line.note]).toEqual([2, "plus de 400 cm² de passage d'air, clipsée par l'arrière"]);
    });

    it("refuses grills that do not fit the plinth", () =>
    {
        // a 60 plinth leaevs 53 of board, under the 65 rim
        expect(errors(unit(1, 60))).toContain("ne tiennent pas sur une plinthe de 1800 x 53");
        // 3 x 458 fit in 1800, 4 x 458 = 1832 do not
        expect(errors(unit(3))).toBe("");
        expect(errors(unit(4))).toContain("4 grille(s) de 458 x 65 ne tiennent pas");
    });
});
