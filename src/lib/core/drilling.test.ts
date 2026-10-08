import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { crossedHoles } from "./drilling";
import { cutoutChecks } from "./cutout_checks";
import { emptyBuild } from "./parts";
import type { Hole, Part } from "./parts";


// a 19 mm side of a plain carcass in Haguenau, each test need its holes swapped for the ones unedr test
function side(holes: Hole[]): Part
{
    const p = addItem(newProject("cellier"), newCarcass({ name: "Colonne", width: 450, height: 900, depth: 400 }));
    const found = analyse(p).build.parts.find((q) =>
    {
        return q.thickness === 19 && q.label.toLowerCase().includes("joue");
    })!;
    return { ...found, holes };
}


function screw(face: "A" | "B", u: number, v: number): Hole
{
    return { u, v, diameter: 0, depth: 0, face, label: `vis ${face}`, purpose: "runner-screw" };
}


describe("drillings meeting in a part", () =>
{
    it("finds two 15 mm screws face to face in 19 mm, and lets them pass 18 mm apart", () =>
    {
        expect(crossedHoles(side([screw("A", 120, 37), screw("B", 120, 37)])).length).toBe(1);
        expect(crossedHoles(side([screw("A", 120, 37), screw("B", 120, 55)])).length).toBe(0);
    });


    it("finds two holes of the same face within 2 mm, whatever their depth", () =>
    {
        const pin: Hole = { u: 120, v: 42, diameter: 5, depth: 1, face: "A", label: "taquet", purpose: "plate-dowel" };
        expect(crossedHoles(side([screw("A", 120, 37), pin])).length).toBe(1);
        expect(crossedHoles(side([screw("A", 120, 37), { ...pin, face: "B" }])).length).toBe(0);
    });


    it("lets the lead of a spot open into its housing, and nothing else", () =>
    {
        const spot: Hole = { u: 200, v: 200, diameter: 55, depth: 11, face: "B", label: "spot", purpose: "spot" };
        const lead: Hole = { u: 200, v: 215, diameter: 8, depth: 19, face: "A", label: "câble", purpose: "light-lead" };
        expect(crossedHoles(side([spot, lead])).length).toBe(0);
        expect(crossedHoles(side([spot, { ...lead, purpose: "runner-screw" }])).length).toBe(1);
    });


    it("leaves the edge holes out", () =>
    {
        const edge: Hole = { u: 120, v: 0, diameter: 8, depth: 30, face: "v0", w: 9.5, label: "tourillon",
                             purpose: "dowel" };
        expect(crossedHoles(side([screw("A", 120, 3), edge])).length).toBe(0);
    });


    it("reports the crossing as a manufacturing error on the part", () =>
    {
        const b = emptyBuild();
        b.parts.push(side([screw("A", 120, 37), screw("B", 120, 37)]));
        const k = cutoutChecks(b).filter((c) =>
        {
            return c.level === "error";
        });
        expect(k.length).toBe(1);
        expect(k[0]!.message).toContain("1 paire(s) de perçages se rencontrent");
    });
});
