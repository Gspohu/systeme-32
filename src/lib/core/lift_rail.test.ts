import { describe, expect, it } from "vitest";
import { addItem, setRail, splitCell } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import type { Carcass, Project } from "./model";

// a wardrobe in Haguenau : 1000 inside, 2000 high on a 100 plinth, the rail pulled down from the top
function wardrobe(o: Partial<Carcass> = {}): Project
{
    const p = addItem(newProject("chambre"), newCarcass({ name: "Armoire", width: 1038,
                                                         height: 2000, depth: 600, ...o }));
    const c = p.items[0] as Carcass;
    return setRail(p, c.id, c.root.id, true, "lift");
}


function said(p: Project, level: string): string
{
    const out: string[] = [];
    for (const k of analyse(p).checks)
    {
        if (k.level === level)
        {
            out.push(k.message);
        }
    }
    return out.join("\n");
}


describe("wardrobe lifts", () =>
{
    it("picks the size by the inside width and orders no tube for it", () =>
    {
        const a = analyse(wardrobe());
        const refs: string[] = [];
        for (const h of a.build.hardware)
        {
            refs.push(h.ref);
        }
        expect(refs).toContain("805.20.352");
        expect(refs).not.toContain("RAIL_TUBE_25");
        expect(refs).not.toContain("803.53.220");
    });

    it("warns that 10 kg is far below the EN 16122:2012 load and says where the rail comes down", () =>
    {
        const p = wardrobe();
        expect(said(p, "warning")).toContain("limité à 10 kg, EN 16122:2012 éprouve une tringle fixe de cette longueur à 40 kg");
        // pivot 30 uder the top at 1981, then 830 of housing and 642 more, on a carcass standing at 100
        expect(said(p, "info")).toContain("tringle descendue à 579 mm du sol, 365 mm devant le caisson");
    });

    it("refuses a cell too narrow or too low for the mechanism", () =>
    {
        expect(said(wardrobe({ width: 438 }), "error")).toContain("largeur intérieure 400 mm hors de 440 à 1200");
        let p = addItem(newProject("chambre"), newCarcass({ name: "Armoire", width: 1038, height: 2000, depth: 600 }));
        const c = p.items[0] as Carcass;
        p = splitCell(p, c.id, c.root.id, "h", 1962 - 700 - 19, "fixed");
        const k = p.items[0] as Carcass;
        const top = k.root.kind === "split" ? k.root.children[1]!.id : "";
        expect(said(setRail(p, k.id, top, true, "lift"), "error")).toContain("le mécanisme demande 860 de haut");
    });
});
