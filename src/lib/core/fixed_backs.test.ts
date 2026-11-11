import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { at } from "./geometry";
import { dresser, openDresser, smallNichesDresser, tvWall } from "./templates";

const PIECES = { tvWall, dresser, smallNichesDresser, openDresser };


describe("applied backs", () =>
{
    // The checks started from each screw : a board without any never came up, the back of a rounded end went through
    for (const [name, make] of Object.entries(PIECES))
    {
        it(`screws every applied back of ${name}`, () =>
        {
            const backs = analyse(make()).build.parts.filter((q) =>
            {
                return q.role === "back" && !q.label.includes("rainure");
            });
            expect(backs.length).toBeGreaterThan(0);
            expect(backs.filter((q) =>
            {
                return !q.holes.some((h) => { return h.purpose === "back-screw"; });
            }).map((q) => { return `${q.itemName} ${q.label}`; })).toEqual([]);
        });
    }

    it("screws the back of a tall column every 600, as a wide carcass, its height being its length", () =>
    {
        // Review of 2026-11-09 : the left column of the TV wall, 600 wide and 1810 high, got 900
        const b = analyse(tvWall()).build;
        const back = b.parts.find((q) => { return q.itemName === "Colonne gauche" && q.role === "back"; })!;
        expect(back.notes.some((n) => { return n.includes("tous les 600 mm"); })).toBe(true);
    });


    it("screws the lining of the niche on itself, clear of its cell", () =>
    {
        const b = analyse(tvWall()).build;
        const linings = b.parts.filter((q) => { return q.role === "lining"; });
        expect(linings).toHaveLength(5);
        const drilled = linings.filter((q) => { return q.holes.some((h) => { return h.purpose === "lining-screw"; }); });
        // The back, the top and the bottom take the screws, the 2 sides their tips
        expect(drilled.map((q) => { return q.label; }).sort()).toEqual(["Habillage, dessous", "Habillage, dessus",
                                                                        "Habillage, fond"]);
        const line = b.hardware.find((h) => { return h.purpose === "lining-screw"; })!;
        expect(line.qty).toBe(drilled.reduce((n, q) =>
        {
            return n + q.holes.filter((h) => { return h.purpose === "lining-screw"; }).length;
        }, 0));
        expect(line.ref).toBe("SCREW_2.5x16");
        const back = linings.find((q) => { return q.label === "Habillage, fond"; })!;
        const cell = b.parts.filter((q) => { return q.item === back.item && q.label.startsWith("Tablette fixe"); });
        expect(back.length).toBe(at(cell[1]!.frame!, 0, 0, 0)[1] - at(cell[0]!.frame!, 0, 0, 0)[1] - 19 - 1);
    });

    it("meets every screw of the lining with a pilot of 1.5 in the edge it goes into", () =>
    {
        // A 3 x 16 into an edge of 8 with no pilot left 2.5 each side and split the chipboard (review of 2026-11-09)
        const linings = analyse(tvWall()).build.parts.filter((q) => { return q.role === "lining"; });
        const mouths = linings.flatMap((q) =>
        {
            return q.holes.filter((h) => { return h.purpose === "lining-pilot"; }).map((h) =>
            {
                expect([h.diameter, h.depth, h.w]).toEqual([1.5, 10, q.thickness / 2]);
                return { q, p: at(q.frame!, h.u, h.v, h.w!) };
            });
        });
        const screws = linings.flatMap((q) =>
        {
            return q.holes.filter((h) => { return h.purpose === "lining-screw"; }).map((h) =>
            {
                // Where the screw leaves its own board, at face A
                return { q, p: at(q.frame!, h.u, h.v, 0) };
            });
        });
        expect(screws.length).toBeGreaterThanOrEqual(12);
        expect(mouths).toHaveLength(screws.length);
        const lost = screws.filter((s) =>
        {
            return !mouths.some((m) =>
            {
                return m.q !== s.q && Math.hypot(m.p[0] - s.p[0], m.p[1] - s.p[1], m.p[2] - s.p[2]) < 0.01;
            });
        });
        expect(lost.map((s) => { return `${s.q.label} ${s.p.map(Math.round).join(" ")}`; })).toEqual([]);
    });


    it("lays the back of a rounded end on the middle of each edge behind it", () =>
    {
        const b = analyse(tvWall()).build;
        const back = b.parts.find((q) => { return q.label === "Bout arrondi droit, fond"; })!;
        const heights = back.holes.filter((h) =>
        {
            return h.purpose === "back-screw";
        }).map((h) =>
        {
            return at(back.frame!, h.u, h.v, 0)[1];
        });
        const edges = b.parts.filter((q) =>
        {
            return q.role === "endPanel" && q.item === back.item;
        }).map((q) =>
        {
            return at(q.frame!, 0, 0, q.thickness / 2)[1];
        });
        expect(edges.length).toBe(3);
        expect(heights.length).toBe(6);
        for (const y of heights)
        {
            expect(Math.min(...edges.map((e) => { return Math.abs(e - y); }))).toBeLessThan(0.01);
        }
    });
});
