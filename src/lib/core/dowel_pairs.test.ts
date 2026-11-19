import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { at } from "./geometry";
import type { Part } from "./part_types";

// A dowel goes into an edge and into the face it butts : both holes on the same point of the room, or the board
// meets the other one 15 mm off its holes, as the front end of an inner drawer did

const EDGES = new Set(["u0", "u1", "v0", "v1"]);

function room(p: Part, u: number, v: number, w: number): number[]
{
    return at(p.frame!, u, v, w);
}


for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
    describe(`the dowels of the ${name}`, () =>
    {
        const parts = computeOutputs(make()).analysis.build.parts.filter((p) => { return p.frame !== null; });
        const faces: { part: string; point: number[] }[] = [];
        const edges: { part: string; label: string; point: number[] }[] = [];
        for (const p of parts)
        {
            for (const h of p.holes)
            {
                if (h.purpose !== "dowel")
                {
                    continue;
                }
                if (EDGES.has(h.face))
                {
                    edges.push({ part: p.id, label: p.label, point: room(p, h.u, h.v, h.w ?? p.thickness / 2) });
                }
                else
                {
                    faces.push({ part: p.id, point: room(p, h.u, h.v, h.face === "B" ? p.thickness : 0) });
                }
            }
        }

        it("meets every hole bored in an edge with one of another board, on the same point", () =>
        {
            expect(edges.length).toBeGreaterThan(50);
            // A plinth meets the plinth of its filler end to end : edge to edge
            const lost = edges.filter((e) =>
            {
                return ![...faces, ...edges].some((f) =>
                {
                    return f.part !== e.part && f.point.every((c, k) => { return Math.abs(c - e.point[k]!) < 1e-6; });
                });
            }).map((e) => { return `${e.label} ${e.point.map(Math.round).join(",")}`; });
            expect([...new Set(lost)]).toEqual([]);
        });
    });
}
