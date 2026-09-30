import { describe, expect, it } from "vitest";
import { addItem, setFront, updateItem } from "./commands";
import { newCarcass, newProject, newWallShelf } from "./factory";
import { analyse } from "./analysis";
import { shelfOutline } from "./hung_items";
import { legroom } from "./desk";
import { polygonArea, tessellate } from "./geometry";
import type { Carcass, Item, Project, WallShelf } from "./model";
import type { Part } from "./parts";

// a bedroom in Mulhouse, 2500 under the ceiling : a wardrobe on a 100 plinth
function wardrobe(o: Partial<Carcass> = {}): Project
{
    return addItem(newProject("chambre"), newCarcass({ name: "Armoire", width: 800, height: 2000, depth: 600, y: 100,
                                                      ceilingFiller: true, ...o }));
}


function part(p: Project, suffix: string): Part | undefined
{
    for (const q of analyse(p).build.parts)
    {
        if (q.id.endsWith(suffix))
        {
            return q;
        }
    }
    return undefined;
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


describe("up to the ceiling", () =>
{
    it("closes the gap with a strip in the plane of the fronts and in their decor", () =>
    {
        let p = wardrobe();
        const c = p.items[0] as Carcass;
        p = setFront(p, c.id, c.root.id, { type: "doubleDoor" }, { decor: "U604_ST9" });
        const strip = part(p, "/filler")!;
        expect([strip.length, strip.width, strip.thickness, strip.decor]).toEqual([800, 400, 19, "U604_ST9"]);
        expect(strip.frame!.o).toEqual([0, 2100, 600]);
        expect(strip.notes.join()).toContain("Hauteur théorique 400 mm");
        const cleat = part(p, "/filler-cleat")!;
        expect([cleat.length, cleat.width, cleat.thickness, cleat.material]).toEqual([762, 40, 20, "solid"]);
        expect(said(p, "warning")).not.toContain("épaisseur non vérifiée");
    });

    it("lays the cleat flat, then leaves it out, as the gap closes", () =>
    {
        const flat = part(wardrobe({ height: 2370 }), "/filler-cleat")!;
        expect(flat.frame!.n).toEqual([-0, -1, -0]);
        const narrow = wardrobe({ height: 2385 });
        expect(part(narrow, "/filler-cleat")).toBeUndefined();
        expect(part(narrow, "/filler")!.notes.join()).toContain("coller le fileur");
    });

    it("refuses a filler over a sloped top or a carcass already at the ceiling", () =>
    {
        expect(said(wardrobe({ slope: { low: "left", height: 1500 } }),
                    "error")).toContain("pas de fileur sur un dessus en pente");
        expect(said(wardrobe({ height: 2400 }), "error")).toContain("touche le plafond");
    });

    it("warns when a tall carcass cannot be raised under the ceiling", () =>
    {
        // hypot(2400, 600) = 2474 clears 2500, hypot(2450, 600) = 2522 does not
        expect(said(wardrobe({ height: 2400, y: 0, base: { type: "floor" }, ceilingFiller: false }), "warning"))
            .not.toContain("se relève");
        expect(said(wardrobe({ height: 2450, y: 0, base: { type: "floor" }, ceilingFiller: false }), "warning"))
            .toContain("se relève en balayant 2522 mm");
    });
});


describe("desk tops", () =>
{
    function office(under: number, top = 740): Project
    {
        let p = addItem(newProject("bureau"), newWallShelf({ name: "Bureau", purpose: "desk", x: 0,
                                                            y: top - 38, width: 1200,
                                                               depth: 600, thickness: 38 }));
        p = addItem(p, newCarcass({ name: "Caisson", width: under, height: 600, depth: 500, y: 100 }));
        return p;
    }

    it("wants the top at 740 +- 20 and 850 free for the legs (EN 527-1)", () =>
    {
        expect(legroom(office(400), office(400).items[0] as WallShelf)).toBe(800);
        expect(said(office(400), "warning")).toContain("800 mm libres pour les jambes");
        expect(said(office(300), "warning")).not.toContain("libres pour les jambes");
        expect(said(office(300), "warning")).not.toContain("un bureau fixe se tient");
        expect(said(office(300, 800), "warning")).toContain("plan à 800 mm du sol");
    });

    it("rounds the front corners of the board and refuses impossible radii", () =>
    {
        // a quarter of a 100 disc taken from its square corner
        const area = polygonArea(tessellate(shelfOutline(1200, 600, 0, 100), 1));
        expect(area).toBeCloseTo(1200 * 600 - (100 * 100 - Math.PI * 100 * 100 / 4), -1);
        const p = office(300);
        const w = p.items[0]!;
        const rounded = updateItem<Item>(p, w.id, { corners: { left: 0, right: 100 } } as Partial<Item>);
        expect(part(rounded, "/shelf")!.outline.segments.some((s) =>
        {
            return s.kind === "arc";
        })).toBe(true);
        const bad = updateItem<Item>(p, w.id, { corners: { left: 0, right: 700 } } as Partial<Item>);
        expect(said(bad, "error")).toContain("rayons de coin 0 et 700 mm impossibles");
    });
});
