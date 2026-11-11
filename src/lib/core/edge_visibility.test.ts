import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { addItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { dresser, tvWall } from "./templates";
import type { Build, Part } from "./part_types";


function edgesOf(b: Build, item: string, label: string): string[][]
{
    return b.parts.filter((q: Part) => { return q.itemName === item && q.label === label; }).map((q) =>
    {
        return [...q.edges].sort();
    });
}


// An edge is banded when it's left to sight, worked out from where every board stands
describe("the edges left to sight", () =>
{
    it("bands a lone carcass on the floor against the back wall on its front and its top ends only", () =>
    {
        const p = addItem(newProject("seul"), newCarcass({ name: "Caisson", width: 600, height: 900, depth: 400,
                                                             base: { type: "floor" } }));
        const b = analyse(p).build;
        // The bottom end on the floor, the back edge against the wall, the top end open to the room
        expect(edgesOf(b, "Caisson", "Joue gauche")).toEqual([["u1", "v0"]]);
    });


    it("leaves bare what the plinth void, the ceiling or the carcass below hides", () =>
    {
        const b = analyse(dresser()).build;
        for (const item of ["Colonne gauche", "Colonne droite", "Placards hauts"])
        {
            expect(edgesOf(b, item, "Joue gauche")).toEqual([["v0"]]);
        }
        const tv = analyse(tvWall()).build;
        // A low unit : its top ends seen from above, its bottom ones behind the plinth
        expect(edgesOf(tv, "Meuble bas", "Joue gauche")).toEqual([["u1", "v0"]]);
        // A plinth stops 3 under the carcass : its top edge is never seen
        for (const q of [...b.parts, ...tv.parts].filter((x) => { return x.role === "plinth"; }))
        {
            expect(q.edges).not.toContain("v1");
        }
    });


    it("judges the small columns alone, as they are seen lifted out", () =>
    {
        const b = analyse(dresser()).build;
        for (const item of ["Petite colonne gauche", "Petite colonne droite"])
        {
            expect(edgesOf(b, item, "Joue gauche")).toEqual([["u0", "u1", "v0", "v1"]]);
            expect(edgesOf(b, item, "Tablette fixe 1")).toEqual([["v0", "v1"]]);
        }
    });


    it("keeps the rule of every front : all four edges, seen once open", () =>
    {
        const b = analyse(tvWall()).build;
        const fronts = b.parts.filter((q) => { return q.role === "door" || q.role === "drawerFront"; });
        expect(fronts.length).toBeGreaterThan(4);
        for (const q of fronts)
        {
            expect(new Set(q.edges)).toEqual(new Set(["u0", "u1", "v0", "v1"]));
        }
    });
});
