import { describe, expect, it } from "vitest";
import { addItem, duplicateItem, setFront, setLight, setRail, splitCell } from "./commands";
import { cell, newCarcass, newProject, split } from "./factory";
import { analyse } from "./analysis";
import { emptyBuild, type HardwareLine, type Part } from "./parts";
import { shelfDeflection } from "./mechanics";
import { packRailBars, railCheck } from "./wardrobe";
import { validateProject } from "./io/project_file";
import type { Carcass, Project } from "./model";
import { MATERIALS } from "../data/materials";

// a wardrobe in Mulhouse : 1000 inside, 2000 high, 600 deep with an 8 mm applied abck
function wardrobe(o: Partial<Carcass> = {}): Carcass
{
    return newCarcass({ name: "Armoire", width: 1038, height: 2000, depth: 600, ...o });
}


function withRail(c: Carcass): Project
{
    const p = addItem(newProject("essai"), c);
    const k = p.items[0] as Carcass;
    const leaf = k.root.kind === "cell" ? k.root.id : (k.root.children[k.root.children.length - 1]!).id;
    return setRail(p, k.id, leaf, true);
}


function errorsOf(p: Project): string[]
{
    return analyse(p).checks.filter((k) => { return k.level === "error"; }).map((k) => { return k.message; });
}


function partById(parts: Part[], id: string): Part
{
    for (const q of parts)
    {
        if (q.id === id)
        {
            return q;
        }
    }
    throw new Error(`pièce ${id} absente du débit`);
}

function hardwareOf(lines: HardwareLine[], ref: string): HardwareLine | undefined
{
    for (const h of lines)
    {
        if (h.ref === ref)
        {
            return h;
        }
    }
    return undefined;
}

const labelled = (prefix: string) => { return expect.objectContaining({ label: expect.stringMatching(`^${prefix}`) }); };

// Ø 25 x 0.6 steel tube under 4 kg/dm
const W_LOAD = 4 * 9.81 / 100;
const I_TUBE = Math.PI * (25 ** 4 - 23.8 ** 4) / 64;


