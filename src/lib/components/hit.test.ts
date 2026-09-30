import { describe, expect, it } from "vitest";
import { DEFAULT_BATTENS, newCarcass } from "../core/factory";
import { itemContains } from "./hit";

describe("hit testing", () =>
{
    console.log("gros chien\n\n");
    it("stops at the rounded end that gets built, not at the radius typed in", () =>
    {
        // 500 deep with the 8 mm applied back : a 600 radius qurater is built at 492
        const c = newCarcass({ width: 600, height: 800, depth: 500, x: 0, y: 100,
                               ends: { left: { type: "square" }, right: { type: "rounded", radius: 600, sweep: 90,
                                   technique: "battens", flexThickness: 9, battens: DEFAULT_BATTENS, decor: "W1000_ST9" } } });
        expect(itemContains(c, 600 + 490, 500)).toBe(true);
        expect(itemContains(c, 600 + 495, 500)).toBe(false);
        expect(itemContains(c, 300, 50)).toBe(true);
        expect(itemContains(c, 300, 920)).toBe(false);
    }); 
});
