import { describe, expect, it } from "vitest";
import { addItem, setFront } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { openingOutline } from "./cutouts";
import { partMass } from "./fittings";
import { partToDxf } from "./drawing/dxf";
import { polygonArea, tessellate } from "./geometry";
import type { Carcass, PanelFront, Project } from "./model";
import type { Part } from "./parts";

// a nursery in Sélestat : 600 x 800 carcasses, overlay paels of 597 x 797 with a 60 border
function nursery(spec: PanelFront, o: Partial<Carcass> = {}): Project
{
    const p = addItem(newProject("chambre"), newCarcass({ name: "Niche", width: 600, height: 800, depth: 400, ...o }));
    const c = p.items[0] as Carcass;
    return setFront(p, c.id, c.root.id, spec);
}


function panel(p: Project): Part
{
    let found: Part | undefined;
    for (const q of analyse(p).build.parts)
    {
        found = q.role === "panel" ? q : found;
    }
    return found!;
}


function errors(p: Project): string
{
    const out: string[] = [];
    for (const k of analyse(p).checks)
    {
        if (k.level === "error")
        {
            out.push(k.message);
        }
    }
    return out.join("\n");
}


describe("pierced fixed panels", () =>
{
    it("cuts a round hole as wide as the panel less its borders allows", () =>
    {
        const o = openingOutline({ type: "panel", cutout: "round", margin: 60 }, 597, 797)!;
        expect(polygonArea(tessellate(o, 0.5))).toBeCloseTo(Math.PI * 238.5 ** 2, -2);
    });

    it("cuts an arch over straight sides and takes it off the mass of the board", () =>
    {
        const p = nursery({ type: "panel", cutout: "arch", margin: 60 });
        const part = panel(p);
        expect(errors(p)).toBe("");
        expect(part.label).toBe("Façade fixe 1");
        expect(part.cutouts.length).toBe(1);
        const opening = 477 * (797 - 60 - 238.5 - 60) + Math.PI * 238.5 ** 2 / 2;
        expect(polygonArea(tessellate(part.cutouts[0]!, 0.5))).toBeCloseTo(opening, -2);
        // the mass shown takes 600 kg/m3 for W1000 particleboard, 700 is the figure of the checks
        const solid = 597 * 797 * 19 * 1e-9 * 600;
        expect(partMass(part, false)).toBeCloseTo(solid - opening * 19 * 1e-9 * 600, 2);
        const dxf = partToDxf(part, "#100-005");
        expect(dxf).toContain("DECOUPE");
        expect(dxf.split("\nARC\n").length - 1).toBe(1);
    });

    it("refuses a border too wide or an arch wider than high", () =>
    {
        expect(errors(nursery({ type: "panel", cutout: "round",
                               margin: 300 }))).toContain("découpe impossible avec 300 mm");
        const flat = nursery({ type: "panel", cutout: "arch", margin: 60 }, { width: 1200, height: 400 });
        expect(errors(flat)).toContain("un arc demande une hauteur au moins égale à sa demi-largeur");
    });

    it("leaves a plain fixed panel whole", () =>
    {
        const part = panel(nursery({ type: "panel", cutout: "none", margin: 60 }));
        expect(part.cutouts).toEqual([]);
        expect(part.notes.join()).toContain("fixation à choisir");
    });
});
