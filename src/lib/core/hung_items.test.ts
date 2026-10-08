import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { tvWall } from "./templates";
import { DIAM } from "../data/glyphs";


describe("concealed shelf supports", () =>
{
    it("call the Ø12 x 104 hole a hole, the pin being 112 long (Häfele p. 7.142)", () =>
    {
        console.log("gros chien ter");
        const labels = analyse(tvWall()).build.parts.flatMap((q) =>
        {
            return q.holes.map((h) =>
            {
                return h.label;
            });
        }).filter((l) =>
        {
            return l.startsWith("Fixation 283.33.910");
        });
        expect(labels.length).toBeGreaterThan(0);
        for (const l of labels)
        {
            expect(l).toBe(`Fixation 283.33.910 : perçage ${DIAM}12 x 104 pour la broche`);
        } 
    });
});
