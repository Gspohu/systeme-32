import { describe, expect, it } from "vitest";
import { inkBox, inkedBoxes, type Canvas } from "./drawing/display";
import { itemViews } from "./drawing/item_views";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";


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
        // The outline of the box under its title, and the arc of the rounded end beside it
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
        // The front of the item, where the arc meets the side atngentially, on the bottom edge of the box
        expect(last[1]).toBeCloseTo(box.y + box.h, 6);
        expect(first[1]).toBeLessThan(last[1]);
    });

    // With the fronts off the cut shows what they hid : on the meuble télé a rail on edge ran through 227 and a
    // socket hole through 152
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`writes each cell height clear of all the cut draws : ${name}`, () =>
        {
            const p = make();
            const a = analyse(p);
            const struck: string[] = [];
            let seen = 0;
            for (const k of p.items)
            {
                if (k.kind !== "carcass")
                {
                    continue;
                }
                const draft = itemViews(k, a);
                const cut = draft.items!.find((v) => { return !v.whole && v.view === "front"; })!.box;
                const prims = draft.canvas.prims;
                const lines = prims.filter((q) => { return q.k !== "text"; }).flatMap((q) => { return inkedBoxes(q); });
                for (const q of prims)
                {
                    if (q.k !== "text" || q.rot !== 90)
                    {
                        continue;
                    }
                    const b = inkBox([q])!;
                    if (b.x < cut.x || b.x + b.w > cut.x + cut.w || b.y < cut.y || b.y + b.h > cut.y + cut.h)
                    {
                        continue;
                    }
                    seen++;
                    if (lines.some((o) => { return b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h &&
                                           o.y < b.y + b.h; }))
                    {
                        struck.push(`${k.name} : ${q.t}`);
                    }
                }
            }
            expect(seen).toBeGreaterThan(0);
            expect(struck).toEqual([]);
        });
    }
});
