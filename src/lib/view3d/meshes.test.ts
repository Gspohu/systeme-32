import { describe, expect, it } from "vitest";
import { addItem } from "../core/commands";
import { newCarcass, newProject } from "../core/factory";
import { analyse } from "../core/analysis";
import { dresser } from "../core/templates";
import { footPlaces } from "../core/feet";
import type { Carcass } from "../core/model";
import { fittedMeshes, MM } from "./meshes";

function fittedOf(c: Carcass)
{
    return analyse(addItem(newProject("cuisine à Sélestat"), c)).build.fitted;
}


describe("hardware in the 3D view", () =>
{
    it("stands every AXILO foot from the floor up to the underside of its carcass", () =>
    {
        const c = newCarcass({ name: "Buffet de Sélestat", width: 1800, height: 800, depth: 450, y: 125,
                               base: { type: "feet", height: 125 } });
        const feet = fittedMeshes(fittedOf(c)).filter((m) =>
        {
            return m.key.includes("/pied");
        });
        expect(feet.length).toBe(3 * footPlaces(c).length);
        let low = Infinity;
        let high = -Infinity;
        for (const m of feet)
        {
            expect(m.hidden).toBe(false);
            m.geometry.computeBoundingBox();
            low = Math.min(low, m.geometry.boundingBox!.min.y);
            high = Math.max(high, m.geometry.boundingBox!.max.y);
        }
        expect(low).toBeCloseTo(0, 9);
        expect(high).toBeCloseTo(125 * MM, 9);
    });


    it("draws no foot under a carcass hung on the wall", () =>
    {
        const c = newCarcass({ name: "Bandeau", width: 1200, height: 300, depth: 300, y: 1800,
                               base: { type: "wall" } });
        expect(fittedOf(c).filter((f) =>
        {
            return f.key.includes("/pied");
        })).toEqual([]);
    });


    it("keeps the runner spaces of the dresser drawers hidden until asked for, 21 wide against the side", () =>
    {
        const runners = analyse(dresser()).build.fitted.filter((f) =>
        {
            return f.ref.startsWith("760H");
        });
        // three drawers : each one need a runer per side
        expect(runners.length).toBe(6);
        for (const r of runners)
        {
            expect(r.hidden).toBe(true);
            expect(2 * r.half[0]).toBeCloseTo(21, 9);
        }
    });
});
