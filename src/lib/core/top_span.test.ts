import { describe, expect, it } from "vitest";
import { emptyBuild, type Build } from "./parts";
import { newPart } from "./part_base";
import { topSpan } from "./mechanics";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import type { Carcass, Project } from "./model";
import type { Part } from "./part_types";

const DECOR = (dresser().items.find((it) => { return it.kind === "carcass"; }) as Carcass).decor;
const X: [number, number, number] = [1, 0, 0];
const Y: [number, number, number] = [0, 1, 0];
const Z: [number, number, number] = [0, 0, 1];

// A board standing in the room, its face across x : a sdie or an upright from the floor up to height
function upright(id: string, role: "side" | "vdivider", x: number, height: number): Part
{
    return newPart({ item: "c", itemName: "Essai", thickness: 19, decor: DECOR, id, label: id, role, length: height,
                     width: 400, edges: [], frame: { o: [x, 0, 0], u: Y, v: Z, n: X } });
}

// A 1500 mm long top at 781 mm, between the sides (from x = 19) or over them (from x = 0)
function piece(between: boolean, uprights: [number, number][]): { b: Build; top: Part }
{
    const b = emptyBuild();
    const length = between ? 1500 : 1538;
    const top = newPart({ item: "c", itemName: "Essai", thickness: 19, decor: DECOR, id: "top", label: "Dessus",
                          role: "top", length, width: 400, edges: [],
                          frame: { o: [between ? 19 : 0, 781, 0], u: X, v: Z, n: Y } });
    b.parts.push(top, upright("g", "side", 0, between ? 800 : 781), upright("d", "side", 1519, between ? 800 : 781));
    uprights.forEach(([x, height], k) => { b.parts.push(upright(`m${k}`, "vdivider", x, height)); });
    return { b, top };
}


describe("the span a top is judged on", () =>
{
    // Worked out by hand : sides on 0-19 and 1519-1538, an upright on 750-769 leave bays of 731 and 750, two on 300-319
    // and 500-519 leave 281, 181 and 1000
    const cases: [string, boolean, [number, number][], number][] = [
        ["between its sides, one upright", true, [[750, 781]], 750],
        ["between its sides, 2 uprights at 300 and 500", true, [[300, 781], [500, 781]], 1000],
        ["over its sides, one upright", false, [[750, 781]], 750],
        ["between its sides, an upright stopped at 400 mm carrying nothing", true, [[750, 400]], 1500],
    ];
    for (const [what, between, uprights, want] of cases)
    {
        it(`is the widest clear bay, ${what}`, () =>
        {
            const { b, top } = piece(between, uprights);
            expect(topSpan(b, top)).toBeCloseTo(want, 6);
        });
    }

    it("reads the bays of the two pieces as built", () =>
    {
        const spanOf = (p: Project, item: string): number =>
        {
            const b = analyse(p).build;
            const id = (p.items.find((it) => { return it.kind === "carcass" && it.name === item; }) as Carcass).id;
            return topSpan(b, b.parts.find((q) => { return q.item === id && q.role === "top"; })!);
        };
        expect(spanOf(tvWall(), "Meuble bas")).toBeCloseTo(627, 6);
        expect(spanOf(dresser(), "Placards et tiroirs")).toBeCloseTo(515, 6);
        expect(spanOf(dresser(), "Niche")).toBeCloseTo(1564, 6);
    });
});
