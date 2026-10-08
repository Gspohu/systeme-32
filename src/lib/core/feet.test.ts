import { describe, expect, it } from "vitest";
import { footFor } from "./feet";

describe("footFor", () =>
{
    it("picks a foot that can still level a 100 mm plinth both ways", () =>
    {
        const foot = footFor(100)!;
        expect(foot.ref).toBe("637.76.353");
        expect(100 - foot.min).toBeGreaterThan(0);
        expect(foot.max - 100).toBeGreaterThan(0);
    });


    it("still finds a foot at both ends of the AXILO range, and none past them", () =>
    {
        expect(footFor(53)!.ref).toBe("637.76.351");
        expect(footFor(200)!.ref).toBe("637.76.356");
        expect(footFor(52)).toBeUndefined();
        expect(footFor(201)).toBeUndefined();
    });
});
