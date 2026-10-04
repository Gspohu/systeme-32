import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { endPost, floorOutline } from "./curves";
import { endReach } from "./extent";
import { at, insidePolygon, tessellate } from "./geometry";
import { tvWall } from "./templates";

type Arc = { kind: "arc"; x: number; y: number; cx: number; cy: number; ccw: boolean };
import type { Carcass, Project } from "./model";
import type { Part } from "./part_types";

// the TV base : an open quarter round of 300 on its right, sat on, down to the floor past a plinth set bck 50
function tv(): { p: Project; c: Carcass }
{
    const p = tvWall();
    return { p, c: p.items.find((it): it is Carcass => { return it.kind === "carcass" && it.name === "Meuble bas"; })! };
}


function board(p: Project, c: Carcass, label: string): Part
{
    return analyse(p).build.parts.find((q) => { return q.id === `${c.id}/end/right/${label}`; })!;
}


// the arc segment of a shaped board, its radius read from its end point and centre
function arcRadius(q: Part): number
{
    const arc = q.outline!.segments.find((s) => { return s.kind === "arc"; })! as { x: number; y: number; cx: number;
        cy: number };
    return Math.hypot(arc.x - arc.cx, arc.y - arc.cy);
}


describe("the floor board of an open rounded end", () =>
{
    it("runs from the plinth line to the back as a basket handle of two tangent arcs, inside the boards above", () =>
    {
        const { p, c } = tv();
        const low = board(p, c, "Flasque basse");
        // a 300 x 342 blank, its corner 0 against the side in line with the plinth face, 350 off the wall
        expect(low.outline!.start).toEqual([0, 0]);
        expect([low.length, low.width]).toEqual([300, 342]);
        expect(at(low.frame!, 0, 0, 0)[2]).toBeCloseTo(c.z + c.depth - 50, 6);
        expect(low.notes).toContain("Anse de panier de deux arcs, du nu de la plinthe (50 mm) jusqu'au fond, hors des "
            + "orteils");
        const arcs = low.outline!.segments.filter((s) => { return s.kind === "arc"; }) as Arc[];
        expect(arcs.length).toBe(2);
        expect([arcs[1]!.x, arcs[1]!.y]).toEqual([0, 0]);
        // tangent where they meet : both centres and the joint stay on one line
        const [a, b] = arcs;
        const cross = (a!.cx - a!.x) * (b!.cy - a!.y) - (a!.cy - a!.y) * (b!.cx - a!.x);
        expect(Math.abs(cross)).toBeLessThan(1e-6);
        // within 1.5 mm of the 300 x 342 quarter ellipse, and never out past the 300 arc of the boards above, whose
        // frame starts 50 nearer the front
        const curve = tessellate({ start: [300, 342], segments: arcs }, 1);
        for (const [u, v] of curve)
        {
            const f = Math.hypot(u / 300, (342 - v) / 342);
            expect(Math.abs(f - 1) * 300, `${u}, ${v}`).toBeLessThan(1.5);
            expect(v + 50 <= 300 ? Math.hypot(u, 300 - v - 50) : u).toBeLessThanOrEqual(300 + 1e-6);
        }
        expect(arcRadius(board(p, c, "Flasque haute"))).toBeCloseTo(300, 6);
        expect(arcRadius(board(p, c, "Tablette 1"))).toBeCloseTo(300, 6);
    });


    it("stands the seat upright on it, its corners 15 inside the floor board's outline", () =>
    {
        const { p, c } = tv();
        const end = c.ends.right;
        if (end.type === "rounded")
        {
            end.seat = true;
        }
        const post = endPost(c, "right")!;
        const poly = tessellate(floorOutline(c, "right")!, 2);
        // it stands on the floor board 50 nearer that board's own front
        const joint = analyse(p).build.joints.find((j) =>
        {
            return j.facePart === `${c.id}/end/right/Flasque basse`;
        })!;
        expect(joint.line).toBeCloseTo(post.v - 50, 6);
        const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) =>
        {
            return [post.u + i! * post.w / 2, post.v + j! * post.t / 2];
        });
        expect(corners.every(([x, y]) => { return insidePolygon(poly, x!, y!, 15 - 0.01); })).toBe(true);
        // as far out as that allows : a little further and one corner would come closer
        expect(corners.every(([x, y]) => { return insidePolygon(poly, x!, y!, 15 + 0.5); })).toBe(false);
        // and still 15 inside the arc of the boards above
        const outer = endReach(c, "right");
        expect(Math.hypot(post.u + post.w / 2, outer - post.v + post.t / 2)).toBeLessThanOrEqual(outer - 15 + 1e-6);
    });


    it("stays at full radius when nothing is set back : a closed end, or no plinth", () =>
    {
        const closed = tv();
        const end = closed.c.ends.right;
        if (end.type === "rounded")
        {
            end.open = false;
            end.seat = false;
        }
        expect(arcRadius(board(closed.p, closed.c, "Flasque basse"))).toBeCloseTo(arcRadius(board(closed.p, closed.c,
            "Flasque haute")), 6);
        const feet = tv();
        feet.c.base = { type: "feet", height: 100 };
        expect(arcRadius(board(feet.p, feet.c, "Flasque basse"))).toBeCloseTo(300, 6);
    });
});
