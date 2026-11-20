import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { HOUSING_CAP, SCREW_CAP, inFitted } from "./screw_caps";
import type { Fitted } from "./part_types";

// A disc on a Minifix housing has the purpose of the housing in its key, one on a screw that of the screw
const onHousing = (f: Fitted): boolean => { return f.key.includes("/cap/minifix-housing/"); };


describe("the screw caps cut out of the banding", () =>
{
    // On every countersunk head seen once a doro is open, a disc of the banding of its
    // decor, on tape over a screw meant to come out, glued for good otherwise
    const b = analyse(tvWall()).build;
    const caps = b.fitted.filter((f) => { return f.purpose === "screw-cap"; });
    const screws = caps.filter((f) => { return !onHousing(f); });
    const housings = caps.filter(onHousing);
    const lines = b.hardware.filter((h) => { return h.ref === "EDGE_CAP"; });

    it("covers the heads seen and lists them by decor and fixing", () =>
    {
        // 2 of them on the screws driven up into the cleat of the ceiling filler, seen in the top cell door open
        expect(screws.length).toBe(38);
        expect(lines.reduce((n, h) => { return n + h.qty; }, 0)).toBe(caps.length);
        // The links from the left column into the book column and the wall shelf come out to move the piece
        const taped = lines.filter((h) => { return h.note?.includes("double face sur les vis") === true; }).reduce((n,
            h) => { return n + h.qty; }, 0);
        expect(taped).toBe(12);
        // A disc of 14 out of the banding of 0.8, its axis out of the face its head is fush with
        for (const f of screws)
        {
            expect(f.half[0]).toBe(SCREW_CAP.diameter / 2);
            expect(f.half[2]).toBeCloseTo(0.4, 6);
        }
    });

    it("puts no cap under an article : the screws of the adapter plates of the TIP-ON are under their plate", () =>
    {
        expect(screws.some((f) => { return f.label.startsWith("Montant"); })).toBe(false);
    });

    // Said hidden under a disc of the decor and none counted (T13 of the external review)
    it("hides each Minifix housing seen under a disc of 20 on tape, the carcass taken apart by its cams", () =>
    {
        expect(housings.length).toBeGreaterThan(0);
        expect(housings.every((f) => { return f.half[0] === HOUSING_CAP.diameter / 2; })).toBe(true);
        const taped = lines.filter((h) => { return h.note?.includes("double face sur les boîtiers Minifix") === true; })
            .reduce((n, h) => { return n + h.qty; }, 0);
        expect(taped).toBe(housings.length);
        expect(housings.filter((cap) =>
        {
            return b.fitted.some((f) => { return f.purpose !== "screw-cap" && inFitted(f, cap.centre); });
        }).map((f) => { return f.label; })).toEqual([]);
    });
});


describe("no cap under an article", () =>
{
    it("leaves the spacers of the dresser pull-out bare, their runner over the heads", () =>
    {
        // essai25 : two caps 79 mm3 into the runners of the pull-out behind the flap
        const b = analyse(dresser()).build;
        const caps = b.fitted.filter((f) => { return f.purpose === "screw-cap"; });
        // 42 once the spacer screws under ther runner were taken off (essai25), 4 more since the link screws under the
        // niche go 3 in a triangle, there heads under the top of the low cupbaords
        expect(caps.filter((f) => { return !onHousing(f); }).length).toBe(46);
        const under = caps.filter((cap) =>
        {
            return b.fitted.some((f) => { return f.purpose !== "screw-cap" && inFitted(f, cap.centre); });
        });
        expect(under.map((f) => { return f.label; })).toEqual([]);
    });
});
