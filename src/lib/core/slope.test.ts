import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { cell, newCarcass, newProject, split } from "./factory"; 
import { analyse } from "./analysis";
import { ceilingAt, frontOutline, sideHeights, topAngle, topAt } from "./slope";
import { tessellate } from "./geometry";
import { validateProject } from "./io/project_file";
import type { Carcass, Item, Project } from "./model";
import type { Part } from "./parts";


// an atitc cupboard in Colmar : 1000 inside, sides of 1500 and 2000, the top rising 1 in 2
function attic(o: Partial<Carcass> = {}): Carcass
{
    return newCarcass({ name: "Comble", width: 1038, height: 2000, depth: 500, slope: { low: "left", height: 1500 },
                        ...o });
}

function projectOf(...items: Item[]): Project
{
    let p = newProject("essai");
    for (const it of items)
    {
        p = addItem(p, it);
    }
    return p;
}


function errorsOf(c: Carcass): string[]
{
    return analyse(projectOf(c)).checks.filter((k) => { return k.level === "error"; }).map((k) => { return k.message; });
}

function complains(c: Carcass, text: string): boolean
{
    for (const m of errorsOf(c))
    {
        if (m.includes(text))
        {
            return true;
        }
    }
    return false;
}

function partOf(c: Carcass, id: string): Part
{
    const found = analyse(projectOf(c)).build.parts.find((p) => { return p.id === `${c.id}/${id}`; });
    if (!found)
    {
        throw new Error(`pièce ${id} absente du débit`);
    }
    return found;
}


const COS = 2 / Math.sqrt(5);

describe("sloped tops", () =>
{
    it("keeps a flat carcass a plain rectangle", () =>
    {
        const c = newCarcass({ width: 600, height: 800, depth: 500 });
        expect(sideHeights(c)).toEqual({ left: 800, right: 800 });
        expect(topAngle(c)).toBe(0);
        expect(frontOutline(c)).toEqual([[0, 0], [600, 0], [600, 800], [0, 800]]);
    });

    it("runs the top along the slope between the two sides", () =>
    {
        const c = attic();
        expect(topAngle(c)).toBeCloseTo(Math.atan(0.5), 12);
        expect(topAt(c, 19)).toBeCloseTo(1500, 9);
        expect(topAt(c, 1019)).toBeCloseTo(2000, 9);
        // a 19 mm borad at 1 in 2 is 19 / cos thick measured upright
        expect(topAt(c, 19) - ceilingAt(c, 19)).toBeCloseTo(19 / COS, 9);
        expect(partOf(c, "top").length).toBeCloseTo(1000 / COS, 9);
        expect(partOf(c, "side/L").length).toBe(1500);
        expect(partOf(c, "side/R").length).toBe(2000);
    });


    it("chamfers the head of the low side only", () =>
    {
        const c = attic();
        expect(partOf(c, "side/L").notes.join(" ")).toContain("chanfreinée");
        expect(partOf(c, "side/R").notes.join(" ")).not.toContain("chanfreinée");
    });

    it("cuts an upright from its longer face, the bevel taken off the other", () =>  
    {
        const c = attic({ root: split("v", [481], [cell(), cell()]) });
        const upright = analyse(projectOf(c)).build.parts.find((p) => { return p.role === "vdivider"; })!;
        // upright from x 500 to 519, standing on the bottom at 19
        expect(upright.length).toBeCloseTo(ceilingAt(c, 519) - 19, 9);
        expect(upright.length).toBeGreaterThan(ceilingAt(c, 500) - 19);
    });

    it("never lets the back rise past the square head of the high side", () =>
    {
        const c = attic();
        // taller than wide : the outline u runs up the carcass
        const us = tessellate(partOf(c, "back").outline, 4).map(([u]) => { return u; });
        expect(Math.max(...us)).toBeCloseTo(2000, 9);
        expect(Math.min(...us.filter((u) => { return u > 0; }))).toBeCloseTo(1500 - 19 / 2, 9);
    });


    it("builds a sound attic cupboard without complaint", () =>
    {
        expect(errorsOf(attic())).toEqual([]);
    });


    it("refuses a shelf above the roof line, not one under it", () =>
    {
        expect(complains(attic({ root: split("h", [1700], [cell(), cell()]) }),
            "tablette passe au-dessus du rampant")).toBe(true);
        // a 1000 span in particleboard sags too much, a matter for the shelf check and not the slope
        expect(complains(attic({ root: split("h", [1000], [cell(), cell()]) }), "rampant")).toBe(false);
    });

    it("refuses what a sloped top cannot carry", () =>
    {
        expect(complains(attic({ back: { type: "groove", thickness: 8, depth: 8, offset: 10 } }), "rainure")).toBe(true);
        expect(complains(attic({ seat: { cushion: 0 } }), "assise ne peut pas")).toBe(true);
        expect(complains(attic({ slope: { low: "left", height: 2000 } }), "joue basse")).toBe(true);
    });

    it("takes a rounded end on the high side only", () =>
    {
        const round = { type: "rounded", radius: 300, sweep: 90, technique: "battens", flexThickness: 9,
                        battens: { width: 40, thickness: 20, gap: 10,
                                  decor: "W1000_ST9" }, decor: "W1000_ST9" } as const;
        expect(complains(attic({ ends: { left: round, right: { type: "square" } } }),
                         "bout arrondi côté bas")).toBe(true);
        expect(complains(attic({ ends: { left: { type: "square" }, right: round } }), "bout arrondi")).toBe(false);
    });

    it("reads an older file as a flat top", () =>
    {
        const p = projectOf(newCarcass({ width: 600, height: 800, depth: 500 }));
        const old = JSON.parse(JSON.stringify({ ...p, schema: 1 }));
        delete old.items[0].slope;
        expect((validateProject(old).items[0] as Carcass).slope).toBeNull();
    });
});
