import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { crossedHoles } from "./drilling";
import { cutoutChecks } from "./cutout_checks";
import { emptyBuild } from "./parts";
import type { Hole, Part } from "./parts";


// A 19 mm side of a plain carcass in Haguenau, each test need its holes swapped for the ones unedr test
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


    it("sees a screw of the face running into a dowel of the edge", () =>
    {
        // It left the edge holes out, the blind spot of the review of 2026-11-09 : the dowel runs 9.5 deep along v, the
        // screw goes 15 into the face 3 off that edge, right through it
        const edge: Hole = { u: 120, v: 0, diameter: 8, depth: 30, face: "v0", w: 9.5, label: "tourillon",
                             purpose: "dowel" };
        expect(crossedHoles(side([screw("A", 120, 3), edge])).length).toBe(1);
        expect(crossedHoles(side([screw("A", 160, 3), edge])).length).toBe(0);
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
        // Plural as the message may write it, "paires" or "paires"
        expect(k[0]!.message).toContain("1 paire");
        expect(k[0]!.message).toContain("de perçages se rencontrent");
    });


    it("sees a drilling in an edge meeting a face drilling, not the passage of a bolt running into its housing", () =>
    {
        // Review of 2026-11-09 : the drillings in an edge were never checked against the others
        const passage: Hole = { u: 0, v: 37, w: 9.5, diameter: 8, depth: 34, face: "u0", label: "passage",
                               purpose: "minifix-passage" };
        const housing: Hole = { u: 34, v: 37, diameter: 15, depth: 15, face: "A", label: "boîtier",
                               purpose: "minifix-housing" };
        // A lead hole through the board on the way of the passage, 20 in from the edge
        const lead: Hole = { u: 20, v: 39, diameter: 8, depth: 19, face: "A", label: "fil", purpose: "light-lead" };
        expect(crossedHoles(side([passage, housing]))).toEqual([]);
        expect(crossedHoles(side([passage, housing, lead])).map(([x, y]) => { return [x.label,
            y.label]; })).toEqual([["passage", "fil"]]);
        // Moved off the passage, clear
        expect(crossedHoles(side([passage, housing, { ...lead, v: 60 }]))).toEqual([]);
    });
});
