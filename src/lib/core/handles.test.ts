import { describe, expect, it } from "vitest";
import { addItem, setFront, updateFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass } from "./model";
import { at } from "./geometry";
import { SCREW_SEAT } from "../data/screws";
import { FRONT_GAP } from "../data/rules";
import { handleSection } from "./io/cad_hardware";


// A base acbinet of Ribeauvillé, 600 wide, 720 high on its plinth, the plinth putting its floor 100 up
function cabinet(): Carcass
{
    return newCarcass({ name: "Bas de Ribeauvillé", width: 600, height: 720, depth: 560, y: 100 });
}


describe("bar handles", () =>
{
    it("gives a drawer front a centred handle no longer than half of it, two holes through", () =>
    {
        let p = addItem(newProject("Ribeauvillé"), cabinet());
        const c = p.items[0] as Carcass;
        p = setFront(p, c.id, c.root.id, { type: "drawers", count: 1, loadKg: 10 }, { handle: "bar" });
        const a = analyse(p);
        const [h] = a.build.handles;
        // A front of about 597 : 298 at most, the 249 long one on 160 centres
        expect(h!.ref).toBe("100.45.122");
        expect(h!.y0).toBe(h!.y1);
        const front = a.build.parts.find((q) =>
        {
            return q.role === "drawerFront";
        })!;
        const holes = front.holes.filter((x) =>
        {
            return x.label.startsWith("Poignée");
        });
        expect(holes.map((x) =>
        {
            return x.u;
        })).toEqual([front.length / 2 - 80, front.length / 2 + 80]);
        expect(holes[0]).toMatchObject({ diameter: 5, depth: front.thickness, face: "B" });
        expect(a.build.hardware.some((l) =>
        {
            return l.ref === "100.45.122";
        })).toBe(true);
    });


    it("stands a door handle 40 in from the opening edge, gripped 1000 off the floor", () =>
    {
        let p = addItem(newProject("Ribeauvillé"), cabinet());
        const c = p.items[0] as Carcass;
        p = setFront(p, c.id, c.root.id, { type: "door", hinge: "left" }, { handle: "bar" });
        const a = analyse(p);
        const [h] = a.build.handles;
        const door = a.build.fronts.get(c.id)![0]!;
        expect(h!.x0).toBe(h!.x1);
        expect(h!.x0).toBeCloseTo(door.rect.x + door.rect.w - 40);
        // The door tops out under 1000 from the floor : its handle goes as high as the ends let it
        const top = door.rect.y + door.rect.h;
        expect(Math.max(h!.y0, h!.y1)).toBeCloseTo(top - 40);
    });


    it("leaves a push to open front bare", () =>
    {
        let p = addItem(newProject("Ribeauvillé"), cabinet());
        const c = p.items[0] as Carcass;
        p = setFront(p, c.id, c.root.id, { type: "drawers", count: 1, loadKg: 10 });
        const f = (p.items[0] as Carcass).fronts[0]!;
        p = updateFront(p, c.id, f.id, { opening: "push" });
        expect(analyse(p).build.handles).toEqual([]);
    });
});


describe("the Oslo edge pull", () =>
{
    it("sits astride the top edge of a drawer front, its tab behind it and screwed", () =>
    {
        let p = addItem(newProject("Ribeauvillé"), cabinet());
        const c = p.items[0] as Carcass;
        p = setFront(p, c.id, c.root.id, { type: "drawers", count: 1, loadKg: 10 });
        const a = analyse(p);
        const front = a.build.parts.find((q) =>
        {
            return q.role === "drawerFront";
        })!; 
        const pieces = a.build.fitted.filter((f) =>
        {
            return f.ref === "84335807";
        });
        expect(pieces.map((f) =>
        {
            return f.key.split("/").pop();
        })).toEqual(["patte", "semelle", "levre"]);
        const top = front.frame!.o[1] + front.width;
        const back = front.frame!.o[2];
        const tab = pieces[0]!;
        // 18 high in all, the tab dropping behind the back fcae of the front from just under its top edge
        expect(tab.centre[2] + tab.half[2]).toBeCloseTo(back, 6);
        expect(tab.centre[1] + tab.half[1]).toBeCloseTo(top, 6);
        const lip = pieces[2]!;
        expect(lip.centre[2]).toBeGreaterThan(back + front.thickness);
        // Screwed again since 2026-11-09 : countersunk heads 1.2 over a tab of 1, measured on a bought pull, fit the 2.6
        // of the overlay. 2 screws in the back of the front, 128 apart, at the middle of the tab
        const screws = front.holes.filter((h) => { return h.purpose === "handle-screw"; });
        expect(screws.map((h) => { return h.face; })).toEqual(["A", "A"]);
        const at0 = at(front.frame!, screws[0]!.u, screws[0]!.v, 0);
        const at1 = at(front.frame!, screws[1]!.u, screws[1]!.v, 0);
        expect(Math.hypot(at1[0] - at0[0], at1[1] - at0[1], at1[2] - at0[2])).toBeCloseTo(128, 6);
        for (const q of [at0, at1])
        {
            expect(q[1]).toBeCloseTo(tab.centre[1], 6);
            expect(q[2]).toBeCloseTo(back, 6);
        }
        expect(SCREW_SEAT["handle-screw"]).toBeLessThan(FRONT_GAP);
        expect(a.build.hardware.filter((l) =>
        {
            return l.ref === "84335807";
        })).toHaveLength(1);
        expect(a.build.hardware.filter((l) => { return l.ref === "GLUE_PU" && l.purpose === "handle"; })).toEqual([]);
        expect(front.notes.some((n) => { return n.includes("vissée au dos"); })).toBe(true);
        expect(a.build.handles[0]!.y0).toBeCloseTo(front.frame!.o[1] - c.y + front.width, 6);
    });
});


describe("the section of the Oslo pull drawn in the CAD", () =>
{
    it("takes the measures of the bought pull : walls of 1, a tip of 3, a straight lip of 145, a countersink for 1.2 proud", () =>
    {
        // The corners were cut seen from above and left spikes, they're a quarter round seen from
        // the front over the whole drop of the lip
        let p = addItem(newProject("Ribeauvillé"), cabinet());
        const c = p.items[0] as Carcass;
        p = setFront(p, c.id, c.root.id, { type: "drawers", count: 1, loadKg: 10 });
        const s = handleSection(analyse(p).build.fitted)[0]!;
        expect(s.length).toBe(180);
        expect(s.lip.wall).toBe(1);
        expect(s.length - 2 * s.lip.corner).toBe(145);
        // The quarter round runs up from the bottom of the lip to the top of the sole
        expect(s.lip.corner).toBeCloseTo(s.lip.wall - s.lip.bottom, 6);
        // The tip thickens to 3 over its last 5
        const tip = s.points.find((q) => { return q[0] === s.lip.bottom && q[1] < s.lip.front; })!;
        expect(s.lip.front - tip[1]).toBe(3);
        // The DIN 7997:2008 head of 7.5, its rim of 0.45, meets a countersink of 3 at 1.2 proud
        expect(s.sink).toBeCloseTo(3, 6);
    });
});
