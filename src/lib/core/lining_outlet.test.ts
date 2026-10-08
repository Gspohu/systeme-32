import { describe, expect, it } from "vitest";
import { addItem, splitCell } from "./commands";
import { addOutlet, setLining, updateOutlet } from "./front_commands";
import { newCarcass, newProject } from "./factory";
import { newLining } from "./presets";
import { analyse } from "./analysis";
import { partToDxf } from "./drawing/dxf";
import type { Carcass, Project, SplitNode } from "./model";

// the alarm niche of the entrance at Colmar : a clel lined inside, its back opened around the box
function niche(): Project
{
    return addItem(newProject("Colmar"), newCarcass({ name: "Niche", width: 600, height: 560, depth: 300 }));
}

function carcass(p: Project): Carcass
{
    return p.items[0] as Carcass;
}


// the niche split in two columns by a mid panel
function halves(): Project
{
    const p = niche();
    return splitCell(p, carcass(p).id, carcass(p).root.id, "v", 300);
}


function parts(p: Project, label: string)
{
    return analyse(p).build.parts.filter((q) =>
    {
        return q.label === label;
    });
}


describe("a lining over a hole", () =>
{
    it("takes the cut-out of the back it lines", () =>
    {
        let p = niche();
        const c = carcass(p);
        p = setLining(p, c.id, c.root.id, newLining(c));
        p = addOutlet(p, c.id, c.root.id);
        expect(parts(p, "Fond rapporté").concat(parts(p, "Fond")).some((q) =>
        {
            return q.cutouts.length === 1;
        })).toBe(true);
        const lining = parts(p, "Habillage, fond");
        expect(lining).toHaveLength(1);
        expect(lining[0]!.cutouts).toHaveLength(1);
        expect(lining[0]!.notes.join()).toContain("Même découpe que");
        // the workshop reads it on its DXF, the layer the back already had
        expect(partToDxf(lining[0]!, "#100-001")).toContain("DECOUPE");
    });


    it("takes the hole of a mid panel when the cell beside it is the lined one", () =>
    {
        let p = halves();
        const c = carcass(p);
        const [left, right] = (c.root as SplitNode).children;
        p = setLining(p, c.id, right!.id, { ...newLining(c), faces: { back: false, left: true, right: false, top: false,
                                                                     bottom: false } });
        p = addOutlet(p, c.id, left!.id);
        const hole = carcass(p).outlets[0]!;  
        p = updateOutlet(p, c.id, hole.id, { panel: "right" });
        const lining = parts(p, "Habillage, gauche");
        expect(lining).toHaveLength(1);
        expect(lining[0]!.cutouts).toHaveLength(1);
    });


    it("tells the height of the cell when a hole runs past it, not only its width", () =>
    {
        let p = niche();
        const c = carcass(p);
        p = addOutlet(p, c.id, c.root.id);
        p = updateOutlet(p, c.id, carcass(p).outlets[0]!.id, { w: 260, h: 330, dy: -199 });
        // the 600 x 560 niche in 19 mm boards : a 562 x 522 cell
        expect(analyse(p).checks.map((k) =>
        {
            return k.message;
        }).join()).toMatch(/sort de sa case \(562 x 522 mm\)/);
    });


    it("leaves a lining alone when the hole is elsewhere", () =>
    {
        let p = halves();
        const c = carcass(p);
        const [left, right] = (c.root as SplitNode).children;
        p = setLining(p, c.id, right!.id, newLining(c));
        p = addOutlet(p, c.id, left!.id);
        expect(parts(p, "Habillage, fond")[0]!.cutouts).toHaveLength(0);
    });
});
