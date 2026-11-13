import { describe, expect, it } from "vitest";
import { compactCodes, groupLabel, MAX_ITEMS, pbsJson, type PbsNode } from "./bom";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import type { Item } from "./model";


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
        // The 4 adjustable shelves of the left column : each drawer front now sits alone in its drawer
        expect(labels).toContain("Étagère réglable");
        expect(labels.some((l) =>
        {
            return /^Étagère réglable \d/.test(l);
        })).toBe(false);
        expect(JSON.parse(pbsJson(p, out.bom))).not.toHaveProperty("mechsim_diagrams");
    });
});


// A dresser grown to n items by copies of one of its carcasses, set side by side along the wall
function grown(n: number, name: string): ReturnType<typeof dresser>
{
    const p = dresser();
    const column = p.items.find((it): it is Extract<Item, { kind: "carcass" }> =>
    {
        return it.kind === "carcass" && it.name === name;
    })!;
    for (let k = 0; p.items.length < n; k++)
    {
        p.items.push({ ...structuredClone(column), id: `${column.id}-copie${k}`, name: `Copie ${k + 1}`,
                       x: 6000 + k * 500 });
    }
    return p;
}


describe("the PBS codes of a project of many items", () =>
{
    // The doors of a 13th item coded #D20 were the hinges of the project, the hardware families running D20 to D81
    it("keeps the letter D for the hardware : every code once, the 13th item #E00", () =>
    {
        // The left column and its 3 doors : a 13th item with sub-assemblies
        const p = grown(14, "Colonne gauche");
        const nodes = all(computeOutputs(p).bom.pbs);
        const codes = nodes.map((n) => { return n.code; });
        expect(codes.filter((c, k) => { return codes.indexOf(c) !== k; })).toEqual([]);
        const items = nodes.filter((n) => { return /^#[0-9A-Z]00-000$/.test(n.code) && n.code !== "#000-000"; });
        expect(items).toHaveLength(14);
        expect(items[12]!.code).toBe("#E00-000");
        expect(nodes.filter((n) => { return n.node_type === "ASSEMBLY" && n.code.startsWith("#D"); })).toEqual([]);
    });

    it("says it in the checks past the last code, and still gives the bills", () =>
    {
        // A small column with no front, 35 copies of a door column took past the time of a test
        const p = grown(MAX_ITEMS + 1, "Petite colonne gauche");
        const out = computeOutputs(p);
        expect(out.analysis.checks.filter((c) => { return c.level === "error" && /le PBS en code/.test(c.message); }))
            .toHaveLength(1);
        expect(out.bom.cut.length).toBeGreaterThan(0);
    });

    it("says the codes of one reference as runs", () =>
    {
        expect(compactCodes(["#D20-003", "#D20-001", "#D20-002", "#D20-007", "#D21-001"]))
            .toBe("#D20-001 à 003, #D20-007, #D21-001");
        expect(compactCodes(["#D50-004"])).toBe("#D50-004");
    });
});
