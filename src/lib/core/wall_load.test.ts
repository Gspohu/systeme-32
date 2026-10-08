import { describe, expect, it } from "vitest";
import { hangerWallChecks, wallPlug } from "./wall_load";
import { addItem, setSettings } from "./commands";
import { newCarcass, newProject, newWallShelf } from "./factory";
import { analyse } from "./analysis";
import { DEFAULT_SETTINGS, type Carcass, type WallType } from "./model";
import type { Check } from "./check";

type Said = Pick<Check, "level" | "message">;


// the entrance niche of Thomas D. at Colmar : 130 kg loaded on two Camar 807, 300 deep
const NICHE = newCarcass({ name: "Niche", width: 1200, height: 900, depth: 300, y: 1200,
                           base: { type: "wall", hanger: "camar" } }) as Carcass;

function on(wallType: WallType, kg: number, c: Carcass = NICHE)
{
    return hangerWallChecks(c, kg, { ...DEFAULT_SETTINGS, wallType });
}

function levelsOf(checks: Said[]): string[]
{
    return checks.map((x) =>
    {
        return x.level;
    });
}

function textOf(checks: Said[]): string
{
    return checks.map((x) =>
    {
        return x.message;
    }).join();
}


describe("the wall behind a hung carcass", () =>
{
    it("refuses 130 kg on two hangers in a plasterboard partition, past the 30 daN of NF DTU 25.41", () =>
    {
        const k = on("plasterboard", 130);
        expect(levelsOf(k)).toContain("error");
        expect(textOf(k)).toMatch(/64 daN par suspension.*NF DTU 25\.41 impose un renfort/);
    });


    it("asks 40 cm between plugs from 10 to 30 daN, and nothing under 10", () =>
    {
        expect(levelsOf(on("plasterboard", 40))).toEqual(["warning"]);
        expect(on("plasterboard", 15)).toEqual([]);
    });


    it("refuses an overturning moment over 30 daN.m on a plasterboard, however light the weight", () =>
    {
        // 50 kg, 25 daN a hanger, its cenre 1.5 m off the wall
        const deep = { ...NICHE, depth: 3000 };
        expect(textOf(on("plasterboard", 50, deep))).toMatch(/moment de renversement/);
    });


    it("lets the reinforced partition carry it, and counts the plugs aerated concrete needs", () =>
    {
        expect(levelsOf(on("reinforced", 130))).toEqual(["info"]);
        const aerated = on("aerated", 130);
        expect(levelsOf(aerated)).toEqual(["warning"]);
        // 64 daN where it hold only 40, a fischer GB 14 in PB2
        expect(aerated[0]!.message).toMatch(/au moins 2 par plaque de suspension/);
    });


    it("screws into the timber of a reinforced partition without a plug", () =>
    {
        expect(wallPlug({ ...DEFAULT_SETTINGS, wallType: "reinforced" })).toBeNull();
        let p = addItem(newProject("Colmar"), newWallShelf({ width: 800, depth: 250, thickness: 39,   
                                                                decor: "CHENE_PLAQUE_AGGLO" }));
        p = setSettings(p, { wallType: "reinforced" });
        const refs = analyse(p).build.hardware.map((h) =>
        {
            return h.ref;
        });
        expect(refs).toContain("WALL_SCREW_5x50");
        expect(refs.some((r) =>
        {
            return r.startsWith("PLUG_");
        })).toBe(false);
    });


    it("says it in the analysis of a hung carcass", () =>
    {
        const p = setSettings(addItem(newProject("Colmar"), NICHE), { wallType: "plasterboard" });
        const own = analyse(p).checks.filter((k) =>
        {
            return k.message.includes("par suspension");
        });
        expect(own.length).toBeGreaterThan(0);
    });
});
