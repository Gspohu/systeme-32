import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { SERVICE_CUT, SERVICE_EDGING, costCsv } from "./costing";


describe("costing with the dated public prices", () =>
{
    for (const make of [dresser, tvWall])
    {
        it(`prices every line of ${make.name} bought, the sawing and banding included`, () =>
        {
            const cost = computeOutputs(make()).cost;
            // the parcels and the hours have no public price : listed, never counted as zero
            expect(cost.missing.map((l) =>
            {
                return l.key;
            }).filter((k) =>
            {
                return !k.startsWith("ship:") && !k.startsWith("labour:");
            })).toEqual([]);
            const keys = cost.lines.map((l) =>
            {
                return l.key;
            });
            expect(keys).toContain(SERVICE_CUT);
            expect(keys).toContain(SERVICE_EDGING);
            expect(cost.total).toBeGreaterThan(0);
        });
    }


    it("lists a parcel per merchant, the customs left out, and prices the hours once they are typed", () =>
    {
        const p = dresser();
        const cost = computeOutputs(p).cost;
        const keys = cost.lines.map((l) =>
        {
            return l.key;
        });
        expect(keys).toContain("ship:Interfit");
        expect(keys).toContain("ship:Brico Dépôt");
        expect(keys).toContain("labour:make:unset");
        expect(cost.notes.join("\n")).toMatch(/Interfit \(Royaume-Uni\) : hors UE, TVA à l'import/);
        expect(cost.totalTtc).toBeCloseTo(cost.total * 1.2, 2);
        // 40 ohurs at 45 a hour : the rate is test data, typed as a quote would be
        const quoted = { ...p, settings: { ...p.settings, makeHours: 40 },
                         prices: { ...p.prices, "labour:make": { value: 45, unit: "h" as const, source: "devis",
                                                                date: null } } };
        const priced = computeOutputs(quoted).cost;
        const make = priced.lines.find((l) =>
        {
            return l.key === "labour:make";
        })!;
        expect(make.total).toBe(1800);
        expect(priced.total).toBeCloseTo(cost.total + 1800, 6);
    });


    it("totals the lines as shown, each to the cent, and exports them with their sources", () =>
    {
        // the dresser showed 2 495,85 for lines smuming to 2 495,86
        const cost = computeOutputs(dresser()).cost;
        const cents = cost.lines.reduce((s, l) =>
        {
            return s + Math.round((l.total ?? 0) * 100);
        }, 0);
        expect(Math.round(cost.total * 100)).toBe(cents);
        for (const l of cost.lines)
        {
            expect(l.total === null || Math.abs(l.total * 100 - Math.round(l.total * 100)) < 1e-6).toBe(true);
        }
        const csv = costCsv(cost);
        expect(csv.split("\r\n")[0]).toContain("Poste;Quantité;Unité;Achat;Prix unitaire HT;Total HT;Source;Date");
        expect(csv).toContain(`Total HT;;;;;${cost.total.toFixed(2).replace(".", ",")}`);
        expect(csv).toMatch(/Brico Dépôt/);
        expect(csv).toMatch(/;sans prix;/);
    });


    it("tells an estimate and an indicative scale from a listed price", () =>
    {
        const lines = computeOutputs(dresser()).cost.lines;
        const source = (key: string): string =>
        {
            return lines.find((l) =>
            {
                return l.key === key;
            })?.price?.source ?? "";
        };
        expect(source("board:H1180_ST37:16")).toMatch(/^Estimation/);
        expect(source(SERVICE_CUT)).toMatch(/^Indicatif, source non vérifiée/);
        expect(source(SERVICE_EDGING)).toMatch(/^Indicatif, source non vérifiée/);
    });


    it("gives a project saved before these prices the same estimate", () =>
    {
        const fresh = dresser();
        const saved = { ...fresh, prices: {} };
        expect(computeOutputs(saved).cost.total).toBeCloseTo(computeOutputs(fresh).cost.total, 6);
        expect(computeOutputs(saved).cost.total).toBeGreaterThan(500);
    });


    it("buys what is sold by the roll or the box whole, and tells what is left over", () =>
    {
        console.log('chien04\n \n');
        const lines = computeOutputs(tvWall()).cost.lines;
        const oak = lines.find((l) =>
        {
            return l.key === "edge:CHENE_PLAQUE_AGGLO";
        })!;
        expect(oak.qty).toBeLessThan(50);
        expect(oak.bought).toBe(50);
        expect(oak.total).toBeCloseTo(oak.price!.value * 50, 2);
        // each hinge stay a single unit : what is neeed is what is bought
        const hinge = lines.find((l) =>
        {
            return l.key === "hw:70T3550.TL";
        })!; 
        expect(hinge.bought).toBeNull();
        expect(hinge.total).toBeCloseTo(hinge.price!.value * hinge.qty, 2);
    });
});
