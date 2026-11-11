import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { at } from "./geometry";
import { dresser, tvWall } from "./templates";

const off = (x: number, step: number): number => { return Math.abs(x - Math.round(x / step) * step); };

describe("system 32 of the links between carcasses", () =>
{
    // The screws joining two sides on a hole of the line, on a row 37 off the front or the back
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`puts the link screws through the sides of the ${name} on its line and rows`, () =>
        {
            const p = make();
            const a = analyse(p);
            const s = p.settings;
            // Each screw by the point of the room it goes through : a connecting bolt drills both sides, two carcasses
            // whose grids stand apart can have it on the line of one of them only
            const screws = new Map<string, { onLine: boolean; where: string }[]>();
            for (const q of a.build.parts.filter((x) => { return x.role === "side" && x.frame !== null; }))
            {
                const c = p.items.find((it) => { return it.id === q.item; });
                if (c?.kind !== "carcass")
                {
                    continue;
                }
                for (const h of q.holes.filter((x) => { return x.purpose === "link-screw" && (x.face === "A" ||
                    x.face === "B"); }))
                {
                    const w = at(q.frame!, h.u, h.v, 0);
                    const y = w[1] - c.y;
                    const row = Math.min(off(h.v - s.connectorInset, s.grid), off(q.width - s.connectorInset - h.v,
                        s.grid));
                    const key = `${Math.round(w[1])}/${Math.round(w[2])}`;
                    screws.set(key, [...(screws.get(key) ?? []), {
                        onLine: off(y - c.thickness / 2, s.grid) < 0.05 && row < 0.05,
                        where: `${q.itemName} ${q.label} : ${h.label.slice(0, 30)} à ${y.toFixed(1)} du bas, ${h.v} du chant`,
                    }]);
                }
            }
            expect(screws.size).toBeGreaterThan(0);
            expect([...screws.values()].filter((holes) =>
            {
                return !holes.some((h) => { return h.onLine; });
            }).map((holes) => { return holes[0]!.where; })).toEqual([]);
        });
    }
});
