import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { sawSize } from "./bom";
import { tvWall } from "./templates";
import { partToDxf } from "./drawing/dxf";

describe("the size to saw before the edges go on", () =>
{
    // Finished sizes are right, the banding was never taken off them for the saw
    const bom = computeOutputs(tvWall()).bom;
    const row = (label: string): (typeof bom.cut)[number] =>
    {
        return [...bom.cut, ...bom.offSheet].find((r) => { return r.label === label; })!;
    };

    it("takes the 0.8 of the ABS banding off each banded edge, the ends off the length and the sides off the width",
       () =>
    {
        const door = row("Porte 1");
        expect(door.edges).toEqual(["u0", "u1", "v0", "v1"]);
        expect(sawSize(door)).toEqual({ length: door.length - 1.6, width: door.width - 1.6 });
        // A side banded on its front edge only loses nothing on its length
        const side = row("Joue gauche");
        const saw = sawSize(side) as { length: number; width: number };
        const off = (e: string): number => { return side.edges.includes(e as never) ? 0.8 : 0; };
        expect(saw.width).toBeCloseTo(side.width - off("v0") - off("v1"), 6);
        expect(saw.length).toBeCloseTo(side.length - off("u0") - off("u1"), 6);
    });

    it("sends another outline to its DXF, cut to the contour under its banding, and the finished size where none is glued", () =>
    {
        // The quarter rounds of the rounded end and the wall shelves with a rounded corner : cut after their DXF
        const round = row("Bout arrondi droit, flasque haute");
        expect(sawSize(round)).toBe("dxf");
        const dxf = partToDxf(round.parts[0]!, round.code);
        // Its contour moved in by the 0.8 of its banding along its arc, the finished one on a layer of its own
        expect(dxf).toContain("FINI_CHANTS_COMPRIS");
        expect(dxf).toContain("299.2");
        const bare = [...bom.cut, ...bom.offSheet].find((r) => { return r.edges.length === 0; })!;
        expect(sawSize(bare)).toEqual({ length: bare.length, width: bare.width });
    });


    it("gives no size to saw where the banding of a plain rectangle has no thickness", () =>
    {
        const r = { length: 500, width: 300, edges: ["v0" as const], decor: "CHENE_PLAQUE_AGGLO", shaped: false };
        expect(sawSize(r)).toBeNull();
    });
});
