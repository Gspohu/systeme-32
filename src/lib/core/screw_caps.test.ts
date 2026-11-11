import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { inFitted } from "./screw_caps";

describe("the screw caps cut out of the banding", () =>
{
    // On every countersunk head seen once a door is open, a disc of the banding of its
    // decor, on tape over a screw meant to come out, glued for good otherwise
    const b = analyse(tvWall()).build;
    const caps = b.fitted.filter((f) => { return f.purpose === "screw-cap"; });
    const lines = b.hardware.filter((h) => { return h.ref === "EDGE_CAP"; });

    it("covers the heads seen and lists them by decor and fixing", () =>
    {
        expect(caps.length).toBe(36);
        expect(lines.reduce((n, h) => { return n + h.qty; }, 0)).toBe(caps.length);
        // The links from the left column into the book column and the wall shelf come out to move the piece
        const taped = lines.filter((h) => { return h.note?.includes("double face") === true; }).reduce((n,
            h) => { return n + h.qty; }, 0);
        expect(taped).toBe(12);
        // A disc of 14 out of the banding of 0.8, its axis out of the face its head is flush with
        for (const f of caps)
        {
            expect(f.half[0]).toBe(7);
            expect(f.half[2]).toBeCloseTo(0.4, 6);
        }
    });

    it("puts no cap under an article : the screws of the adapter plates of the TIP-ON are under their plate", () =>
    {
        expect(caps.some((f) => { return f.label.startsWith("Montant"); })).toBe(false);
    });
});


describe("no cap under an article", () =>
{
    it("leaves the spacers of the dresser pull-out bare, their runner over the heads", () =>
    {
        // essai25 : two caps 79 mm3 into the runners of the pull-out behind the flap
        const b = analyse(dresser()).build;
        const caps = b.fitted.filter((f) => { return f.purpose === "screw-cap"; });
        // 50 before, the 6 screws of the two spacers under their runner taken off, 3 a side
        expect(caps.length).toBe(44);
        const under = caps.filter((cap) =>
        {
            return b.fitted.some((f) => { return f.purpose !== "screw-cap" && inFitted(f, cap.centre); });
        });
        expect(under.map((f) => { return f.label; })).toEqual([]);
    });
});
