import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { crossedHoles } from "./drilling";
import { at } from "./geometry";
import { dresser } from "./templates";


describe("cales de coulisse du tiroir intérieur", () =>
{
    const a = analyse(dresser());
    const spacers = a.build.parts.filter((q) => { return /^Cale de coulisse/.test(q.label); });

    it("ont chacune de leurs vis en face d'un avant-trou Ø2,5 du montant, percé à l'atelier", () =>
    {
        expect(spacers).toHaveLength(2);
        for (const spacer of spacers)
        {
            const screws = spacer.holes.filter((h) => { return h.purpose === "spacer-screw"; });
            expect(screws).toHaveLength(6);
            const upright = a.build.parts.find((q) =>
            {
                return q.item === spacer.item && screws[0]!.label.includes(q.label.toLowerCase()) && /^Montant/.test(q.label);
            })!;
            const pilots = upright.holes.filter((h) => { return /Cale de coulisse/.test(h.label); });
            expect(pilots).toHaveLength(6);
            for (const s of screws)
            {
                // The point the screw leaves the spacer by, in the upright's own axes
                const p = at(spacer.frame!, s.u, s.v, 0);
                const f = upright.frame!;
                const d = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
                const [u, v] = [f.u, f.v].map((x) => { return d[0]! * x[0] + d[1]! * x[1] + d[2]! * x[2]; });
                const mine = pilots.find((h) => { return Math.abs(h.u - u!) < 0.5 && Math.abs(h.v - v!) < 0.5; })!;
                expect(mine.diameter).toBe(2.5);
                expect(mine.countersink).toBeUndefined();
            }
            expect(crossedHoles(upright)).toEqual([]);
        }
        expect(a.build.errors.some((e) => { return /cale de coulisse/.test(e); })).toBe(false);
    });
});
