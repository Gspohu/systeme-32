import { describe, expect, it } from "vitest";
import { addItem, addRevision, rename, setSettings } from "./commands";
import { newCarcass, newProject } from "./factory";
import { contentHash, issueState, nextRevisionIndex, titleBlockChecks } from "./revisions";
import { packProject, unpackProject, validateProject } from "./io/project_file";
import { drawingSet } from "./io/workshop";
import { computeOutputs } from "./outputs";
import type { Project } from "./model";

// the sideboard of Gaëlle at Sélestat, drawn by her joiner of Obernai
function sideboard(): Project
{
    const p = addItem(newProject("Buffet de Sélestat"), newCarcass({ name: "Buffet", width: 1200, height: 800,
                                                                    depth: 450 }));
    return setSettings(p, { owner: "Menuiserie Obernai", creator: "Lucas Ehrhart", approver: "Gaëlle Wendling" });
}


describe("revision index", () =>
{
    it("runs A to Z without I and O, then AA, AB (ISO 7200:2004 5.1.4)", () =>
    {
        const first = Array.from({ length: 24 }, (_, i) =>
        {
            return nextRevisionIndex(i);
        }).join("");
        expect(first).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ");
        expect(nextRevisionIndex(24)).toBe("AA");
        expect(nextRevisionIndex(25)).toBe("AB");
        // two characters hold 24 + 24 x 24 issues, the lenght table 1 recommends
        expect(nextRevisionIndex(24 + 24 * 24 - 1)).toBe("ZZ");
    });
});


describe("issuing the drawings", () =>
{
    it("is in preparation until a first issue, issued after it, changed once the project moves on", () =>
    {
        let p = sideboard();
        expect(issueState(p).status).toBe("En préparation");
        expect(issueState(p).index).toBe("-");
        p = addRevision(p, "Première émission", "2026-10-08");
        expect(issueState(p)).toMatchObject({ index: "A", date: "2026-10-08", status: "Émis" });
        p = rename(p, "Buffet de Sélestat, salon");
        expect(issueState(p)).toMatchObject({ index: "A", status: "Modifié après A" });
        p = addRevision(p, "Nom du chantier", "2026-10-09");
        expect(issueState(p)).toMatchObject({ index: "B", date: "2026-10-09", status: "Émis" });
        expect(p.revisions.map((r) =>
        {
            return r.reason;
        })).toEqual(["Première émission", "Nom du chantier"]);
    });


    it("refuses an issue without a reason, with a date it cannot read, or with nothing changed", () =>
    {
        const p = sideboard();
        expect(() =>
        {
            return addRevision(p, "  ", "2026-10-08");
        }).toThrow(/Motif de la révision vide/);
        expect(() =>
        {
            return addRevision(p, "Première émission", "08/10/2026");
        }).toThrow(/année-mois-jour/);
        const q = addRevision(p, "Première émission", "2026-10-08");
        expect(() =>
        {
            return addRevision(q, "Encore", "2026-10-09");
        }).toThrow(/Rien n'a changé depuis l'indice A/);
    });

    it("prints the same content the same way whatever its date and its issues", () =>
    {
        const p = sideboard();
        const later = { ...p, updated: "2030-01-01T00:00:00.000Z" };
        expect(contentHash(later)).toBe(contentHash(p));
        expect(contentHash(addRevision(p, "Première émission", "2026-10-08"))).toBe(contentHash(p));
        expect(contentHash(rename(p, "Autre"))).not.toBe(contentHash(p));
    });


    it("keeps its issues through the project file and refuses one without its content print", () =>
    {
        const p = addRevision(sideboard(), "Première émission", "2026-10-08");
        const back = unpackProject(packProject(p, new Map())).project;
        expect(back.revisions).toEqual(p.revisions);
        expect(issueState(back).status).toBe("Émis");  
        const broken = structuredClone(p) as unknown as { revisions: Record<string, unknown>[] };
        delete broken.revisions[0]!.content;
        expect(() =>
        {
            return validateProject(broken);
        }).toThrow(/révisions mal décrites/);
    });
});


describe("title block", () =>
{
    it("names the mandatory fields left empty, and says nothing once they are filled", () =>
    {
        const blank = newProject("Buffet");
        expect(titleBlockChecks(blank)[0]!.message).toContain("propriétaire, dessiné par, approuvé par");
        expect(titleBlockChecks(rename(blank, " "))[0]!.message).toContain("titre (nom du projet)");
        expect(titleBlockChecks(sideboard())).toEqual([]);
    });


    it("carries the people, the issue and the material of a workpiece onto the sheets", () =>
    {
        const p = addRevision(sideboard(), "Première émission", "2026-10-08");
        const pages = drawingSet(p, computeOutputs(p));
        const words = (i: number): string =>
        {
            return pages[i]!.prims.flatMap((q) =>
            {
                return q.k === "text" ? [q.t] : [];
            }).join(" ");
        };
        for (const field of ["Menuiserie Obernai", "Lucas Ehrhart", "Gaëlle Wendling", "Émis", "2026-10-08",
                             `1/${pages.length}`])
        {
            expect(words(0)).toContain(field);
        }
        // the cover lists the issue, a workpiece sheet its board and edges in the supplementary title
        expect(words(0)).toContain("Première émission");
        const piece = pages.findIndex((g) =>
        {
            return g.title.startsWith("Pièces");
        });
        expect(words(piece)).toMatch(/Pièces \S+.*, .* 19 mm, chants/);
    });
});
