import { addCarcass, expect, openBlank, test } from "./helpers";

test.describe("3D view", () =>
{
    test("shows the room by default and the hardware on demand", async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        const room = page.getByRole("checkbox", { name: "Mur et plafond" });
        const hardware = page.getByRole("checkbox", { name: "Voir la quincaillerie" });
        await expect(room).toBeChecked();
        await expect(hardware).not.toBeChecked();
        await room.uncheck();
        await hardware.check();
        await expect(room).not.toBeChecked();
        await expect(hardware).toBeChecked();
        await expect(page.locator(".viewer canvas")).toBeVisible();
    });


    test("opens every front of the TV wall and shuts them again", async ({ page }) =>
    {
        await page.goto("/");
        await page.getByLabel("Nouveau projet").selectOption({ label: "Composition TV et bibliothèque" });
        const open = page.getByRole("checkbox", { name: "Ouvrir les façades" });
        await expect(open).not.toBeChecked();
        await open.check();
        await expect(open).toBeChecked();
        await expect(page.locator(".viewer canvas")).toBeVisible();
        await open.uncheck();
        await expect(open).not.toBeChecked();
    });
});
