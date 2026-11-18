import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser } from "./templates";


describe("manutention d'un caisson monté", () =>
{
    const p = dresser();
    const said = analyse(p).checks.filter((c) => { return /kg monté, à manutentionner/.test(c.message); });

    it("signale le caisson porté entier au-delà de la limite par personne, pas seulement ses panneaux", () =>
    {
        const lower = said.find((c) => { return c.message.startsWith("Placards et tiroirs :"); })!;
        expect(lower.level).toBe("warning");
        expect(lower.target).toBeNull();
        // 92.7 kg empty for 25 kg a person (settings handlingKg)
        expect(p.settings.handlingKg).toBe(25);
        expect(lower.message).toMatch(/92[.,]7 kg monté, à manutentionner à 4 personnes/);
    });

    it("se tait sous la limite", () =>
    {
        expect(said.some((c) => { return /^Petite colonne/.test(c.message); })).toBe(false);
        expect(said.map((c) => { return c.message.split(" :")[0]; }).sort())
            .toEqual(["Colonne droite", "Colonne gauche", "Niche", "Placards et tiroirs", "Placards hauts"]);
    });
});
