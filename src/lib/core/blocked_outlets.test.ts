import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { at } from "./geometry";
import type { Carcass } from "./model";


function column(p: ReturnType<typeof tvWall>): Carcass
{
    return p.items.find((it) =>
    {
        return it.name === "Colonne gauche";
    }) as Carcass;
}


function bookshelf(p: ReturnType<typeof tvWall>): Carcass
{
    return p.items.find((it) =>
    {
        return it.name === "Colonne à livres";
    }) as Carcass;
}


describe("a cable hole has somewhere to go", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`${make.name} has no hole opening onto another board`, () =>
        {
            const a = analyse(make());
            expect(a.build.errors.filter((e) =>
            {
                return e.includes("donne sur");
            })).toEqual([]);
        });
    }

    it("refuses the hole the TV wall once had, behind the 150 deep book column", () =>
    {
        const p = tvWall();
        // Where it stood : 104 off the wall, and no way through the books
        const o = column(p).outlets.find((h) => { return h.panel === "right"; })!;
        o.dx = -50;
        const errors = analyse(p).build.errors.filter((e) =>
        {
            return e.includes("donne sur");
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain("Colonne à livres");
    });

    it("refuses the book column drilled without its neighbour, whichever board is left out", () =>
    {
        const p = tvWall();
        column(p).outlets = column(p).outlets.filter((h) =>
        {
            return h.panel !== "right";
        });
        expect(analyse(p).build.errors.some((e) =>
        {
            return e.includes("donne sur") && e.includes("Colonne gauche");
        })).toBe(true);
    });

    it("lets a hole stand free of a neighbour the moment it clears it", () =>
    {
        const p = tvWall();
        const o = column(p).outlets.find((h) => { return h.panel === "right"; })!;
        // 215 off the wall : 35 clear of the 150 deep column
        o.dx = 61;
        bookshelf(p).outlets = [];
        expect(analyse(p).build.errors.filter((e) =>
        {
            return e.includes("donne sur");
        })).toEqual([]);
    });

    it("lines up the four holes of the TV cables, level with each other", () =>
    {
        const b = analyse(tvWall()).build;
        const holes = b.outlets.filter((h) =>
        {
            return h.reach === 20;
        });
        expect(holes.length).toBe(4);
        for (const h of holes)
        {
            const board = b.parts.find((q) => { return q.id === h.board; })!;
            expect(board.frame).not.toBeNull();
            expect(h.centre[1]).toBeCloseTo(696.5, 1);
            expect(h.centre[2]).toBeCloseTo(85, 1);
            expect(at(board.frame!, 0, 0, 0)).toBeDefined();
        }
    });
});
