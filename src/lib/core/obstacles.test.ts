import { describe, expect, it } from "vitest";
import { addItem, addObstacle, removeObstacle, setReturn, updateObstacle } from "./commands";
import { addOutlet, updateOutlet } from "./front_commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { validateProject } from "./io/project_file";
import type { Carcass, Project } from "./model";


// the entrance of Thomas D. at Colmar : a radiator, a skirting and the alarm box on the back wall
function room(c: Partial<Carcass> = {}): Project
{
    return addItem(newProject("Colmar"), newCarcass({ name: "Banc", width: 600, height: 800,
                                                     depth: 400, x: 1000, ...c }));
}

function withObstacle(p: Project, kind: "radiator" | "box" | "skirting", o: Record<string, number | null>): Project
{
    const q = addObstacle(p, kind, "back");
    return updateObstacle(q, q.room.obstacles[q.room.obstacles.length - 1]!.id, o);
}


function said(p: Project, level: "error" | "warning" | "info"): string
{
    return analyse(p).checks.filter((k) =>
    {
        return k.level === level;
    }).map((k) =>
    {
        return k.message;
    }).join("\n");
}


describe("what stands on the walls", () =>
{
    it("refuses a carcass standing over a radiator, and warns of a skirting behind it", () =>
    {
        expect(said(withObstacle(room(), "radiator", { x: 1100, y: 150 }), "error")).toMatch(/Banc : Radiateur 1/);
        // a 120 skirting stop against the sides standing on a 100 bsae, a 100 one passes under the carcass
        expect(said(withObstacle(room(), "skirting", { x: 0, width: 4000, height: 120 }), "warning"))
            .toMatch(/Banc : Plinthe murale 1 derrière, 15 mm de saillie/);
        expect(said(withObstacle(room(), "skirting", { x: 0, width: 4000 }), "warning")).not.toMatch(/Plinthe/);
    });


    it("checks the room a radiator's notice asks, and says when it is not typed", () =>
    {
        // the bench ends at 1600, the radiator starts 100 further
        const near = withObstacle(room(), "radiator", { x: 1700, y: 150 });
        expect(said(near, "info")).toMatch(/dégagement de sa notice non saisi/);
        const id = near.room.obstacles[0]!.id;
        expect(said(updateObstacle(near, id, { clearance: 150 }),
                    "warning")).toMatch(/Banc : à moins de 150 mm du radiateur/);
        expect(said(updateObstacle(near, id, { clearance: 50 }), "warning")).not.toMatch(/radiateur/);
    });


    it("lets a box into a hung niche through a cut-out of its back, and refuses it through a plain back", () =>
    {
        const niche = room({ x: 0, y: 1200, depth: 300, height: 900, base: { type: "wall" } });
        const boxed = withObstacle(niche, "box", { x: 240, y: 1500 });
        expect(said(boxed, "error")).toMatch(/Boîtier 1 \(120 x 180, 40 de saillie\) traverse/);
        const c = boxed.items[0] as Carcass;
        let cut = addOutlet(boxed, c.id, c.root.id);
        cut = updateOutlet(cut, c.id, (cut.items[0] as Carcass).outlets[0]!.id, { w: 200, h: 260, dy: -60 });
        // the volume of a cut bak leaves its hole out : the box going through it meets nothing
        expect(said(cut, "error")).not.toMatch(/Boîtier/);
    });


    it("finds the alarm box running under the bottom of the niche, its cut-out or not", () =>
    {
        const niche = room({ x: 0, y: 1200, depth: 300, height: 900, base: { type: "wall" } });
        expect(said(withObstacle(niche, "box", { x: 240, y: 1150 }),
                    "error")).toMatch(/Boîtier 1 .* traverse .*Dessous/);
    });


    it("keeps them through an alcove return, refuses one off its wall, and opens an older file with none", () =>
    {
        const p = withObstacle(room(), "radiator", { x: 100 });
        expect(setReturn(p, "left", 600).room.obstacles).toHaveLength(1);
        expect(() =>
        {
            return updateObstacle(p, p.room.obstacles[0]!.id, { x: 3800 });
        }).toThrow(/sort du mur \(4000 x 2500\)/);
        expect(removeObstacle(p, p.room.obstacles[0]!.id).room.obstacles).toEqual([]);
        const old = JSON.parse(JSON.stringify(room())) as Record<string, unknown> & { room: Record<string, unknown> };
        old.schema = 7;
        delete old.room.obstacles;
        expect(validateProject(old).room.obstacles).toEqual([]);
    });
});
