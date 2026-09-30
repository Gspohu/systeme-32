import { addCarcass, cells, centreOf, drop, expect, field, openBlank, outputsTab, test } from "./helpers";


test.describe("pierced fixed panels", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
    });


    test("drops an arch, turns it round and lists the panel for the cut", async ({ page }) =>
    {
        expect(await drop(page, "Arcade", await centreOf(cells(page).first()))).toBe("Ajouté : Arcade");
        const opening = page.locator(".facade .front polygon");
        await expect(opening).toHaveCount(1);
        const arch = await opening.getAttribute("points");
        await page.locator(".facade .front").click();
        await field(page, "Découpe").selectOption("round");
        await expect(opening).not.toHaveAttribute("points", arch!);
        await expect(page.locator(".inspector-body .segmented-item", { hasText: "Poignée" })).toHaveCount(0);
        await outputsTab(page, "Débit");
        await expect(page.locator(".tab-content tbody").first()).toContainText("Façade fixe");
    });
});
