import { describe, expect, it } from "vitest";
import { addItem } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { TEMPLATES } from "./templates";
import { solids } from "./solids";
import { belowFloor, clashes } from "./clashes";
import { unsupported } from "./support";
import type { Carcass, Project } from "./model";

function project(...items: Carcass[]): Project
{
    let p = newProject("séjour à Colmar");
    for (const c of items)
    {
        p = addItem(p, c);
    }
    return p;
}


function report(p: Project)
{
    const all = solids(p, analyse(p).build);
    return { all, under: belowFloor(all), clash: clashes(all), loose: unsupported(p, all) };
}


describe("solids of the 3D view", () =>
{
    for (const t of TEMPLATES)
    {
        it(`keeps the ${t.label} above the floor, unclashed and standing`, () =>
        {
            const r = report(t.make());
            expect(r.all.length).toBeGreaterThan(50);
            expect(r.under.map((s) =>
            {
                return s.label;
            })).toEqual([]);
            expect(r.clash.map((c) =>
            {
                return `${c.a.label} / ${c.b.label}`;
            })).toEqual([]);
            expect(r.loose).toEqual([]);
        });
    }


    it("draws the feet under a plinth carcass, plate on the floor", () =>
    {
        const r = report(project(newCarcass({ name: "Buffet", width: 1200, height: 800, depth: 450, y: 100 })));
        const plates = r.all.filter((s) =>
        {
            return s.label.endsWith("patin");
        });
        // two rows of Häfele feet, 800 apart at most along a 1200 width
        expect(plates.length).toBe(6);
        for (const s of plates)
        {
            expect(s.min[1]).toBeCloseTo(0, 6);
        }
    });


    it("never sets a foot through the plinth, whatever its setback and board", () =>
    {
        for (const setback of [0, 30, 50, 100])
        {
            for (const thickness of [16, 19])
            {
                const c = newCarcass({ name: "Buffet", width: 900, height: 800, depth: 500, y: 100, thickness,
                                       base: { type: "plinth", height: 100, setback } });
                expect(report(project(c)).clash).toEqual([]);
            }
        }
    });


    it("finds a carcass sunk into the floor", () =>
    {
        // a plinth of 100 under a box left at floor level
        const r = report(project(newCarcass({ name: "Commode", width: 800, height: 700, depth: 450, y: 0 })));
        expect(r.under.some((s) =>
        {
            return s.label === "Commode : Plinthe";
        })).toBe(true);
        expect(r.loose).toEqual([{ item: expect.any(String), name: "Commode", why: "pieds à -100 mm du sol" }]);
    });


    it("finds two carcasses crossing each other", () =>
    {
        const a = newCarcass({ name: "Armoire", width: 800, height: 2000, depth: 600, y: 100 });
        const b = newCarcass({ name: "Bibliothèque", width: 800, height: 2000, depth: 600, y: 100, x: 500 });
        const pairs = report(project(a, b)).clash.map((c) =>
        {
            return [c.a.item, c.b.item].sort().join(" ");
        });
        expect(pairs).toContain([a.id, b.id].sort().join(" "));
    });


    it("finds hardware set across a board, and leaves a hinge cup alone in its own door", () =>
    {
        const p = TEMPLATES.find((t) =>
        {
            return t.id === "dresser";
        })!.make();
        const b = analyse(p).build;
        const side = b.parts.find((x) =>
        {
            return x.role === "side";
        })!;
        // a 40 mm cube centred on the middle of a side panel
        const mid = side.frame!;
        const centre: [number, number, number] = [
            mid.o[0] + mid.u[0] * side.length / 2 + mid.v[0] * side.width / 2,
            mid.o[1] + mid.u[1] * side.length / 2 + mid.v[1] * side.width / 2,
            mid.o[2] + mid.u[2] * side.length / 2 + mid.v[2] * side.width / 2,
        ];
        b.fitted.push({ key: "essai/cube", item: side.item, ref: "essai", label: "cube d'essai", shape: "box", centre,
                        axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], half: [20, 20, 20], host: null, hidden: true });
        const cup = b.fitted.find((f) =>
        {
            return f.label.endsWith("cuvette de charnière");
        })!;
        expect(clashes(solids(p, b)).map((c) =>
        {
            return [c.a.key, c.b.key].sort().join(" ");
        })).toEqual([[side.id, "essai/cube"].sort().join(" ")]);
        // without its host the cup sits in the door board like any foreign body
        cup.host = null;
        expect(clashes(solids(p, b)).some((c) =>
        {
            return c.a.key === cup.key || c.b.key === cup.key;
        })).toBe(true);
    });


    it("tells a box on another from a box in the air", () =>
    {
        const low = newCarcass({ name: "Bas", width: 1000, height: 500, depth: 500, y: 100 });
        const onTop = newCarcass({ name: "Haut", width: 600, height: 800, depth: 400, y: 600, base: { type: "floor" } });
        expect(report(project(low, onTop)).loose).toEqual([]);
        const adrift = newCarcass({ name: "Haut", width: 600, height: 800, depth: 400, y: 900,
                                   base: { type: "floor" } });
        expect(report(project(low, adrift)).loose).toEqual([
            { item: adrift.id, name: "Haut", why: "ne repose sur rien à 900 mm" },
        ]);
    });
});
