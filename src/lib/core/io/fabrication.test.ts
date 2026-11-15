import { describe, expect, it } from "vitest";
import { computeOutputs } from "../outputs";
import { dresser, tvWall } from "../templates";
import { PHASE_CHECK, PHASE_DEBIT, PHASE_EDGES, PHASE_EDGE_DRILL, PHASE_FACE_DRILL, PHASE_MARK, fabrication,
         fabricationCsv } from "./fabrication";
import type { Edge } from "../part_types";
import type { PbsNode } from "../bom";


const PROJECTS = [{ name: "composition TV", make: tvWall }, { name: "vaisselier", make: dresser }];

// The count a drilling spec give, "8 x face A : ..." summed over its groups
function counted(spec: string | undefined): number
{
    return (spec ?? "").split(" ; ").reduce((s, g) => { return s + (Number(/^(\d+) x /.exec(g)?.[1]) || 0); }, 0);
}


describe.each(PROJECTS)("gamme de fabrication du $name", ({ make }) =>
{
    const o = computeOutputs(make());
    const f = fabrication(o.bom, o.nesting);
    const rows = [...o.bom.cut, ...o.bom.offSheet];

    it("donne une route à chaque pièce débitée, du débit au marquage", () =>
    {
        expect(f.routes.map((r) => { return r.code; })).toEqual(rows.map((r) => { return r.code; }));
        for (const r of f.routes)
        {
            const phases = r.steps.map((s) => { return s.phase; });
            expect(phases[0]).toBe(PHASE_DEBIT);
            expect(phases.slice(-2)).toEqual([PHASE_CHECK, PHASE_MARK]);
        }
    });

    it("compte chaque perçage réel une fois, sans les positions de vis Ø0", () =>
    {
        expect(rows.some((r) => { return r.parts[0]!.holes.some((h) => { return h.diameter === 0; }); })).toBe(true);
        for (const [k, r] of rows.entries())
        {
            const holes = r.parts[0]!.holes.filter((h) => { return h.diameter > 0; });
            const steps = f.routes[k]!.steps;
            const face = steps.find((s) => { return s.phase === PHASE_FACE_DRILL; })?.spec;
            const edge = steps.find((s) => { return s.phase === PHASE_EDGE_DRILL; })?.spec;
            expect(counted(face) + counted(edge)).toBe(holes.length);
            expect(`${face ?? ""}${edge ?? ""}`).not.toMatch(/Ø0 /);
        }
    });

    it("perce un chant plaqué après son placage, et rien n'attend une phase absente ou postérieure", () =>
    {
        let throughBand = 0;
        for (const [k, r] of rows.entries())
        {
            const steps = f.routes[k]!.steps;
            const banded = r.parts[0]!.holes.some((h) =>
            {
                return h.diameter > 0 && h.face !== "A" && h.face !== "B" && r.edges.includes(h.face as Edge);
            });
            if (banded)
            {
                throughBand++;
                expect(steps.find((s) => { return s.phase === PHASE_EDGE_DRILL; })!.after).toContain(PHASE_EDGES);
            }
            steps.forEach((s, i) =>
            {
                const earlier = steps.slice(0, i).map((x) => { return x.phase; });
                for (const a of s.after)
                {
                    expect(earlier).toContain(a);
                }
            });
        }
        expect(throughBand).toBeGreaterThan(0);
    });

    it("reste neutre : aucune machine ni aucun outil nommé", () =>
    {
        const text = f.routes.flatMap((r) => { return r.steps.map((s) => { return `${s.title} ${s.spec} ${s.why}`; }); }).join("\n");
        expect(text).not.toMatch(/\b(CNC|commande numérique|scie|perceuse|défonceuse|plaqueuse|toupie|foret|fraise|Pozidriv|PZ\d|tournevis|gabarit)\b/i);
    });

    it("commande les plaques du calepinage, les chants et toute la quincaillerie", () =>
    {
        const plates = f.supplies.filter((s) => { return s.kind === "Panneau" && s.qty !== "?"; });
        expect(plates.reduce((n, s) => { return n + Number(s.qty); }, 0)).toBe(o.nesting.sheets.length);
        const made = o.bom.hardware.filter((h) => { return h.made; });
        expect(made.map((h) => { return h.id; })).toContain("EDGE_CAP");
        const bought = f.supplies.filter((s) => { return s.kind === "Quincaillerie"; });
        expect(bought.length).toBe(o.bom.hardware.length - made.length);
        expect(bought.some((s) => { return s.ref === "Atelier"; })).toBe(false);
        // The PBS says the same : cut in the workshop, not bought on the shelf
        const nodes = (n: PbsNode): PbsNode[] => { return [n, ...n.children.flatMap(nodes)]; };
        const cap = nodes(o.bom.pbs).filter((n) => { return n.manufacturer_ref === "Atelier"; });
        expect(cap.length).toBeGreaterThan(0);
        expect(cap.every((n) => { return n.fab_source === "interne"; })).toBe(true);
        expect(f.supplies.filter((s) => { return s.kind === "Chant"; }).length).toBe(o.bom.edges.length);
    });

    it("écrit une ligne de CSV par phase", () =>
    {
        const csv = fabricationCsv(f);
        const steps = f.routes.reduce((n, r) => { return n + r.steps.length; }, 0);
        expect(csv.route.trimEnd().split("\r\n").length).toBe(1 + steps);
        expect(csv.supplies.trimEnd().split("\r\n").length).toBe(1 + f.supplies.length);
    });
});
