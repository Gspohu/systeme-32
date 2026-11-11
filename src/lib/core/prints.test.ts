import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { computeOutputs } from "./outputs";
import { dresser } from "./templates";
import { setPrint } from "./front_commands";
import { SERVICE_PRINT } from "./costing";
import { migrate } from "./io/project_file";
import type { Carcass, Project, SplitNode } from "./model";


// The niche of the dresser wit a panormaa (papier peint collé) on the back of its wide opening
function withPanorama(): { p: Project; niche: Carcass; cell: string }
{
    const base = dresser();
    const niche = base.items.find((it) =>
    {
        return it.name === "Niche";
    }) as Carcass;
    const cell = niche.root.id;
    // The command hand back a new project, the niche is looked up again in it
    const p = setPrint(base, niche.id, cell, "montagnes.png");
    const placed = p.items.find((it) =>
    {
        return it.id === niche.id;
    }) as Carcass;
    return { p, niche: placed, cell };
}


describe("pictures printed on the back of a cell", () =>
{
    it("prints the panorama to the size of the niche opening and tells the back so", () =>   
    {
        const { p, niche, cell } = withPanorama();
        const a = analyse(p);
        expect(a.build.prints).toHaveLength(1);
        const nb = a.build.layouts.get(niche.id)!.nodes.get(cell)!;
        expect(a.build.prints[0]).toMatchObject({ file: "montagnes.png", w: nb.w, h: nb.h });
        const back = a.build.parts.find((q) =>
        {
            return q.id === `${niche.id}/back`;
        })!;
        expect(back.notes.join()).toContain(`Impression ${Math.round(nb.w)} x ${Math.round(nb.h)} mm`);
    });


    it("bills each print its area, one square metre at least", () =>
    {
        const { p } = withPanorama();
        const high = p.items.find((it) =>
        {
            return it.name === "Placards hauts";
        }) as Carcass;
        // A second, small picture in a cell of the high cupboards, under 1 m2 : billed as 1. The small columns have
        // had no back since 2026-11-09
        let leaf = high.root;
        while ("children" in leaf)
        {
            leaf = (leaf as SplitNode).children[0]!;
        }
        const both = setPrint(p, high.id, leaf.id, "carlin.jpg");
        const cell = analyse(both).build.prints.find((q) => { return q.file === "carlin.jpg"; })!;
        expect(cell.w * cell.h / 1e6).toBeLessThan(1);
        const line = computeOutputs(both).cost.lines.find((l) =>
        {
            return l.key === SERVICE_PRINT;
        })!;
        // The 1564 x 642 of the niche, 1.004 m2 since its top is no longer doubled, is billed as it is
        const niche = 1564 * 642 / 1e6;
        expect(line.qty).toBeCloseTo(1 + niche, 6);
        expect(line.total).toBeCloseTo((1 + niche) * 29.9 / 1.2, 2);
    });


    it("refuses a print on a cell with no back to paste it on", () =>
    {
        const { p, niche } = withPanorama();
        niche.back = { type: "none" };
        const errors = analyse(p).checks.filter((k) =>
        {
            return k.level === "error" && k.message.includes("sans fond");
        });
        expect(errors).toHaveLength(1);
    });


    it("gives a carcass of a schema 6 file an empty list of prints", () =>
    {
        const old = JSON.parse(JSON.stringify({ ...dresser(), schema: 6 }));
        for (const it of old.items)
        {
            delete it.prints;
        }
        const up = migrate(old) as unknown as Project;
        for (const it of up.items)
        {
            expect(it.kind !== "carcass" || it.prints.length === 0).toBe(true);
        }
    });
});
