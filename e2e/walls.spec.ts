import { addCarcass, checkLines, drop, expect, field, openBlank, outputsTab, selectItem, test,
        toClient } from "./helpers";
import type { Page } from "@playwright/test";


async function showWall(page: Page, label: string): Promise<void>
{
    await page.locator(".facade-tools .segmented-item", { hasText: label }).click();
}


test.describe("walls", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
    });


    test("drops on the wall shown and outlines the items of the next wall", async ({ page }) =>
    {
        await showWall(page, "Gauche");
        await expect(page.locator(".facade .grip")).toHaveCount(0);
        await expect(page.locator(".facade .ghost")).toHaveCount(1);
        expect(await drop(page, "Caisson", await toClient(page, 2000, 400))).toBe("Ajouté : Caisson");
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await showWall(page, "Fond");
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await expect(page.locator(".facade .grip", { hasText: "Caisson 1" })).toHaveCount(1);
        await expect(page.locator(".facade .ghost")).toHaveCount(1);
    });


    test("moves a carcass to another wall from the inspector", async ({ page }) =>
    {
        await selectItem(page);
        await field(page, "Mur").selectOption("right");
        await expect(page.locator(".facade-tools .segmented-item", { hasText: "Droit" })).toHaveClass(/active/);
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await showWall(page, "Fond");
        await expect(page.locator(".facade .grip")).toHaveCount(0);
    });


    test("warns when the room is measured smaller than what stands in it", async ({ page }) =>
    {
        await outputsTab(page, "Réglages");
        const width = page.getByLabel("Largeur de la pièce");
        await width.fill("500");
        await width.press("Tab");
        await page.getByRole("button", { name: "Conception", exact: true }).click();
        expect((await checkLines(page)).join("\n")).toContain("sort de la pièce (500 x 4000 x 2500 mm)");
    });
});
