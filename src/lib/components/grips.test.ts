import { describe, expect, it } from "vitest";
import { GRIP_GAP, GRIP_H, GRIP_ROW, layoutGrips, type GripSpot } from "./grips";

type Spec = { id: string; name: string; mid: number; top: number; width: number };


// the grip's box in the world, as the front view draws it
function boxOf(s: Spec, g: GripSpot, u: number): { x0: number; x1: number; y0: number; y1: number }
{
    const x = s.mid + g.dx * u;
    const y0 = s.top + (GRIP_GAP + GRIP_ROW * g.lift) * u;
    return { x0: x - g.px * u / 2, x1: x + g.px * u / 2, y0, y1: y0 + GRIP_H * u };
}


function apart(specs: Spec[], u: number): boolean
{
    const g = layoutGrips(specs, u);
    const boxes = specs.map((s) => { return boxOf(s, g.get(s.id)!, u); });
    return boxes.every((a, i) =>
    {
        return boxes.every((b, j) =>
        {
            return i === j || a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
        });
    });
}


// the TV wall on a phone, 3 mm a pixel : the column, the base, the amplifier and the two boxes of the technical cell
const TV: Spec[] = [
    { id: "col", name: "Colonne gauche", mid: 225, top: 2430, width: 450 },
    { id: "base", name: "Meuble bas", mid: 1300, top: 600, width: 2600 },
    { id: "amp", name: "Ampli Marshall Stanmore", mid: 572, top: 950, width: 185 },
    { id: "srv", name: "Freebox Server mini 4K", mid: 120, top: 664, width: 180 },
    { id: "ply", name: "Freebox Player mini 4K", mid: 307, top: 650, width: 155 },
];


describe("grips over the front view", () =>
{
    it("move one of two neighbours away with a leader, the other one staying over its item", () =>
    {
        const g = layoutGrips(TV, 3);
        expect([g.get("ply")!.dx, g.get("ply")!.lift, g.get("ply")!.leader]).toEqual([0, 0, false]);
        expect(g.get("srv")!.leader).toBe(true);
        expect(apart(TV, 3)).toBe(true);
    });


    it("slide a wide item's grip along its own top, with no leader, before a smaller one would move", () =>
    {
        // a lamp stood in the middle of the base : its grip and the base's fall on the same spot
        const crowded = [...TV, { id: "lamp", name: "Lampe de Soultz", mid: 1300, top: 600, width: 120 }];
        const g = layoutGrips(crowded, 3);
        expect([g.get("lamp")!.dx, g.get("lamp")!.lift, g.get("lamp")!.leader]).toEqual([0, 0, false]);
        expect(g.get("base")!.dx).not.toBe(0);
        expect(g.get("base")!.leader).toBe(false);
        expect(apart(crowded, 3)).toBe(true);
    });


    it("leave apart the ones that do not touch", () =>
    {
        const g = layoutGrips([{ id: "a", name: "Colonne de Thann", mid: 0, top: 600, width: 400 },
                               { id: "b", name: "Meuble de Cernay", mid: 1000, top: 600, width: 400 }], 1);
        expect([g.get("a")!.dx, g.get("a")!.lift, g.get("b")!.dx, g.get("b")!.lift]).toEqual([0, 0, 0, 0]);
    });


    it("keep a moved grip inside the view, or over its item when the view has no room left", () =>
    {
        // the phone view of the TV wall, 5 mm a pixel, a little wider than the furniture
        const view = { x0: -100, x1: 2900, y0: -100, y1: 3000 };
        const g = layoutGrips(TV, 5, view);
        for (const s of TV)
        {
            const spot = g.get(s.id)!;
            const b = boxOf(s, spot, 5);
            const moved = spot.dx !== 0 || spot.lift !== 0;
            expect(!moved || (b.x0 >= view.x0 && b.x1 <= view.x1 && b.y1 <= view.y1), s.id).toBe(true);
        }
        const none = layoutGrips(TV, 5, { x0: 0, x1: 1, y0: 0, y1: 1 });
        expect(none.get("srv")!.dx === 0 && none.get("srv")!.lift === 0).toBe(true);
    });


    it("find each of a crowd its own spot", () =>
    {
        const crowd: Spec[] = ["Carlin", "Bouledogue", "Teckel", "Beagle", "Basset"].map((name, k) =>
        {
            return { id: name, name, mid: 100 + 10 * k, top: 500, width: 100 - k };
        });
        expect(apart(crowd, 2)).toBe(true);
    });
});
