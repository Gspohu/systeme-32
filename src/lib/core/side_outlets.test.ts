import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { addItem } from "./commands";
import { cell, newCarcass, newId, newProject, split } from "./factory";
import { cutoutChecks, cutThrough } from "./cutout_checks";
import { tvWall } from "./templates";
import type { Carcass, Outlet, Project } from "./model";
import type { Part } from "./part_types";

// a 800 x 600 x 400 cupboard of Colmar, an upright parting it at 400
function cupboard(hole: Partial<Outlet>): { p: Project; c: Carcass }
{
    const a = cell();
    const c = newCarcass({ name: "Buffet de Colmar", width: 800, height: 600, depth: 400, y: 100,
                           root: split("v", [400], [a, cell()]) });
    c.outlets.push({ id: newId("o"), cell: a.id, panel: "left", shape: "round", w: 60, h: 60, dx: 0, dy: 0, ...hole });
    return { p: addItem(newProject("Colmar"), c), c };
}


function centreOf(q: Part): [number, number]
{
    const arc = q.cutouts[0]!.segments[0]! as { cx: number; cy: number };
    return [arc.cx, arc.cy];
}


describe("a cable hole through the side of a cell", () =>
{
    it("goes through the outer side of the TV column, behind the amplifier, clear of every drilling", () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const column = p.items.find((it): it is Carcass => { return it.name === "Colonne gauche"; })!;
        const side = a.build.parts.find((q) => { return q.id === `${column.id}/side/R`; })!;
        expect(side.cutouts.length).toBe(1);
        // the middle of the 155 cell over the 19 bottom, 196 from the front : 104 off the wall, the amplifier's
        // back at 215
        const [u, v] = centreOf(side);
        expect(u).toBeCloseTo(19 + 155 / 2, 6);
        expect(column.depth - v).toBeCloseTo(104, 6);
        expect(cutThrough(side)).toEqual([]);
        // from the front the hole stay edge on, over the thickness of the side
        const seen = a.build.outlets.filter((o) => { return o.item === column.id && o.edgeOn; });
        expect(seen.map((o) => { return [o.x, o.w]; })).toEqual([[431, 19]]);
    });


    it("drills the upright when the cell is parted from its neighbour", () =>
    {
        const { p, c } = cupboard({ panel: "right" });
        const a = analyse(p);
        const cut = a.build.parts.filter((q) => { return q.cutouts.length > 0; });
        expect(cut.map((q) => { return q.id.startsWith(`${c.id}/div/`); })).toEqual([true]);
        expect(a.checks.filter((k) => { return k.level === "error"; })).toEqual([]);
    });


    it("is refused when it leaves its cell frontwards", () =>
    {
        const { p } = cupboard({ dx: 200 });
        expect(analyse(p).checks.map((k) => { return k.message; })).toContainEqual(
            expect.stringContaining("Buffet de Colmar, trou de prise : 60 x 60 mm décalé de 200 / 0 sort de sa case"));
    });


    it("tells a cut-out sawn through a drilling, 2 mm of clearance like two drillings", () =>
    {
        const a = analyse(tvWall());
        const column = a.build.parts.find((q) => { return q.itemName === "Colonne gauche" &&
                                                  q.label === "Joue droite"; })!;
        const [u, v] = centreOf(column);
        const pin = column.holes.find((h) => { return h.face === "A" && h.diameter > 0; })!;
        const reach = 30 + pin.diameter / 2 + 2;
        column.holes.push({ ...pin, u, v: v + reach - 0.5, label: "Taquet de Mulhouse" });
        expect(cutThrough(column).map((h) => { return h.label; })).toEqual(["Taquet de Mulhouse"]);
        column.holes[column.holes.length - 1]!.v = v + reach + 0.5;
        expect(cutThrough(column)).toEqual([]);
        column.holes[column.holes.length - 1]!.v = v;
        expect(cutoutChecks(a.build).map((k) => { return k.message; })).toEqual([
            "Colonne gauche, Joue droite : une découpe tombe sur Taquet de Mulhouse. Déplacer la découpe ou le perçage.",
        ]);
    });
});