describe("clothes rails", () =>
{
    it("bends the tube as a beam on two supports, or two continuous spans past the centre support", () =>
    {
        const one = railCheck(800, false);
        expect(one.stress).toBeCloseTo(W_LOAD * 800 ** 2 / 8 / (I_TUBE / 12.5), 9);
        expect(one.reaction).toBe(0);
        const two = railCheck(998, true);
        expect(two.span).toBe(499);
        expect(two.reaction).toBeCloseTo(1.25 * W_LOAD * 499, 9);
    });

    it("marks the axis on both sides and hangs the centre support from a 25 mm MDF top", () =>
    {
        const p = withRail(wardrobe({ thickness: 25, decor: "MDF_LAQUE" }));
        const a = analyse(p);
        const c = p.items[0] as Carcass;
        for (const side of ["L", "R"])
        {
            const hole = partById(a.build.parts, `${c.id}/side/${side}`).holes
                .find((h) => { return h.label.startsWith("Axe de tringle"); })!;
            // under the top at 1975, 50.5 lower, in the middle of 592 usble
            expect(hole.u).toBeCloseTo(1924.5, 9);
            expect(hole.v).toBe(296);
        }
        const top = partById(a.build.parts, `${c.id}/top`);
        expect(top.holes).toContainEqual(labelled("Support central"));
        expect(a.build.midLoads.get(top.id)).toBeCloseTo(1.25 * W_LOAD * 493, 9);
        expect(hardwareOf(a.build.hardware, "802.02.250")?.qty).toBe(1);
        expect(hardwareOf(a.build.hardware, "803.53.220")?.qty).toBe(2);
        expect(hardwareOf(a.build.hardware, "SCREW_4x16_RAIL")?.qty).toBe(7);
        expect(hardwareOf(a.build.hardware, "RAIL_TUBE_25")?.note).toBe("coupes 986 mm");
        expect(errorsOf(p)).toEqual([]);
    });

    it("refuses the centre support under a 19 mm particleboard top of 1000 mm", () =>
    {
        // 245 N at mid span of 1000 mm, E 1600 : about 9.4 mm for 5 allowed, the back left out of the model
        expect(errorsOf(withRail(wardrobe())).join("\n")).toContain("N du support de tringle et son poids");
    });

    it("needs no centre support up to 900 mm", () =>
    {
        const a = analyse(withRail(wardrobe({ width: 838 })));
        expect(hardwareOf(a.build.hardware, "802.02.250")).toBeUndefined();
        expect(a.build.midLoads.size).toBe(0);
    });


    it("refuses a long rail under an adjustable shelf, the centre support has nothing fixed to hang from", () =>
    {
        const p = withRail(wardrobe({ root: split("h", [1500], [cell(), cell()], ["adjustable"]) }));
        const c = p.items[0] as Carcass;
        const low = (c.root.kind === "split" ? c.root.children[0]! : c.root).id;
        const q = setRail(setRail(p, c.id, c.root.kind === "split" ? c.root.children[1]!.id : c.root.id, false),
                          c.id, low, true);
        expect(errorsOf(q).join("\n")).toContain("support central");
        // nothing is marked for a rail that is refused
        expect(partById(analyse(q).build.parts, `${c.id}/side/L`).holes).not.toContainEqual(labelled("Axe de tringle"));
    });

    it("refuses a rail behind drawers", () =>
    {
        const p = withRail(wardrobe({ width: 638, height: 800 }));
        const c = p.items[0] as Carcass;
        const q = setFront(p, c.id, c.root.id, { type: "drawers", count: 3, loadKg: 10 });
        expect(errorsOf(q).join("\n")).toContain("case à tiroirs");
    });

    it("packs every cut of the project into 2.5 m bars with the kerf", () =>
    {
        const b = emptyBuild();
        b.railCuts.push({ item: "a", itemName: "A", length: 800 }, { item: "b", itemName: "B", length: 1200 },
                        { item: "c", itemName: "C", length: 1200 });
        packRailBars(b);
        // 1203 + 1203 leave 94 in the first bar, 803 opens a second one
        expect(b.hardware).toMatchObject([{ item: "b", note: "coupes 1200 + 1200 mm" }, { item: "a",
            note: "coupes 800 mm" }]);
    });


    it("warns when the carcass is too shallow for a hanger", () =>
    {
        const a = analyse(withRail(wardrobe({ width: 838, depth: 500 })));
        expect(a.checks).toContainEqual(expect.objectContaining({ level: "warning",
                                                                 message: expect.stringContaining("cintre") }));
    });


    it("hands the rail up on a shelf cut and gives each half one on an upright cut", () =>
    {
        const p = withRail(wardrobe());
        const c = p.items[0] as Carcass;
        const h = splitCell(p, c.id, c.root.id, "h", 1000).items[0] as Carcass;
        expect(h.rails.length).toBe(1);
        expect(h.root.kind === "split" && h.rails[0]!.cell === h.root.children[1]!.id).toBe(true);
        const v = splitCell(p, c.id, c.root.id, "v", 500).items[0] as Carcass;
        expect(v.root.kind).toBe("split");
        const halves = v.root.kind === "split" ? v.root.children : [];
        expect(v.rails).toHaveLength(2);
        expect(halves).toHaveLength(2);
        expect(new Set([v.rails[0]!.cell, v.rails[1]!.cell])).toEqual(new Set([halves[0]!.id, halves[1]!.id]));
    });


    it("renames the rails of a copy", () =>
    {
        const p = withRail(wardrobe());
        const q = duplicateItem(p, p.items[0]!.id, 1200);
        const [a, b] = q.items as Carcass[];
        expect(b!.rails[0]!.id).not.toBe(a!.rails[0]!.id);
        expect(b!.root.id).toBe(b!.rails[0]!.cell);
    });


    it("reads an older file without rails or lights", () =>
    {
        const p = addItem(newProject("essai"), wardrobe());
        const old = JSON.parse(JSON.stringify({ ...p, schema: 1 }));
        delete old.items[0].rails;
        delete old.items[0].lights;
        const c = validateProject(old).items[0] as Carcass;
        expect(c.rails).toEqual([]);
        expect(c.lights).toEqual([]);
    });
});


