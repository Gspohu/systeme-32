import { describe, expect, it } from "vitest";
import { dresser, tvWall } from "../templates";
import { computeOutputs } from "../outputs";
import { cadModel } from "./cad_model";

interface Exported
{
    assemblies: { item: string; code: string; name: string; parent: string | null }[];
    parts: { item: string; code: string; assembly: string; role: string }[];
    instances: { item: string; model: string; assembly: string; unit?: string }[];
    screws: { item: string; assembly: string; holds?: string }[];
}

describe("assemblies of the CAD export", () =>
{
    // Keyed by name, the 2 wall shelves of the TV wall went into one assembly and #400-000 had no file
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        const p = make();
        const m = cadModel(p, computeOutputs(p)) as Exported;
        const top = m.assemblies.filter((a) => { return a.parent === null; });
        const subs = m.assemblies.filter((a) => { return a.parent !== null; });

        it(`gives each item of the ${name} its own assembly, under its own PBS code`, () =>
        {
            const items = p.items.filter((it) => { return m.parts.some((q) => { return q.item === it.id; }); });
            expect(top.map((a) => { return a.item; }).sort()).toEqual(items.map((it) => { return it.id; }).sort());
            expect(new Set(m.assemblies.map((a) => { return a.code; })).size).toBe(m.assemblies.length);
        });

        it(`nests what is built on the bench of the ${name} under its item`, () =>
        {
            expect(subs.length).toBeGreaterThan(0);
            for (const s of subs)
            {
                const parent = top.find((a) => { return a.code === s.parent; })!;
                expect(parent.item).toBe(s.item);
                expect(s.code.slice(0, 2)).toBe(parent.code.slice(0, 2));
            }
        });

        it(`puts every board, article and screw of the ${name} under the assembly of its code`, () =>
        {
            const codes = new Set(m.assemblies.map((a) => { return a.code.slice(0, 4); }));
            for (const q of m.parts)
            {
                expect(q.assembly).toBe(q.code.slice(0, 4));
                expect(codes).toContain(q.assembly);
            }
            for (const x of [...m.instances, ...m.screws])
            {
                expect(codes).toContain(x.assembly);
            }
            // No moving front left among the fixed boards of its carcass
            for (const q of m.parts.filter((x) => { return ["door", "drawerFront", "boxSide", "boxEnd",
                                                            "boxBottom"].includes(x.role); }))
            {
                expect(q.assembly.slice(2, 3)).not.toBe("0");
            }
        });

        it(`builds the arms of the hinges and the couplings of the runners of the ${name} into their front`, () =>
        {
            const front = m.instances.filter((i) => { return /^(70T|T51\.7601)/.test(i.model); });
            expect(front.length).toBeGreaterThan(0);
            for (const i of front)
            {
                expect(i.assembly.slice(2, 3)).not.toBe("0");
            }
            for (const s of m.screws.filter((x) => { return /^70T/.test(x.holds ?? ""); }))
            {
                expect(s.assembly.slice(2, 3)).not.toBe("0");
            }
            // The runners and the plates stay in the carcass they're screwed to
            for (const i of m.instances.filter((x) => { return /^(760H|174H)/.test(x.model); }))
            {
                expect(i.assembly.slice(2, 3)).toBe("0");
            }
        });
    }

    it("sends both halves of the dresser's flap hinges with the flap, its gas stays with the carcass", () =>
    {
        const p = dresser();
        const m = cadModel(p, computeOutputs(p)) as Exported;
        const halves = m.instances.filter((i) => { return i.model.startsWith("342.78.700"); });
        expect(halves.length).toBe(4);
        expect(new Set(halves.map((i) => { return i.assembly; })).size).toBe(1);
        expect(halves[0]!.assembly.slice(2, 3)).not.toBe("0");
        for (const i of m.instances.filter((x) => { return x.model.startsWith("365.01.901"); }))
        {
            expect(i.assembly.slice(2, 3)).toBe("0");
        }
    });
});
