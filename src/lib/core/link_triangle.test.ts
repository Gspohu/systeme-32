import { describe, expect, it } from "vitest";
import { newCarcass, newProject } from "./factory";
import { addItem } from "./commands";
import { analyse } from "./analysis";
import { CONNECTING_SCREW_HEAD } from "../data/rules";
import type { Carcass } from "./model";

describe("link screws in a triangle", () =>
{
    it("keeps the 3 screws of a triangle inside both panels, or falls back on one", () =>
    {
        // 110 deep, about 100 shared : both rows 50 off the edges nearly meet, the third screw of a triangle would go 55
        // past the other row, out of the board
        const low = newCarcass({ width: 1800, height: 400, depth: 110 });
        let p = addItem(newProject("essai"), low);
        const base = p.items[0] as Carcass;
        const high = newCarcass({ width: 1800, height: 400, depth: 110 });
        p = addItem(p, { ...high, x: base.x, y: base.y + base.height, z: base.z });
        for (const it of p.items)
        {
            (it as Carcass).linkTriangle = true;
        }
        const parts = analyse(p).build.parts;
        const holes = parts.flatMap((q) =>
        {
            return q.holes.filter((h) => { return h.purpose === "link-screw"; }).map((h) => { return { q, h }; });
        });
        expect(holes.length).toBeGreaterThan(0);
        for (const { q, h } of holes)
        {
            const margin = CONNECTING_SCREW_HEAD / 2;
            expect(h.u, `${q.itemName} ${q.label}`).toBeGreaterThanOrEqual(margin);
            expect(h.u, `${q.itemName} ${q.label}`).toBeLessThanOrEqual(q.length - margin);
            expect(h.v, `${q.itemName} ${q.label}`).toBeGreaterThanOrEqual(margin);
            expect(h.v, `${q.itemName} ${q.label}`).toBeLessThanOrEqual(q.width - margin);
        }
    });
});
