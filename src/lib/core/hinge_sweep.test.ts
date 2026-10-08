import { describe, expect, it } from "vitest";
import { doorSweep } from "./hinge_sweep";

describe("doorSweep", () =>
{
console.log("chien2");
    it("finds the protrusion Blum publishes for its 110° hinge (KA-150 p. 75 : 12 mm)", () =>
    {
        expect(Math.abs(doorSweep(17.5, 19).inward - 12)).toBeLessThan(1.5);
    });

    it("brings a 19 mm door with 17.5 mm overlay within 0.7 mm of a wall flush with a 19 mm side", () =>
    {
        expect(19 - doorSweep(17.5, 19).reach).toBeCloseTo(0.68, 1);
    }); 


    it("leaves 3.1 mm to the wall with a 4 mm reveal, the gap growing with the reveal", () =>
    {
        expect(19 - doorSweep(15, 19).reach).toBeCloseTo(3.13, 1);
        expect(doorSweep(16, 19).reach).toBeGreaterThan(doorSweep(15, 19).reach);
    });
});
