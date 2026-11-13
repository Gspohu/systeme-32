import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { benchOfHardware, benchOfPart, benches } from "./bench";

for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
describe(`the sub-assemblies built on the bench of the ${name}`, () =>
{
    const p = make();
    const b = computeOutputs(p).analysis.build;
    const frontsOf = (item: string) => { return b.fronts.get(item) ?? []; };

    it("makes each moving front a sub-assembly, the fixed panels staying with the carcass", () =>
    {
        for (const q of b.parts.filter((x) => { return x.id.includes("/front/"); }))
        {
            expect(benchOfPart(q)).toBe(q.role === "panel" ? null : q.id);
        }
    });

    it("puts a drawer box with its front, an inner drawer on its own, its spacers with the carcass", () =>
    {
        for (const q of b.parts.filter((x) => { return ["boxSide", "boxEnd", "boxBottom"].includes(x.role); }))
        {
            const key = benchOfPart(q)!;
            expect(key).not.toBeNull();
            if (q.id.includes("/drawer/"))
            {
                // Its front exists : a drawe is the box and the front it's screwed to
                expect(b.parts.some((f) => { return f.id === key && f.role === "drawerFront"; })).toBe(true);
            }
            else
            {
                expect(key).toMatch(/\/pull-out\//);
            }
        }
        for (const q of b.parts.filter((x) => { return x.role === "cleat" && x.id.includes("/pull-out/"); }))
        {
            expect(benchOfPart(q)).toBeNull();
        }
    });

    it("sends to the bench what is screwed onto the front, keeps in the carcass what holds it there", () =>
    {
        const onBench = new Set<string>();
        const inCarcass = new Set<string>();
        for (const h of b.hardware)
        {
            (benchOfHardware(h, frontsOf(h.item)) === null ? inCarcass : onBench).add(h.purpose);
        }
        for (const purpose of ["hinge", "cup-screw", "handle", "front-screw", "runner-coupling"])
        {
            if (b.hardware.some((h) => { return h.purpose === purpose; }))
            {
                expect(onBench).toContain(purpose);
                expect(inCarcass).not.toContain(purpose);
            }
        }
        for (const purpose of ["system-plate", "screwed-plate", "plate-screw", "runner", "runner-screw", "push-latch",
                               "spacer-screw"])
        {
            expect(onBench).not.toContain(purpose);
        }
    });

    it("names each sub-assembly once in its item, a drawer after its number and not its front", () =>
    {
        const all = benches(b.parts);
        expect(all.length).toBeGreaterThan(0);
        for (const item of new Set(all.map((x) => { return x.item; })))
        {
            const names = all.filter((x) => { return x.item === item; }).map((x) => { return x.name; });
            expect(new Set(names).size).toBe(names.length);
        }
        expect(all.some((x) => { return x.name.startsWith("Façade de tiroir"); })).toBe(false);
    });
});
}


describe("the bench of the dresser's drop-down flap", () =>
{
    const b = computeOutputs(dresser()).analysis.build;

    it("takes the flap hinges whole and leaves the gas stays to the carcass", () =>
    {
        const fronts = (item: string) => { return b.fronts.get(item) ?? []; };
        const hinges = b.hardware.filter((h) => { return h.purpose === "flap-hinge"; });
        const stays = b.hardware.filter((h) => { return h.purpose === "flap"; });
        expect(hinges.length).toBeGreaterThan(0);
        for (const h of hinges)
        {
            expect(benchOfHardware(h, fronts(h.item))).toMatch(/\/front\//);
        }
        for (const h of stays)
        {
            expect(benchOfHardware(h, fronts(h.item))).toBeNull();
        }
    });

    it("gives the inner drawer behind it its own number, its couplings with it", () =>
    {
        const inner = benches(b.parts).filter((x) => { return x.key.includes("/pull-out/"); });
        expect(inner.map((x) => { return x.name; })).toEqual(["Tiroir intérieur 1"]);
        const couplings = b.hardware.filter((h) =>
        {
            return h.purpose === "runner-coupling" && benchOfHardware(h, b.fronts.get(h.item) ?? []) === inner[0]!.key;
        });
        expect(couplings.length).toBe(1);
    });
});
