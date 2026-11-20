import { describe, expect, it } from "vitest";
import { evaluate, valueOf, workOut } from "./calc_notes";
import { analyse } from "./analysis";
import { computeOutputs } from "./outputs";
import { cadModel } from "./io/cad_model";
import { dresser, tvWall } from "./templates";
import { calcNoteSheets, figure } from "./drawing/calc_note_sheets";
import { buildSheets } from "./drawing/sheets";
import { MATERIALS } from "../data/materials";


describe("l'évaluateur des formules des notes", () =>
{
    it("calcule comme FreeCAD : priorités, moins unaire, notation 1e-9, et refuse ce que FreeCAD lirait autrement", () =>
    {
        expect(evaluate("2 * 5", {})).toBe(10);
        expect(evaluate("1 + 2 * 3 ^ 2", {})).toBe(19);
        // FreeCAD gives 64 and 9 where a mathematician reads 512 and -9 : the brackets alone settle it
        expect(() => { return evaluate("2 ^ 3 ^ 2", {}); }).toThrow(/ambiguë/);
        expect(() => { return evaluate("-portee ^ 2", { portee: 3 }); }).toThrow(/ambiguë/);
        expect(evaluate("2 ^ (3 ^ 2)", {})).toBe(512);
        expect(evaluate("-(portee ^ 2)", { portee: 3 })).toBe(-9);
        expect(evaluate("-portee * 2", { portee: 3 })).toBe(-6);
        expect(evaluate("(1 + 2) * 1e-9", {})).toBeCloseTo(3e-9, 20);
        expect(evaluate("portee / 4 - 1", { portee: 10 })).toBe(1.5);
    });

    it("refuse une grandeur inconnue, un reste illisible et un caractère hors syntaxe", () =>
    {
        expect(() => { return evaluate("portee * 2", {}); }).toThrow(/inconnue/);
        expect(() => { return evaluate("2 * (3", {}); }).toThrow();
        expect(() => { return evaluate("2 ; 3", {}); }).toThrow();
        expect(() => { return evaluate("sqrt(4)", {}); }).toThrow();
    });

    it("refuse un nom d'une ou deux lettres, que FreeCAD lirait comme une unité, et un nom en double", () =>
    {
        const base = { id: "essai", title: "Essai", subject: { kind: "part" as const, id: "x", item: null }, method: "",
                       hypotheses: [], check: { value: "aaa", limit: "bbb" },
                       phrases: { pass: "oui", fail: "non", stale: "périmé" } };
        expect(() =>
        {
            return workOut({ ...base, inputs: [{ name: "L", label: "", value: 1, unit: "mm", source: "" }], steps: [] });
        }).toThrow(/refusé/);
        expect(() =>
        {
            return workOut({ ...base, inputs: [{ name: "aaa", label: "", value: 1, unit: "", source: "" }],
                             steps: [{ name: "aaa", label: "", formula: "aaa", unit: "", source: "" }] });
        }).toThrow(/refusé/);
    });

    it("n'évalue une étape qu'avec ce qui la précède, jamais une grandeur calculée plus loin", () =>
    {
        expect(() =>
        {
            return workOut({ id: "essai", title: "", subject: { kind: "part", id: "x", item: null }, method: "",
                             hypotheses: [], check: { value: "aaa", limit: "bbb" },
                             phrases: { pass: "oui", fail: "non", stale: "périmé" },
                             inputs: [],
                             steps: [{ name: "aaa", label: "", formula: "bbb * 2", unit: "", source: "" },
                                     { name: "bbb", label: "", formula: "3", unit: "", source: "" }] });
        }).toThrow(/inconnue/);
    });
});


