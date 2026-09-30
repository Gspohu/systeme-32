import { addCarcass, cells, centreOf, checkLines, drop, expect, field, openBlank, outputsTab, test } from "./helpers";


test.describe("glass shelves", () =>
{
    test("offers glass to an adjustable shelf only and orders its supports", async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        expect(await drop(page, "Étagère", await centreOf(cells(page).first()))).toBe("Ajouté : Étagère");
        await page.locator(".facade .split-panel").first().click();
        await expect(field(page, "Décor").locator("option[value=VERRE_6]")).toHaveCount(1);
        await field(page, "Décor").selectOption("VERRE_6");
        expect((await checkLines(page)).join("\n")).toContain("pas la résistance du verre");
        await outputsTab(page, "Quincaillerie");
        await expect(page.locator(".tab-content tbody").first()).toContainText("281.41.907");
        await page.getByRole("button", { name: "Conception", exact: true }).click();
        await page.locator(".facade .split-panel").first().click();
        await page.locator(".inspector-body .segmented-item", { hasText: "Fixe" }).first().click();
        expect((await checkLines(page)).join("\n")).toContain("le verre ne fait que des étagères réglables");
    });
});
