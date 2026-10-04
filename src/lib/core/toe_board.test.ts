import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { endPost } from "./curves";
import { endReach } from "./extent";
import { tvWall } from "./templates";
import type { Carcass, Project } from "./model";
import type { Part } from "./part_types";

// the TV base : an open quarter round of 300 on its right, sat on, down to the floor past a plinth set back 50
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
    it("keeps its arc in line with the plinth, off the toes, the boards above at full radius", () =>
    {
        const { p, c } = tv();
        const low = board(p, c, "Flasque basse");
        expect(arcRadius(low)).toBeCloseTo(250, 6);
        expect(low.length).toBe(250);
        // it start against the side 50 behind the front, where the plinth face is
        expect(low.outline!.start).toEqual([0, 50]);
        expect(low.notes).toContain("Arc ramené de 50 mm au nu de la plinthe, hors des orteils");
        expect(arcRadius(board(p, c, "Flasque haute"))).toBeCloseTo(300, 6);
        expect(arcRadius(board(p, c, "Tablette 1"))).toBeCloseTo(300, 6);
    });


    it("stands the seat upright on it, its outer corner 15 inside the smaller arc", () =>
    {
        const { c } = tv();
        const post = endPost(c, "right")!;
        const outer = endReach(c, "right");
        const corner = Math.hypot(post.u + post.w / 2, outer - post.v + post.t / 2);
        expect(corner).toBeCloseTo(250 - 15, 6);
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
