import { describe, expect, it } from "vitest";
import { CommandError } from "./commands";
import { newProject } from "./factory";
import { validateProject } from "./io/project_file";
import { LAMP_START, addLamp, addSofa, setSideWall, shownSideWalls, updateLamp, updateSofa } from "./room_dressing";
import { tvWall } from "./templates";

// The séjour of Guebwiller, a plain room of the default size : the wlals, the sofa and the lamps each test add
describe("dressing the room", () =>
{
    it("shows a side wall asked for though nothing stands against it, and hides it again", () =>
    {
        const p = newProject("Séjour de Guebwiller");
        expect([...shownSideWalls(p)]).toEqual([]);
        const left = setSideWall(p, "left", true);
        expect([...shownSideWalls(left)]).toEqual(["left"]);
        expect([...shownSideWalls(setSideWall(left, "left", false))]).toEqual([]);
    });

    it("backs a new sofa against the wall facing the back one, and refuses one through the back wall", () =>
    {
        const p = addSofa(newProject("Séjour de Guebwiller"));
        const s = p.room.sofas[0]!;
        expect(s.distance).toBe(p.room.depth);
        expect(s.x + s.width / 2).toBe(p.room.width / 2);
        for (const wrong of [{ distance: s.depth - 1 }, { seat: s.height }, { width: 0 }])
        {
            expect(() =>
            {
                return updateSofa(p, s.id, wrong);
            }).toThrow(CommandError);
        }
    });

    it("starts a lamp at the flux of a 60 W bulb and refuses one under the floor", () =>
    {
        const p = addLamp(newProject("Séjour de Guebwiller"));
        const l = p.room.lamps[0]!;
        expect(l.lumens).toBe(LAMP_START.lumens);
        expect(updateLamp(p, l.id, { kelvin: 4000 }).room.lamps[0]!.kelvin).toBe(4000);
        for (const wrong of [{ y: -10 }, { lumens: 0 }, { kelvin: 9000 }])
        {
            expect(() =>
            {
                return updateLamp(p, l.id, wrong);
            }).toThrow(CommandError);
        }
    });

    it("gives the room of an older project no sofa and no lamp", () =>
    {
        const old = JSON.parse(JSON.stringify({ ...newProject("Séjour de Guebwiller"), schema: 11 }));
        delete old.room.sofas;
        delete old.room.lamps;
        const back = validateProject(old);
        expect(back.room.sofas).toEqual([]);
        expect(back.room.lamps).toEqual([]);
    });

    it("sets the TV room 3100 deep, its left wall up, the sofa facing the swung out screen", () =>
    {
        const p = tvWall();
        expect(p.room.depth).toBe(3100);
        expect(shownSideWalls(p).has("left")).toBe(true);
        const s = p.room.sofas[0]!;
        expect(s.width).toBe(1880);
        expect(s.distance).toBe(3100);
        expect(s.x + s.width / 2).toBe(p.screen!.arm!.out!.cx);
    });
});
