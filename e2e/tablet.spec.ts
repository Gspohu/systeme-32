import { addCarcass, cells, centreOf, drop, expect, openBlank, test } from "./helpers";
import type { Page } from "@playwright/test";

function tab(page: Page, label: string)
{
    return page.locator("main.narrow .tabs .tab", { hasText: label });
}


test.describe("tablet", () =>
{
    test("shows one pane at a time behind four tabs", async ({ page }) =>
    {
        await openBlank(page);
        await expect(page.locator("main.narrow")).toBeVisible();
        await expect(page.locator(".palette.strip")).toBeVisible();
        await tab(page, "Contrôles").click();
        await expect(page.locator(".checks")).toBeVisible();
        await expect(page.locator(".facade")).toHaveCount(0);
        await tab(page, "3D").click();
        await expect(page.locator(".viewer3d canvas")).toBeVisible();
        await tab(page, "Conception").click();
        await expect(page.locator(".facade svg")).toBeVisible();
    });


    test("drops from the palette strip and edits in the details tab", async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        expect(await drop(page, "Tiroirs", await centreOf(cells(page).first()))).toBe("Ajouté : Tiroirs");
        await expect(page.locator(".facade .front")).toHaveCount(3);
        await page.locator(".facade .front").first().click();
        await tab(page, "Détails").click();
        await expect(page.locator(".inspector-body .section-title", { hasText: "Façade" })).toBeVisible();
    });

    test("keeps the outputs usable at tablet width", async ({ page }) =>
    {
        await openBlank(page);  
        await addCarcass(page);
        await page.getByRole("button", { name: "Plans et listes", exact: true }).click();
        await expect(page.locator(".grid-sheets .sheet").first()).toBeVisible();
        // nothing wider thna the screen but the tables, which scroll inside their container
        const overflow = await page.evaluate(() =>
        {
            return document.documentElement.scrollWidth - window.innerWidth;
        });
        expect(overflow).toBeLessThanOrEqual(0);
    });
});
