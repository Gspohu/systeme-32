import { describe, expect, it } from "vitest";
import { addItem, updateItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { dresser, TEMPLATES } from "./templates";
import { solids } from "./solids";
import { stability } from "./stability";
import type { Carcass, Project } from "./model";

function project(...items: Carcass[]): Project
{
    let p = newProject("chambre à Haguenau");
    for (const c of items)
    {
        p = addItem(p, c);
    }
    return p;
}


function bodies(p: Project)
{
    const b = analyse(p).build;
    return stability(p, b, solids(p, b));
}


function errors(p: Project): string[]
{
    return analyse(p).checks.filter((k) =>
    {
        return k.level === "error";
    }).map((k) =>
    {
        return k.message;
    });
}


describe("gravity on what stands on the floor", () =>
{
    for (const t of TEMPLATES)
    {
        it(`stands the ${t.label} and tells how far the floor may tilt`, () =>
        {
            const all = bodies(t.make());
            expect(all.length).toBeGreaterThan(0);
            for (const s of all)
            {
                expect(s.stands).toBe(true);
                expect(s.tiltDeg).toBeGreaterThan(5);
            }
        });
    }


    it("finds the tilt of a plain box from its centre of mass, as a hand would", () =>
    {
        // away from the wall, free to fall any way, on its own bottom, narow enough to go over sideways
        const c = newCarcass({ name: "Armoire", width: 400, height: 2000, depth: 600, y: 0, z: 300,
                               base: { type: "floor" }, fixToWall: false });
        const [s] = bodies(project(c));
        const expected = Math.atan2(200 - Math.abs(s!.centre[0] - 200), s!.centre[1]) * 180 / Math.PI;
        expect(s!.towards).toMatch(/gauche|droite/);
        expect(s!.tiltDeg).toBeCloseTo(expected, 1);
        // a centre of mass near mid height : atan(200 / 1000) is 11.3 degrees
        expect(s!.tiltDeg).toBeGreaterThan(10);
        expect(s!.tiltDeg).toBeLessThan(13);
    });


    it("never lets a box backed on its wall fall backwards", () =>
    {
        const backed = newCarcass({ name: "Colonne", width: 600, height: 2000, depth: 300, y: 100, fixToWall: false });
        expect(bodies(project(backed))[0]!.towards).not.toBe("l'arrière");
    });


    it("finds a box that cannot stand, overhanging the one it sits on", () =>
    {
        const low = newCarcass({ name: "Socle", width: 400, height: 400, depth: 400, y: 100, fixToWall: false });
        const top = newCarcass({ name: "Vitrine", width: 1200, height: 900, depth: 400, x: 300, y: 500,
                                 base: { type: "floor" }, fixToWall: false });
        const p = project(low, top);
        const [s] = bodies(p);
        expect(s!.stands).toBe(false);
        expect(errors(p).some((m) =>
        {
            return m.startsWith("Socle + Vitrine ne tient pas debout");
        })).toBe(true);
    });


    it("fails the carpet test with the bracket off the drawer column of the dresser", () =>
    {
        let p = dresser();
        const drawers = p.items.find((it) =>
        {
            return it.name.startsWith("Colonne 3");
        })!;
        expect(errors(p).some((m) =>
        {
            return m.includes("ASTM");
        })).toBe(false);
        p = updateItem<Carcass>(p, drawers.id, { fixToWall: false });
        const s = bodies(p).find((x) =>
        {
            return x.items.includes(drawers.id);
        })!;
        expect(s.carpet).toEqual({ passes: false, tiltDeg: expect.any(Number) });
        expect(errors(p).some((m) =>
        {
            return m.startsWith("Colonne 3, argenterie bascule à l'essai ASTM F2057-23");
        })).toBe(true);
    });
});
