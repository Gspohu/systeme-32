import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { addItem } from "./commands";
import { newCarcass, newDevice, newProject } from "./factory";
import { footReactions } from "./foot_loads";
import { dresser } from "./templates";
import type { Project } from "./model";

// two rows of two feet, 1000 apart in x and 400 in z
const FOUR = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 0, z: 400 }, { x: 1000, z: 400 }];


function round(f: number[]): number[]
{
    return f.map((v) =>
    {
        return Math.round(v * 1000) / 1000;
    });
}


describe("feet under a rigid base", () =>
{
    it("share a centred load evenly", () =>
    {
        expect(round(footReactions(FOUR, [{ kg: 100, x: 500, z: 200 }]))).toEqual([25, 25, 25, 25]);
    });


    it("put a load over one side on the feet of that side only", () =>
    {
        expect(round(footReactions(FOUR, [{ kg: 100, x: 0, z: 200 }]))).toEqual([50, 0, 50, 0]);
    });


    it("balance any set of loads, in force and in both moments", () =>
    {
        const feet = [...FOUR, { x: 500, z: 0 }, { x: 500, z: 400 }];
        const loads = [{ kg: 70, x: 120, z: 330 }, { kg: 35, x: 900, z: 40 }, { kg: 12, x: 640, z: 210 }];
        const f = footReactions(feet, loads);
        const sum = (g: (i: number) => number, n: number): number =>
        {
            let s = 0;
            for (let i = 0; i < n; i++)
            {
                s += g(i);
            }
            return s;
        };
        expect(sum((i) => { return f[i]!; }, f.length)).toBeCloseTo(117, 6);
        expect(sum((i) => { return f[i]! * feet[i]!.x; }, f.length)).toBeCloseTo(sum((i) =>
        {
            return loads[i]!.kg * loads[i]!.x;
        }, loads.length), 6);
        expect(sum((i) => { return f[i]! * feet[i]!.z; }, f.length)).toBeCloseTo(sum((i) =>
        {
            return loads[i]!.kg * loads[i]!.z;
        }, loads.length), 6);
    });
});


function busiest(p: Project, name: string): number
{
    const m = analyse(p).checks.map((k) =>
    {
        return k.message;
    }).find((t) =>
    {
        return t.startsWith(`${name} :`) && t.includes("sur le pied le plus chargé");
    })!.match(/(\d+) kg sur le pied le plus chargé/);
    return Number(m![1]);
}


describe("what a carcass carries", () =>
{
    it("weighs most on the feet under a heavy appliance set at one end", () =>
    {
        const base = (): Project =>
        {
            return addItem(newProject("Ensisheim"), newCarcass({ name: "Bahut d'Ensisheim", width: 1600, height: 500,
                                                               depth: 450, y: 100, base: { type: "feet",
                                                                   height: 100 } }));
        };
        const at = (x: number): number =>
        {
            const amp = newDevice({ name: "Ampli", width: 300, height: 300, depth: 300, massKg: 120,
                                    source: "mesuré", x, y: 600, z: 75 });
            return busiest(addItem(base(), amp), "Bahut d'Ensisheim");
        };
        // at an end the same amp give its nearest feet more than in the middel
        expect(at(0)).toBeGreaterThan(at(650) + 10);
    });


    it("counts the carcasses stacked on it, the dresser's middle one carrying the niche and the cupboards", () =>
    {
        const p = dresser();
        const told = analyse(p).checks.find((k) =>
        {
            return k.message.startsWith("Placards et tiroirs :") && k.message.includes("sur le pied le plus chargé");
        })!.message;
        expect(told).toContain("ce qui est posé dessus compris");
        // 264 kg of its own over 6 feet made 44 each, the 291 kg standing on it more than double that
        expect(busiest(p, "Placards et tiroirs")).toBeGreaterThan(88);
    });
});
