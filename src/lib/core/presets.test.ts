import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { dropCarcass, newDesk, newLining, NEW_CARCASS } from "./presets";
import { DESK_HEIGHT } from "./desk";
import type { Carcass, Project } from "./model";


function bench(seat: boolean): Project
{
    return addItem(newProject("Colmar"), newCarcass({ name: "Banc de Colmar", x: 0, width: 1200, height: 450, depth: 450,
                                                      y: 100, seat: seat ? { cushion: 0 } : null }));
}


describe("dropping a carcass", () =>
{
    it("stands it on a plinth on the floor, its left edge on the placing step", () =>
    {
        const p = dropCarcass(newProject("Colmar"), 1004, 300, "back", 10);
        const c = p.items[0] as Carcass;
        expect([c.x, c.y, c.width, c.base.type]).toEqual([700, NEW_CARCASS.plinth, NEW_CARCASS.width, "plinth"]);
    });


    it("stands it on the top of the carcass it is dropped onto, with no base of its own", () =>
    {
        const p = dropCarcass(bench(false), 600, 700, "back", 10);
        const c = p.items[1] as Carcass;
        expect([c.y, c.base.type]).toEqual([550, "floor"]);
    });


    it("refuses a seat, as the analysis would", () =>
    {
        expect(() =>
        {
            return dropCarcass(bench(true), 600, 700, "back", 10);
        }).toThrow("On ne pose rien sur une assise");
    });


    it("refuses a place taken by another item, as the analysis would", () =>
    {
        const p = dropCarcass(newProject("Colmar"), 1000, 300, "back", 10);
        expect(() =>
        {
            return dropCarcass(p, 1200, 300, "back", 10);
        }).toThrow("chevaucherait un meuble");
        // side by side is fine, and the analysis allow it too
        const q = dropCarcass(p, 1600, 300, "back", 10);
        expect(analyse(q).checks.filter((k) =>
        {
            return k.message.includes("se chevauchent");
        })).toEqual([]);
    });
});


describe("starting values", () =>
{
    it("line a niche in the back decor, a sheet the back opened already", () =>
    {
        const c = newCarcass({ name: "Niche de Turckheim", width: 600, height: 600, depth: 350,
                              backDecor: "W1000_ST9" });
        expect(newLining(c).decor).toBe("W1000_ST9");
    });


    it("set a desk top at the EN 527-1 height", () =>
    {
        const d = newDesk("back");
        expect(d.y + d.thickness).toBe(DESK_HEIGHT);
    });
});
