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
});
