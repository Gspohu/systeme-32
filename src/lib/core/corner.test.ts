import { describe, expect, it } from "vitest";
import { addItem, setFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { sweepHits } from "./corner";
import { roomBox, toRoom, toWall } from "./room";
import type { Carcass, DoorFront, Project } from "./model";
import { validateProject } from "./io/project_file";

// a corner wardrobe in Strasbourg : 600 on the back wall, 1000 on the left one, both 600 deep on a plinth
function corner(backDoor: DoorFront | null, sideX: number): Project
{
    let p = addItem(newProject("angle"), newCarcass({ name: "Fond", width: 600, height: 2000, depth: 600, y: 100 }));
    const back = p.items[0] as Carcass;
    if (backDoor !== null)
    {
        p = setFront(p, back.id, back.root.id, backDoor);
    }
    // facing the left wall the corner is on the right : 4000 of room depth, the side carcass ends at the corner
    return addItem(p, newCarcass({ name: "Gauche", wall: "left", width: 1000, height: 2000, depth: 600, y: 100,
                                   x: sideX }));
}


function messages(p: Project, level: string): string
{
    const out: string[] = [];
    for (const k of analyse(p).checks)
    {
        if (k.level === level)
        {
            out.push(k.message);
        }
    }
    return out.join("\n");
}


describe("walls and corners", () =>
{
    it("turns each wall frame into the room and back", () =>
    {
        const room = { width: 3000, depth: 4000, height: 2500 };
        expect(toRoom("left", room, [100, 50, 600])).toEqual([600, 50, 3900]);
        expect(toRoom("right", room, [100, 50, 600])).toEqual([2400, 50, 100]);
        for (const wall of ["back", "left", "right"] as const)
        {
            expect(toWall(wall, room, toRoom(wall, room, [123, 45, 678]))).toEqual([123, 45, 678]);
        }
    });

    it("finds a carcass of the left wall pushed into one of the back wall", () =>
    {
        // the left carcass runs from 3000 to 4000 along its wall : its last 600 sit on the back carcass
        const p = corner(null, 3000);
        const [back, side] = p.items as Carcass[];
        // the plinth takes the box down to the floor
        expect(roomBox(side!, p.room)).toEqual({ min: [0, 0, 0], max: [600, 2100, 1000] });
        expect(messages(p, "error")).toContain(`${back!.name} et ${side!.name} se chevauchent`);
    });

    it("refuses a door behind the carcass of the other wall and gives the filler", () =>
    {
        // left carcass against the back front plane, over the first 600 of a door that starts at 1.5
        const p = corner({ type: "door", hinge: "right" }, 4000 - 1000 - 600);
        expect(messages(p, "error")).toContain("Fond, porte 1 traverse Gauche (mur du fond). Décaler l'un des deux d'au "
            + "moins 599 mm, par un fileur dans l'angle.");
    });

    it("warns when a door hinged on the corner side cannot open square", () =>
    {
        // back carcass moved 700 from the corner : the door clears the side carcass but not its own front
        let p = corner(null, 4000 - 1000 - 600 - 19);
        const back = p.items[0] as Carcass;
        const moved = { ...back, x: 700 };
        p = { ...p, items: [moved, p.items[1]!] };
        p = setFront(p, back.id, back.root.id, { type: "door", hinge: "left" });
        expect(messages(p, "error")).toBe("");
        const side = p.items[1] as Carcass;
        p = setFront(p, side.id, side.root.id, { type: "door", hinge: "right" });
        expect(messages(p, "warning")).toContain("Gauche, porte 1 heurte");
        // hinged the other way the side door swings away from the corner
        p = setFront(p, side.id, side.root.id, { type: "door", hinge: "left" });
        expect(messages(p, "warning")).not.toContain("heurte");
    });

    it("sweeps a quarter disc, not its bounding square", () =>
    {
        // door 500 wide hinged at x = 0 on a front at z = 0
        const far = { min: [400, 0, 400] as [number, number, number], max: [600, 10, 600] as [number, number, number] };
        expect(sweepHits(0, 0, 500, "left", far)).toBe(false);
        const near = { min: [300, 0, 300] as [number, number, number], max: [600, 10, 600] as [number, number, number] };
        expect(sweepHits(0, 0, 500, "left", near)).toBe(true);
        expect(sweepHits(0, 0, 500, "right", near)).toBe(false);
    });

    it("reads a file without walls or room as the back wall of a default room", () =>
    {
        const p = corner(null, 0);
        const old = JSON.parse(JSON.stringify({ ...p, schema: 2 }));
        delete old.room;
        delete old.items[0].wall;
        const back = validateProject(old);
        expect(back.room).toEqual({ width: 4000, depth: 4000, height: 2500 });
        expect(back.items[0]!.wall).toBe("back");
        const bad = JSON.parse(JSON.stringify(p));
        bad.items[1].wall = "ceiling";
        expect(() =>
        {
            validateProject(bad);
        }).toThrow("mur inconnu");
    });
});
