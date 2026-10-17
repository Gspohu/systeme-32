import { describe, expect, it } from "vitest";
import { CommandError } from "./commands";
import { newProject } from "./factory";
import { validateProject } from "./io/project_file";
import { LAMP_START, addLamp, addPicture, addSofa, pictureFile, removePicture, setSideWall, setWallPhoto,
         shownSideWalls, updateLamp, updatePicture, updateSofa } from "./room_dressing";
import { usedPhotos } from "./photos";
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


describe("the photo of the walls", () =>
{
    it("lays a photo of a set width on the walls, keeps it with the project and takes it off", () =>
    {
        const p = setWallPhoto(newProject("Séjour de Guebwiller"), { file: "room_walls.jpg", tileMm: 530 });
        expect(p.room.wallPhoto).toEqual({ file: "room_walls.jpg", tileMm: 530 });
        const all = new Map([["room_walls.jpg", new Uint8Array([1])], ["autre.jpg", new Uint8Array([2])]]);
        expect([...usedPhotos(p, all).keys()]).toEqual(["room_walls.jpg"]);
        expect(validateProject(JSON.parse(JSON.stringify(p))).room.wallPhoto).toEqual(p.room.wallPhoto);
        expect(setWallPhoto(p, null).room.wallPhoto).toBeUndefined();
        for (const tileMm of [5, 20000, Number.NaN])
        {
            expect(() =>
            {
                return setWallPhoto(p, { file: "room_walls.jpg", tileMm });
            }).toThrow(CommandError);
        }
    });

    it("refuses a project file whose wall photo names a file no import could have made", () =>
    {
        const p = setWallPhoto(newProject("Séjour de Guebwiller"), { file: "room_walls.jpg", tileMm: 530 });
        const bad = JSON.parse(JSON.stringify(p));
        bad.room.wallPhoto.file = "../../etc/passwd";
        expect(() =>
        {
            return validateProject(bad);
        }).toThrow("photo des murs");
    });
});


describe("photos hung on the walls", () =>
{
    it("hangs a photo centred on its wall, moves and sizes it, keeps its file with the project", () =>
    {
        const p = addPicture(newProject("Séjour de Guebwiller"), "picture_a.png", "left");
        const x = p.room.pictures[0]!;
        // The left wall runs the 4000 of the room's depth
        expect([x.wall, x.x, x.y, x.width]).toEqual(["left", 1700, 1200, 600]);
        const moved = updatePicture(p, x.id, { wall: "back", x: 100, width: 900 });
        expect(moved.room.pictures[0]).toMatchObject({ wall: "back", x: 100, width: 900 });
        const all = new Map([["picture_a.png", new Uint8Array([1])]]);
        expect([...usedPhotos(moved, all).keys()]).toEqual(["picture_a.png"]);
        expect(removePicture(moved, x.id).room.pictures).toEqual([]);
        for (const wrong of [{ width: 5 }, { y: -1 }])
        {
            expect(() =>
            {
                return updatePicture(p, x.id, wrong);
            }).toThrow(CommandError);
        }
    });

    it("names each photo apart in the archive, and gives an older room none", () =>
    {
        expect(pictureFile("png")).not.toBe(pictureFile("png"));
        const old = JSON.parse(JSON.stringify({ ...newProject("Séjour de Guebwiller"), schema: 12 }));
        delete old.room.pictures;
        expect(validateProject(old).room.pictures).toEqual([]);
    });
});
