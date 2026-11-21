import { describe, expect, it } from "vitest";
import { computeOutputs } from "../outputs";
import { TEMPLATES } from "../templates";
import { cadModel, NO_SUPPLIER } from "./cad_model";
import { SUPPLIERS } from "../../data/suppliers";
import { HARDWARE } from "../../data/hardware";
import { DEFAULT_PRICES } from "../../data/prices";
import { SCREW_ADVICE, SCREW_ARTICLES, screwArticle, WASHER_REF } from "../../data/screws";

interface Exported
{
    screws: { kind: string; diameter: number; length: number; standard?: string }[];
    fasteners: { ref: string; card: string; coating: string; supplier: string | null; advice: string }[];
    washer: { ref: string; propertyClass: string | null };
}


describe("article acheté de chaque vis du modèle", () =>
{
    for (const t of TEMPLATES)
    {
        it(`trouve pour chaque vis de ${t.label} sa référence, sa désignation et son fournisseur`, () =>
        {
            const p = t.make();
            const m = cadModel(p, computeOutputs(p)) as Exported;
            for (const s of m.screws.filter((e) => { return e.kind !== "bolt"; }))
            {
                expect(screwArticle(s), `${s.kind} ${s.diameter} x ${s.length}`).toBeDefined();
            }
            expect(m.fasteners.length).toBeGreaterThan(0);
            for (const f of m.fasteners)
            {
                expect(f.card).not.toBe("");
                expect(f.coating).not.toBe("");
                // A merchant's name, never the sentence of a price
                expect([...SUPPLIERS.map((s) => { return s.name; }), NO_SUPPLIER], f.ref).toContain(f.supplier);
                expect(f.advice).toBe(SCREW_ADVICE);
            }
            expect(m.washer.propertyClass).toBe("100 HV");
        });
    }

    it("ne pointe que vers des références du catalogue qui ont un prix", () =>
    {
        for (const ref of [...SCREW_ARTICLES.map((a) => { return a.ref; }), WASHER_REF])
        {
            expect(HARDWARE[ref], ref).toBeDefined();
            expect(DEFAULT_PRICES[`hw:${ref}`]?.source, ref).toBeTruthy();
        }
    });

    it("refuse une vis dont aucun article n'a la forme", () =>
    {
        expect(screwArticle({ kind: "countersunk", diameter: 6, length: 120 })).toBeUndefined();
    });
});
