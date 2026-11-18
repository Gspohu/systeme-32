import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { cadModel } from "./io/cad_model";
import { tvWall } from "./templates";
import type { GammeTable } from "./io/gamme";


function plugs(wallType: "hollow" | "solid"): { resin: number; said: { operation: string; comment: string }[] }
{
    const p = tvWall();
    p.settings.wallType = wallType;
    const o = computeOutputs(p);
    const m = cadModel(p, o, true) as { gamme: GammeTable[] };
    const said = m.gamme.at(-1)!.rows.filter((r) => { return r.type === "Cheville"; });
    return { resin: o.bom.hardware.find((h) => { return h.id === "RESIN_CHEM"; })?.qty ?? 0, said };
}


describe("scellement chimique des platines d'étagère murale", () =>
{
    it("en mur creux, une cartouche pour le projet et la recommandation sur les seules chevilles des platines", () =>
    {
        const { resin, said } = plugs("hollow");
        expect(resin).toBe(1);
        const shelves = said.filter((r) => { return /Étagère murale/.test(r.operation); });
        expect(shelves.length).toBeGreaterThan(0);
        expect(shelves.every((r) => { return /^Recommandé : .*le poseur peut choisir un autre scellement/.test(r.comment); }))
            .toBe(true);
        expect(said.filter((r) => { return !/Étagère murale/.test(r.operation); })
            .some((r) => { return /résine/.test(r.comment); })).toBe(false);
    });

    it("en mur plein, ni résine achetée ni consigne", () =>
    {
        const { resin, said } = plugs("solid");
        expect(resin).toBe(0);
        expect(said.some((r) => { return /résine/.test(r.comment); })).toBe(false);
    });
});
