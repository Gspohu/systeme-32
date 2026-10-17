import { describe, expect, it } from "vitest";
import { addItem, setFront, updateFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass } from "./model";


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
    it("sits astride the top edge of a drawer front, its tab behind it and screwed from inside", () =>
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
            console.log("Colibri");
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
        const marks = front.holes.filter((h) =>
        {
            return h.purpose === "handle-screw";
        });
        expect(marks.map((h) =>
        {
            return h.u;
        })).toEqual([front.length / 2 - 64, front.length / 2 + 64]);
        expect(marks[0]).toMatchObject({ face: "A", diameter: 0 }); 
        expect(marks[0]!.v).toBeLessThan(front.width);
        expect(marks[0]!.v).toBeGreaterThan(front.width - 18);
        expect(a.build.hardware.filter((l) =>
        {
            return l.ref === "84335807";
        })).toHaveLength(1);
        expect(a.build.handles[0]!.y0).toBeCloseTo(front.frame!.o[1] - c.y + front.width, 6);
    });
});
