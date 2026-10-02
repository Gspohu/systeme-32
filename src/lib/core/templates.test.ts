import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { resolveLayout } from "./layout";
import type { Part } from "./parts";
import type { Carcass, SplitNode } from "./model";


function hardwareCount(make: typeof tvWall): Map<string, number>
{
    const agg = new Map<string, number>();
    for (const h of analyse(make()).build.hardware)
    {
        agg.set(h.ref, (agg.get(h.ref) ?? 0) + h.qty);
    }
    return agg;
}

describe("the sketch templates", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`${make.name} builds without any manufacturing error`, () =>
        {
            const a = analyse(make());
            const errors: string[] = [];
            for (const c of a.checks)
            {
                if (c.level === "error")
                {
                    errors.push(c.message);
                }
            }
            expect(errors).toEqual([]);
            expect(a.build.parts.length).toBeGreaterThan(50);
        });
    }


    it("fits the dresser with 27 hinges and three 480 runner pairs for its row of drawers", () =>
    {
        // twelve doors, two hinges up to 750 mm and 6 kg on the Blum chart : the three past 750 take a third
        const hw = hardwareCount(dresser);
        expect((hw.get("71B3550") ?? 0) + (hw.get("71B3650") ?? 0)).toBe(9 * 2 + 3 * 3);
        expect(hw.get("173H7100")).toBe(27);
        expect(hw.get("760H4800S")).toBe(3);
    });

    it("gives the TV wall an open quarter round, a cable hole, one door per zone and its two oak shelves", () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const base = p.items[0]!;
        const end: Part[] = [];
        for (const q of a.build.parts)
        {
            if (q.role === "batten" || q.id.includes("/end/right/"))
            {
                end.push(q);
            }
        }
        // no skin left : the two end panels and one shaped shelf, all 300 out to the radius
        expect(end.map((q) =>
        {
            return q.label;
        }).sort()).toEqual(["Bout arrondi droit, flasque basse", "Bout arrondi droit, flasque haute",
                            "Bout arrondi droit, tablette 1"]);
        // the 60 hole in the middle of the lower left cell : 19 + 627 / 2 across, 19 + 224 / 2 up
        const back = a.build.parts.find((q) =>
        {
            return q.id === `${base.id}/back`;
        })!;
        expect(back.cutouts).toHaveLength(1);
        expect(back.cutouts[0]!.segments[0]).toMatchObject({ kind: "arc", cx: 19 + 627 / 2, cy: 19 + 224 / 2 });
        // four doors of two hinges, none of the small ones of the save lfet
        const hw = hardwareCount(tvWall);
        expect((hw.get("71B3550") ?? 0) + (hw.get("71B3650") ?? 0)).toBe(4 * 2);
        expect(p.items.filter((it) =>
        {
            return it.kind === "wallShelf";
        }).length).toBe(2);
    });


    it("opens the niche of the parents' sketch over 1084 between its two shelf columns", () =>
    {
        const niche = dresser().items.find((it) =>
        {
            return it.name === "Niche";
        }) as Carcass;
        const opening = (niche.root as SplitNode).children[1]!;
        expect(resolveLayout(niche).nodes.get(opening.id)!.w).toBe(1084);
        expect(niche.fronts).toEqual([]);
    });

    it("lines the three drawers of the sketch up side by side, all at the same height", () =>
    {
        const low = dresser().items.find((it) =>
        {
            return it.name === "Placards et tiroirs";
        }) as Carcass;
        const lay = resolveLayout(low);
        const drawers = low.fronts.filter((f) =>
        {
            return f.spec.type === "drawers";
        }).map((f) =>
        {
            return lay.nodes.get(f.node)!;
        });
        expect(drawers.length).toBe(3);
        expect(new Set(drawers.map((d) =>
        {
            return d.y;
        })).size).toBe(1);
        expect(drawers[0]!.h).toBe(171);
    });
});
