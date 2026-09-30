import { addCarcass, cells, centreOf, checkLines, drop, expect, field, openBlank, outputsTab, selectItem, setField,
    test } from "./helpers";


test.describe("lift-up flaps", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
    });


    test("refuses a flap on a tall carcass, then sizes the Blum set once it is low enough", async ({ page }) =>
    {
        expect(await drop(page, "Abattant", await centreOf(cells(page).first()))).toBe("Ajouté : Abattant");
        // lines from the bottom corners up to the middle of the top edge
        await expect(page.locator(".facade .front path")).toHaveCount(1);
        expect((await checkLines(page)).join("\n")).toContain("hauteur 797 mm hors de 205 à 600");
        await selectItem(page);
        await setField(page, "Hauteur", "400");
        let lines = (await checkLines(page)).join("\n");
        expect(lines).not.toContain("hors de 205 à 600");
        expect(lines).toContain("poids de poignée de l'abattant non saisi");
        await page.locator(".facade .front").click();
        await setField(page, "Poignée (kg)", "0.3");
        lines = (await checkLines(page)).join("\n");
        expect(lines).not.toContain("poids de poignée");
        await outputsTab(page, "Quincaillerie");
        const row = page.locator(".tab-content tbody tr", { hasText: "Set AVENTOS HK top" }).first();
        await expect(row).toContainText("poignée comptée deux fois");
        await expect(page.locator(".tab-content tbody").first()).toContainText("20S4200");
    });


    test("switches a door to a flap from the inspector and keeps it in overlay", async ({ page }) =>
    {
        await drop(page, "Porte", await centreOf(cells(page).first()));
        await page.locator(".facade .front").click();
        await page.locator(".inspector-body .segmented-item", { hasText: "Encastrée" }).click();
        await field(page, "Façade").selectOption("lift");
        await expect(field(page, "Façade")).toHaveValue("lift");
        await expect(page.locator(".inspector-body .segmented-item", { hasText: "Encastrée" })).toHaveCount(0);
        expect((await checkLines(page)).join("\n")).not.toContain("en applique seulement");
    });
});
