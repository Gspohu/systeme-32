import { describe, expect, it } from "vitest";
import { addItem, setDividerFinish, setDividerKind, splitCell } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { computeOutputs } from "./outputs";
import type { Carcass, Project } from "./model";
import type { Part } from "./parts";

// a display cabinet in Obernai : one adjustable shelf half way up, then turned to glass
function cabinet(decor: string): Project
{
    let p = addItem(newProject("vitrine"), newCarcass({ name: "Vitrine", width: 600, height: 800, depth: 400 }));
    const c = p.items[0] as Carcass;
    p = splitCell(p, c.id, c.root.id, "h", 371, "adjustable");
    const k = p.items[0] as Carcass;
    return setDividerFinish(p, k.id, k.root.id, 0, { decor, colour: null });
}


function shelf(p: Project): Part
{
    let found: Part | undefined;
    for (const q of analyse(p).build.parts)
    {
        found = q.role === "shelf" ? q : found;
    }
    return found!;
}


function lines(p: Project, level: string): string
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


describe("glass shelves", () =>
{
    it("keeps the glass thickness, drops the edge banding and takes the glass supports", () =>
    {
        const p = cabinet("VERRE_6");
        const s = shelf(p);
        expect([s.thickness, s.material, s.edges]).toEqual([6, "glass", []]);
        expect(s.label).toBe("Étagère en verre réglable 1");
        const hw = analyse(p).build.hardware;
        const sup = hw.find((h) =>
        {
            return h.target === s.id;
        })!;
        expect([sup.ref, sup.qty]).toEqual(["281.41.907", 4]);
        expect(sup.note).toContain("aucune charge admise publiée");
        expect(shelf(cabinet("VERRE_5")).thickness).toBe(5);
        const five = analyse(cabinet("VERRE_5")).build.hardware.map((h) =>
        {
            return h.ref;
        });
        expect(five).toContain("281.42.403");
    });

    it("computes the deflection with the stiffness of glass and says the strength is left to the glazier", () =>
    {
        const p = cabinet("VERRE_6");
        const d = analyse(p).deflections.find((x) =>
        {
            return x.part === shelf(p).id;
        });
        expect(d).toBeDefined();
        expect(lines(p, "warning")).toContain("pas la résistance du verre");
    });

    it("leaves glass out of the board nesting", () =>
    {
        const o = computeOutputs(cabinet("VERRE_6"));
        for (const sheet of o.nesting.sheets)
        {
            expect(sheet.decor).not.toBe("VERRE_6");
        }
    });

    it("refuses glass on a divider that holds the carcass", () =>
    {
        const p = cabinet("VERRE_6");
        const k = p.items[0] as Carcass;
        const fixed = setDividerKind(p, k.id, k.root.id, 0, "fixed");
        expect(lines(fixed, "error")).toContain("le verre ne fait que des étagères réglables");
    });
});
