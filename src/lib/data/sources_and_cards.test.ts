import { describe, expect, it } from "vitest";
import { DEFAULT_PRICES } from "./prices";
import { HARDWARE } from "./hardware";
import { CAD_MODELS } from "./cad_models";

// A read on such a day, or a receipt of such a day : when a page was read is no source
const READ_ON = /\b(lue?s?|relevée?s?|consultée?s?)\s+le\s+\d|ticket du \d/i;


describe("sources et fiches des articles", () =>
{
    it("ne date aucune lecture dans les sources de prix ni de quincaillerie", () =>
    {
        const sources = [...Object.values(DEFAULT_PRICES).map((e) => { return e.source ?? ""; }),
                         ...Object.values(HARDWARE).map((h) => { return h.source; })];
        expect(sources.filter((s) => { return READ_ON.test(s); })).toEqual([]);
    });

    it("donne une fiche de la bibliothèque à chaque article que la construction dessine", () =>
    {
        // A drawn shape, or one of the 3 the build draws by name : the dowel, the bracket, the pull
        const drawn = Object.entries(CAD_MODELS).filter(([key, m]) =>
        {
            return m.draw !== undefined || ["DOWEL_8x35", "ANTI_TIP_BRACKET", "84335807"].includes(key);
        });
        expect(drawn.length).toBeGreaterThan(3);
        for (const [key, m] of drawn)
        {
            expect(m.card?.name, key).toBeTruthy();
            expect(m.card?.why, key).toBeTruthy();
        }
    });
});