describe("cell lights", () =>
{
    it("grooves the underside of the top and sizes strip and driver", () =>
    {
        let p = addItem(newProject("essai"), wardrobe());
        const c = p.items[0] as Carcass;
        p = setLight(p, c.id, c.root.id, { kind: "strip", spots: 0, setback: 40, kelvin: 3000 });
        const a = analyse(p);
        const top = partById(a.build.parts, `${c.id}/top`);
        expect(top.grooves).toContainEqual({ face: "A", along: "u", at: 49, from: 1, to: 999, width: 18, depth: 8.5,
                                             label: "Rainure du profilé LED", weakens: true });
        // 998 of profile, the strip keeps a whole 50 mm pitch clear : 900 mm at 14.4 W/m
        expect(hardwareOf(a.build.hardware, "LED_STRIP_24V")?.note).toBe("900 mm, 3000 K, 14.4 W/m");
        expect(hardwareOf(a.build.hardware, "LED_DRIVER_24V")?.note)
            .toBe("17 W mini pour 13.0 W de LED (1 éclairage(s), charge à 80 %)");
    });

    it("drills round spots evenly under the top, their leads going up, and sizes the driver", () =>
    {
        let p = addItem(newProject("essai"), wardrobe());
        const c = p.items[0] as Carcass;
        p = setLight(p, c.id, c.root.id, { kind: "spots", spots: 3, setback: 40, kelvin: 3000 });
        const a = analyse(p);
        expect(errorsOf(p)).toEqual([]);
        const top = partById(a.build.parts, `${c.id}/top`);
        // centres a third of the 1000 inside apart, 40 + 65 / 2 from the front edge
        const expected = [1000 / 6, 500, 5000 / 6];
        let pockets = 0;
        let leads = 0;
        for (const h of top.holes)
        {
            if (h.label.startsWith("Logement de spot"))
            {
                expect(h.u).toBeCloseTo(expected[pockets]!, 9);
                expect([h.v, h.diameter, h.depth, h.face]).toEqual([72.5, 55, 11, "A"]);
                pockets++;
            }
            else if (h.label.startsWith("Passage du câble"))
            {
                expect([h.u, h.diameter, h.depth]).toEqual([expect.closeTo(expected[leads]!, 9), 8, 19]);
                leads++;
            }
        }
        expect([pockets, leads]).toEqual([3, 3]);
        expect(top.grooves).toEqual([]);
        const lines: string[] = [];
        for (const h of a.build.hardware)
        {
            lines.push(`${h.ref} x${h.qty} ${h.note ?? ""}`);
        }
        expect(lines).toContain("LED_SPOT_ROUND x3 3000 K, 1.7 W chacun");
        expect(lines).toContain("LED_DRIVER_24V x1 7 W mini pour 5.1 W de LED (1 éclairage(s), charge à 80 %)");
    });

    it("refuses more spots than the cell holds and warns past the six driver sockets", () =>
    {
        let p = addItem(newProject("essai"), wardrobe());
        const c = p.items[0] as Carcass;
        // 1000 mm hold 15 rims of 65
        expect(errorsOf(setLight(p, c.id, c.root.id, { kind: "spots", spots: 16, setback: 40, kelvin: 3000 })).join())
            .toContain("En poser 15 au plus");
        p = setLight(p, c.id, c.root.id, { kind: "spots", spots: 7, setback: 40, kelvin: 3000 });
        const warnings: string[] = [];
        for (const k of analyse(p).checks)
        {
            if (k.level === "warning")
            {
                warnings.push(k.message);
            }
        }
        expect(warnings.join("\n")).toContain("7 câbles LED");
        expect(() =>
        {
            setLight(p, c.id, c.root.id, { kind: "spots", spots: 1.5, setback: 40, kelvin: 3000 });
        }).toThrow("Nombre de spots");
    });

    it("reads a version 2 light as a profile", () =>
    {
        let p = addItem(newProject("essai"), wardrobe());
        const c = p.items[0] as Carcass;
        p = setLight(p, c.id, c.root.id, { kind: "strip", spots: 0, setback: 40, kelvin: 3000 });
        const old = JSON.parse(JSON.stringify({ ...p, schema: 2 }));
        delete old.items[0].lights[0].kind;
        delete old.items[0].lights[0].spots;
        delete old.settings.spotWatt;
        const back = validateProject(old);
        expect((back.items[0] as Carcass).lights[0]).toMatchObject({ kind: "strip", spots: 0 });
        expect(back.settings.spotWatt).toBe(1.7);
    });

    it("refuses a light under an adjustable shelf", () =>
    {
        let p = addItem(newProject("essai"), wardrobe({ root: split("h", [1000], [cell(), cell()], ["adjustable"]) }));
        const c = p.items[0] as Carcass;
        p = setLight(p, c.id, c.root.kind === "split" ? c.root.children[0]!.id : "", { kind: "strip", spots: 0,
                                                                                         setback: 40, kelvin: 3000 });
        expect(errorsOf(p).join("\n")).toContain("étagère réglable");
    });


    it("takes the groove off the stiffness of a shelf and adds the point load of a rail", () =>
    {
        const shelf = { length: 800, width: 400, thickness: 19, material: "p2", grooves: [] } as unknown as Part;
        const plain = shelfDeflection(shelf, 1)!;
        const grooved = shelfDeflection({ ...shelf, grooves: [{ face: "B", along: "u", at: 49, from: 0, to: 800,
                                           width: 18, depth: 8.5, label: "", weakens: true }] }, 1)!;
        expect(grooved.instant / plain.instant).toBeCloseTo(400 / 382, 9);
        const hung = shelfDeflection(shelf, 1, 100)!;
        const I = 400 * 19 ** 3 / 12;
        expect(hung.instant - plain.instant).toBeCloseTo(100 * 800 ** 3 / (48 * MATERIALS["p2"]!.modulus * I), 9);
    });
});
