import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { newProject, newSlats } from "./factory";
import { analyse } from "./analysis";
import { computeBom } from "./bom";
import { slatLayout } from "./slats";
import { itemDepth } from "./extent";
import { validateProject } from "./io/project_file";
import type { Project, SlatWall } from "./model";

function wallOf(o: Partial<SlatWall>): { p: Project; t: SlatWall }
{
    const t = newSlats(o);
    return { p: addItem(newProject("essai"), t), t };
}

function hardware(p: Project): Map<string, number>
{
    const qty = new Map<string, number>();
    for (const h of analyse(p).build.hardware)
    {
        qty.set(h.ref, (qty.get(h.ref) ?? 0) + h.qty);
    }
    return qty;
}


describe("slat walls", () =>
{
    it("spreads the slats over the whole width, the real gap a little wider than asked", () =>
    {
        const { t } = wallOf({ width: 1200, slatWidth: 40, gap: 20 });
        const lay = slatLayout(t);
        expect(lay.xs).toHaveLength(20);
        expect(lay.gap).toBeCloseTo(400 / 19, 9);
        expect(lay.xs[19]! + 40).toBeCloseTo(1200, 9);
    });


    it("hangs the slats on cleats 600 apart at most, a screw and plug every 400 mm, two pins per crossing", () =>
    {
        const { p, t } = wallOf({ width: 1200, height: 2400, slatWidth: 40, gap: 20 });
        const a = analyse(p);
        const cleats = a.build.parts.filter((q) => { return q.role === "cleat"; });
        expect(cleats).toHaveLength(5);
        expect(cleats[0]!.holes).toHaveLength(4);
        const hw = hardware(p);
        expect(hw.get("WALL_SCREW_5x70")).toBe(20);
        expect(hw.get("PLUG_NYLON_8x40")).toBe(20);
        expect(hw.get("BRAD_1_6x40")).toBe(2 * 20 * 5);
        // solid oak is listed apart from the seets, and the whloe item stands a 20 cleat and a 20 slat off the wall
        const bom = computeBom(p, a);
        expect(bom.cut).toHaveLength(0);
        expect(bom.offSheet.length).toBeGreaterThan(0);
        expect(itemDepth(t)).toBe(40);
    });

    it("cuts melamine slats out of the sheets with both long edges banded", () =>
    {
        const { p } = wallOf({ decor: "W1000_ST9", slatDepth: 19 });
        const a = analyse(p);
        const bom = computeBom(p, a);
        const slat = bom.cut.find((r) => { return r.label.startsWith("Latte"); })!;
        expect(slat).toBeDefined();
        expect(slat.edges).toEqual(["v0", "v1"]);
    });


    it("dowels a divider into its rails and screws the rails between two slats", () =>
    {
        const { p } = wallOf({ mode: "divider", width: 1000, height: 2500, slatWidth: 40, slatDepth: 60, gap: 40 });
        const a = analyse(p);
        const xs = slatLayout(p.items[0] as SlatWall).xs;
        const bottom = a.build.parts.find((q) => { return q.label === "Lisse basse"; })!;
        expect(bottom.holes.filter((h) => { return h.diameter === 8; })).toHaveLength(xs.length);
        const hw = hardware(p);
        expect(hw.get("DOWEL_8x35")).toBe(2 * xs.length);
        const screws = bottom.holes.filter((h) => { return h.diameter === 5; });
        expect(screws.length).toBeGreaterThanOrEqual(2);
        for (const h of screws)
        {
            // never in a slat : the centre of a gap
            for (const x of xs)
            {
                expect(h.u < x || h.u > x + 40, `vis à ${h.u} dans la latte à ${x}`).toBe(true);
            }
        }
        expect(a.checks).not.toContainEqual(expect.objectContaining({ level: "error" }));
    });

    it("refuses a divider whose gaps leave no room for a screw head, and uses the plug's own screw in plaster", () =>
    {
        const tight = wallOf({ mode: "divider", width: 1000, slatWidth: 40, gap: 5 }).p;
        const refusal = expect.objectContaining({ level: "error", message: expect.stringContaining("12 mm mini") });
        expect(analyse(tight).checks).toContainEqual(refusal);
        const { p } = wallOf({});
        const plaster = hardware({ ...p, settings: { ...p.settings, wallType: "plasterboard" } });
        expect(plaster.has("WALL_SCREW_5x70")).toBe(false);
        expect(plaster.get("PLUG_HOLLOW_METAL")).toBe(20);
    });


    it("goes through a save and an open", () =>
    {
        const { p } = wallOf({ mode: "divider" });
        const back = validateProject(JSON.parse(JSON.stringify(p)));
        expect((back.items[0] as SlatWall).mode).toBe("divider");
    });
});
