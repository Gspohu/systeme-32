import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { computeOutputs } from "./outputs";
import { fabrication } from "./io/fabrication";
import { at } from "./geometry";
import { tvWall } from "./templates";


describe("vis du retour de plinthe dans la flasque basse", () =>
{
    const a = analyse(tvWall());
    const floor = a.build.parts.find((q) => { return /flasque basse/.test(q.label); })!;
    const ret = a.build.parts.find((q) => { return /retour droit/.test(q.label); })!;
    const pilots = floor.holes.filter((h) => { return /Retour de plinthe/.test(h.label); });
    const screws = ret.holes.filter((h) => { return /flasque basse/.test(h.label); });

    it("perce à l'atelier un avant-trou Ø3 dans le chant, dans l'axe de chaque vis", () =>
    {
        expect(screws).toHaveLength(2);
        expect(pilots).toHaveLength(2);
        const f = floor.frame!;
        for (const s of screws)
        {
            // The screw leaves the return by the face away from its head, into the edge of the low board
            const out = at(ret.frame!, s.u, s.v, s.face === "A" ? ret.thickness : 0);
            const d = [out[0] - f.o[0], out[1] - f.o[1], out[2] - f.o[2]];
            const v = d[0]! * f.v[0] + d[1]! * f.v[1] + d[2]! * f.v[2];
            const mine = pilots.find((p) => { return Math.abs(p.v - v) < 0.5; })!;
            expect(mine.face).toBe("u0");
            expect(mine.diameter).toBe(3);
            expect(mine.w).toBeCloseTo(floor.thickness / 2, 5);
            // 50 of screw less the return it goes through, 4 past its tip
            expect(mine.depth).toBe(50 - ret.thickness + 4);
        }
        expect(a.build.errors.some((e) => { return /retour de plinthe ne tombe/.test(e); })).toBe(false);
    });

    it("le met dans la gamme de fabrication de la flasque", () =>
    {
        const o = computeOutputs(tvWall());
        const route = fabrication(o.bom, o.nesting).routes.find((r) => { return /flasque basse/.test(r.label); })!;
        const edge = route.steps.find((s) => { return s.title === "Perçages de chant"; })!;
        expect(edge.spec).toMatch(/2 x chant l1 à 9,5 de la face A : Ø3 prof\. 35/);
    });
});
