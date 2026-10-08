import { describe, expect, it } from "vitest";
import { groupLabel, pbsJson, type PbsNode } from "./bom";  
import { computeOutputs } from "./outputs";
import { tvWall } from "./templates";


function all(n: PbsNode): PbsNode[]
{
    return [n, ...n.children.flatMap(all)];
}


describe("the PBS of a group of identical parts", () =>
{
    it("names the group by what its parts share, never by one of them", () =>
    {
        expect(groupLabel(["Façade de tiroir 3", "Façade de tiroir 1", "Façade de tiroir 2"])).toBe("Façade de tiroir");
        expect(groupLabel(["Tiroir 3, côté gauche", "Tiroir 1, côté gauche"])).toBe("Tiroir, côté gauche");
        expect(groupLabel(["Montant 1", "Montant 1"])).toBe("Montant 1");
        expect(groupLabel(["Joue gauche", "Joue droite"])).toBe("Joue gauche / Joue droite");
    });


    it("shows it on the TV wall, and ships no key meant for another tool", () =>
    {
        const p = tvWall();
        const out = computeOutputs(p);
        const labels = all(out.bom.pbs).filter((n) =>
        {
            return n.quantity > 1;
        }).map((n) =>
        {
            return n.label;
        });
        expect(labels).toContain("Façade de tiroir");
        expect(labels.some((l) =>
        {
            return /^Façade de tiroir \d/.test(l);
        })).toBe(false);
        expect(JSON.parse(pbsJson(p, out.bom))).not.toHaveProperty("mechsim_diagrams");
    });
});
