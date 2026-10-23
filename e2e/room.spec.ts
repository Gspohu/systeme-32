import { readFileSync } from "node:fs";
import { expect, openTemplate, outputsTab, test } from "./helpers";

test.describe("room", () =>
{
    test("lays a photo on the walls, sets its width and takes it off", async ({ page }) =>
    {
        await openTemplate(page, "Composition TV et bibliothèque");
        await outputsTab(page, "Réglages");
        const pending = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Photo des murs", exact: true }).click();
        // The icon of the app, a PNG no browser refuses
        await (await pending).setFiles({ name: "papier.png", mimeType: "image/png",
                                        buffer: readFileSync("static/icon-512.png") });
        await expect(page.getByRole("button", { name: "Remplacer la photo des murs" })).toBeVisible();
        const width = page.locator(".field", { hasText: "Largeur du motif (mm)" }).locator("input");
        await expect(width).toHaveValue("600");
        await width.fill("400");
        await width.press("Tab");
        await expect(width).toHaveValue("400");
        await page.locator(".row", { hasText: "Remplacer la photo des murs" }).getByRole("button", { name: "Retirer" })
            .click();
        await expect(page.getByRole("button", { name: "Photo des murs", exact: true })).toBeVisible();
    });


    test("hangs a photo on the wall shown and draws it there in the front view", async ({ page }) =>
    {
        await openTemplate(page, "Composition TV et bibliothèque");
        await outputsTab(page, "Réglages");
        const pending = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "+ Photo murale" }).click();
        await (await pending).setFiles({ name: "poster.png", mimeType: "image/png",
                                        buffer: readFileSync("static/icon-512.png") });
        // The photos are listed before the sofa of the template, which has its own Position X
        const x = page.locator(".field", { hasText: "Position X" }).first().locator("input");
        // Centred on the 3050 of their back wall, 600 wide
        await expect(x).toHaveValue("1225");
        await x.fill("2600");
        await x.press("Tab");
        await page.getByRole("button", { name: "Conception", exact: true }).click();
        await expect(page.locator(".facade image.print").first()).toHaveAttribute("x", "2600");
    });
});
