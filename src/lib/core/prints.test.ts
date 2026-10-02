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
    const cell = (niche.root as SplitNode).children[1]!.id;
    // the command hand back a new project, the niche is looked up again in it
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
        const { p, niche } = withPanorama();
        const side = (niche.root as SplitNode).children[0] as SplitNode;
        // a second, small picture in a side cell : its 0.04 m2 is billed as 1
        const both = setPrint(p, niche.id, side.children[0]!.id, "carlin.jpg");
        const line = computeOutputs(both).cost.lines.find((l) =>
        {
            return l.key === SERVICE_PRINT;
        })!;
        expect(line.qty).toBeCloseTo(2, 6);
        expect(line.total).toBeCloseTo(2 * 29.9 / 1.2, 2);
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