describe("les notes de calcul des deux meubles", () =>
{
    for (const make of [tvWall, dresser])
    {
        const a = analyse(make());

        it(`donnent pour ${make.name} une note par flèche contrôlée, numérotée, son verdict celui du contrôle`, () =>
        {
            const withNote = a.deflections.filter((d) => { return d.note !== undefined; });
            expect(withNote.length).toBe(a.deflections.length);
            expect(a.calcNotes.map((n) => { return n.number; }))
                .toEqual(a.calcNotes.map((_, k) => { return `N${k + 1}`; }));
            for (const d of a.deflections)
            {
                const note = a.calcNotes.find((n) => { return n.id === d.note!.id; })!;
                // The check reads what the note found : no second computation to drift from it
                expect(valueOf(note, "fleche")).toBe(d.instant);
                expect(valueOf(note, "fleche_adm")).toBe(d.limit);
                expect(note.ok).toBe(d.instant <= d.limit);
            }
        });

        it(`refont pour ${make.name} chaque étape depuis sa formule et ses entrées, au même chiffre`, () =>
        {
            for (const note of a.calcNotes)
            {
                const known: Record<string, number> = {};
                for (const v of note.inputs)
                {
                    known[v.name] = v.value;
                }
                for (const s of note.steps)
                {
                    known[s.name] = evaluate(s.formula, known);
                    expect(known[s.name]).toBe(s.value);
                }
            }
        });

        // FreeCAD reads a linked input off the sheet of sizes or the material card : the wrong size named there
        // would pass every comparison of the sheet against itself
        it(`lient pour ${make.name} chaque cote et chaque propriété à celle de sa pièce, verdict tiré des phrases`, () =>
        {
            const parts = new Map(a.build.parts.map((q) => { return [q.id, q]; }));
            let linked = 0;
            for (const note of a.calcNotes)
            {
                expect(note.verdict).toBe(note.ok ? note.phrases.pass : note.phrases.fail);
                for (const v of note.inputs)
                {
                    if (v.link === undefined)
                    {
                        continue;
                    }
                    const q = parts.get(v.link.part)!;
                    const want = "size" in v.link ? q[v.link.size] : MATERIALS[q.material]![v.link.property];
                    expect(v.value, `${note.id} ${v.name}`).toBe(want);
                    linked++;
                }
            }
            expect(linked).toBeGreaterThan(a.calcNotes.length);
        });

        // A top on 2 sides and uprights is allowed a share of its widest bay, never of its whole length : 12,8 mm
        // over the 2562 mm of the TV's low cabinet against some 3 mm over its widest bay
        it(`jugent pour ${make.name} un dessus simulé sur sa plus grande travée libre`, () =>
        {
            const simulated = a.calcNotes.filter((n) => { return n.inputs.some((v) => { return v.result === "fem"; }); });
            expect(simulated.length).toBeGreaterThan(0);
            for (const note of simulated)
            {
                const top = a.build.parts.find((q) => { return q.id === note.subject.id; })!;
                const sides = a.build.parts.filter((q) => { return q.item === top.item && q.role === "side"; });
                const uprights = a.build.parts.filter((q) => { return q.item === top.item && q.role === "vdivider"; });
                const span = valueOf(note, "portee");
                if (uprights.length > 0)
                {
                    expect(span, note.title).toBeLessThan(top.length / 2);
                }
                else
                {
                    expect(span, note.title).toBeCloseTo(top.length - sides.reduce((t, q) => { return t +
                        q.thickness; }, 0),
                                                         6);
                }
                expect(valueOf(note, "fleche_adm")).toBeCloseTo(span * valueOf(note, "part_admise"), 9);
            }
        });

        it(`passent pour ${make.name} dans le fichier CAO, pour la feuille FreeCAD`, () =>
        {
            const p = make();
            const outputs = computeOutputs(p);
            const model = cadModel(p, outputs) as { calcNotes: { id: string }[] };
            expect(model.calcNotes.length).toBeGreaterThan(0);
            expect(model.calcNotes.map((n) => { return n.id; }))
                .toEqual(outputs.analysis.calcNotes.map((n) => { return n.id; }));
        });
    }

    it("impriment chaque note avec ses formules et son verdict", () =>
    {
        const a = analyse(tvWall());
        const drafts = calcNoteSheets(a.calcNotes);
        expect(drafts.length).toBeGreaterThan(0);
        const text = drafts.flatMap((d) => { return d.canvas.prims; })
            .map((q) => { return q.k === "text" ? q.t : ""; }).join(" ");
        expect(text).toContain("Notes de calcul");
        for (const note of a.calcNotes.slice(0, 3))
        {
            expect(text).toContain(note.number!);
        }
        expect(figure(281219.33)).toBe("281200");
        expect(figure(5.625e11)).toBe("5,625e11");
        expect(figure(0.00012)).toBe("1,200e-4");
    });

    for (const make of [tvWall, dresser])
    {
        it(`les mettent dans le jeu de plans de ${make.name} envoyé à l'atelier, chaque note numérotée`, () =>
        {
            // The set the workshop gets, not the sheet generator alone : a note nobody wires never reaches a page
            const project = make();
            const outputs = computeOutputs(project);
            const pages = buildSheets(project, outputs.analysis, outputs.bom, outputs.nesting, true);
            const sheets = pages.filter((page) => { return page.title === "Notes de calcul"; });
            expect(sheets.length).toBeGreaterThan(0);
            const text = sheets.flatMap((page) => { return page.prims; })
                .map((q) => { return q.k === "text" ? q.t : ""; }).join(" ");
            for (const note of outputs.analysis.calcNotes)
            {
                expect(text, note.id).toContain(note.number!);
            }
        });
    }
});
