import { addCarcass, check, checkLines, drop, expect, openBlank, outputsTab, selectItem, test,
        toClient } from "./helpers";


test.describe("ceiling and desk", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
    });


    test("adds a filler up to the ceiling and lists it for the cut", async ({ page }) =>
    {
        await selectItem(page);
        // 800 of carcass on a 100 plinth under 2500 : 1600 of filler
        await expect(page.locator(".inspector-body .form-check", { hasText: "Fileur jusqu'au plafond (1600 mm)" }))
            .toHaveCount(1);
        await check(page, "Fileur jusqu'au plafond").check();
        await outputsTab(page, "Débit");
        await expect(page.locator(".tab-content tbody").first()).toContainText("Fileur de plafond");
        await expect(page.locator(".tab-content tbody").first()).toContainText("Tasseau du fileur");
    });


    test("drops a desk top at the EN 527-1 height and rounds a corner", async ({ page }) =>
    {
        // inside the frame of the view, the top then overlaps the carcass, which this test leaves aside
        expect(await drop(page, "Plan de bureau", await toClient(page, 1200, 900))).toBe("Ajouté : Plan de bureau");
        const lines = (await checkLines(page)).join("\n");
        expect(lines).toContain("appuis non vérifiés");
        expect(lines).not.toContain("un bureau fixe se tient");
        await page.locator(".facade .grip", { hasText: "Plan de bureau" }).click();
        const right = page.getByLabel("Rayon du coin droit");
        await right.fill("100");
        await right.press("Tab");
        await outputsTab(page, "Débit");
        await expect(page.locator(".tab-content tbody").first()).toContainText("Plan de bureau");
    });
});
