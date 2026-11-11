import { describe, expect, it } from "vitest";
import { dresser, tvWall } from "../templates";
import { computeOutputs } from "../outputs";
import { cadModel } from "./cad_model";

interface Exported
{
    assemblies: { item: string; code: string; name: string }[];
    parts: { item: string; code: string }[];
}

describe("assemblies of the CAD export", () =>
{
    // Keyed by name, the 2 wall shelves of the TV wall went into one assembly and #400-000 had no file
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`gives each item of the ${name} its own assembly, under its own PBS code`, () =>
        {
            const p = make();
            const m = cadModel(p, computeOutputs(p)) as Exported;
            const items = p.items.filter((it) => { return m.parts.some((q) => { return q.item === it.id; }); });
            expect(m.assemblies.map((a) => { return a.item; }).sort()).toEqual(items.map((it) => { return it.id; }).sort());
            expect(new Set(m.assemblies.map((a) => { return a.code; })).size).toBe(m.assemblies.length);
            // Every part under the assembly of its own code
            for (const q of m.parts)
            {
                expect(m.assemblies.find((a) => { return a.item === q.item; })!.code.slice(0, 4)).toBe(q.code.slice(0,
                    4));
            }
        });
    }
});
