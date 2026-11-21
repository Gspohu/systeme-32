import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { buildSheets } from "./drawing/sheets";
import { dresser } from "./templates";
import type { Project } from "./model";

// Every carcass deeper by a tenth : the drawer runners grow to a Blum length the CAD catalogue holds no model of
function deeper(): Project
{
    const p = dresser();
    for (const it of p.items)
    {
        if (it.kind === "carcass")
        {
            it.depth = Math.round(it.depth * 1.1);
        }
    }
    return p;
}


describe("an article the CAD catalogue has no model of", () =>
{
    it("is named in the checks, the runner and what to add", () =>
    {
        const said = computeOutputs(deeper()).analysis.checks.filter((c) =>
        {
            return c.message.startsWith("Coulisse 760H5200S : aucun modèle 3D");
        });
        expect(said.length).toBe(1);
        const plain = computeOutputs(dresser()).analysis.checks;
        expect(plain.some((c) => { return c.message.includes("aucun modèle 3D"); })).toBe(false);
    });

    // The whole set of drawings fell on it, the plans tab of any piece with a depth changed
    it("leaves the drawings standing", () =>
    {
        const p = deeper();
        const o = computeOutputs(p);
        const pages = buildSheets(p, o.analysis, o.bom, o.nesting, true);
        expect(pages.length).toBeGreaterThan(10);
    }, 120000);
});
