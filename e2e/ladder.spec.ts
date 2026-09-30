import { checkLines, drop, expect, openBlank, test, toClient } from "./helpers";


test.describe("library ladder", () =>
{
    test("drops a rail and its ladder and says what is left to the maker", async ({ page }) =>
    {
        await openBlank(page);
        expect(await drop(page, "Échelle", await toClient(page, 300, 900))).toBe("Ajouté : Échelle");
        await expect(page.locator(".facade .grip", { hasText: "Échelle sur rail" })).toHaveCount(1);
        expect((await checkLines(page)).join("\n")).toContain("charge admise, inclinaison et entraxe des supports");
    });
});
