import { describe, expect, it } from "vitest";
import type { Canvas } from "./drawing/display"; 
import { itemViews } from "./drawing/item_views";
import { analyse } from "./analysis";
import { tvWall } from "./templates";


type Prim = Canvas["prims"][number];


describe("the views of a carcass", () =>
{
    it("draws the plan in first angle, its front at the bottom, the quarter round closed on the side", () =>
    {
        const p = tvWall();
        const low = p.items.find((it) =>
        {
            return it.name === "Meuble bas";
        })!;
        if (low.kind !== "carcass")
        {
            throw new Error("le meuble bas n'est plus un caisson");
        }
        const prims = itemViews(low, analyse(p)).canvas.prims;
        const title = prims.find((x): x is Extract<Prim, { k: "text" }> =>
        {
            return x.k === "text" && x.t === "Vue de dessus";
        })!;
        // the outline of the box under its title, and the arc of the rounded end beside it
        const box = prims.find((x): x is Extract<Prim, { k: "rect" }> =>
        {
            return x.k === "rect" && x.y > title.y && x.y - title.y < 5;
        })!;
        const arc = prims.find((x): x is Extract<Prim, { k: "poly" }> =>
        {
            return x.k === "poly" && !x.closed && x.pts.length > 20 && x.pts.every(([, y]) =>
            {
                return y >= box.y - 0.01;
            });
        })!;
        const face = box.x + box.w;
        const [first, last] = [arc.pts[0]!, arc.pts[arc.pts.length - 1]!];
        expect(first[0]).toBeCloseTo(face, 6);
        expect(last[0]).toBeCloseTo(face, 6);
        // the front of the item, where the arc meets the side atngentially, on the bottom edge of the box
        expect(last[1]).toBeCloseTo(box.y + box.h, 6);
        expect(first[1]).toBeLessThan(last[1]);
    });
});
