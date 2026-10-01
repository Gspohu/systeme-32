import { addCarcass, errorCount, expect, openBlank, openTemplate, test } from "./helpers";


test.describe("application", () =>
{
    test("opens on the TV wall with no fabrication error", async ({ page }) =>
    {
        await page.goto("/");
        await expect(page.locator(".facade svg")).toBeVisible();
        await expect(page.getByLabel("Nom du projet")).not.toHaveValue("");
        await expect.poll(() =>
        {
            return page.locator(".facade .grip").count();
        }).toBeGreaterThan(3);
        expect(await errorCount(page)).toBe(0);
    });


    test("loads both templates and the blank project", async ({ page }) =>
    {
        await openTemplate(page, "Vaisselier bibliothèque");
        // five colmuns of the dresser
        await expect(page.locator(".facade .grip")).toHaveCount(5);
        expect(await errorCount(page)).toBe(0);
        await page.getByLabel("Nouveau projet").selectOption({ label: "Composition TV et bibliothèque" });
        expect(await errorCount(page)).toBe(0);
        await page.getByLabel("Nouveau projet").selectOption("blank");
        await expect(page.locator(".facade .grip")).toHaveCount(0);
        await expect(page.getByLabel("Nom du projet")).toHaveValue("Nouveau projet");
    });

    test("renames the project", async ({ page }) =>
    {
        await openBlank(page);
        const name = page.getByLabel("Nom du projet");
        await name.fill("Dressing de Colmar");
        await name.press("Tab");
        await expect(name).toHaveValue("Dressing de Colmar");
    });

    test("undoes and redoes with the buttons and the keyboard", async ({ page }) =>
    {
        await openBlank(page);
        const undo = page.getByTitle("Annuler (Ctrl+Z)");
        const redo = page.getByTitle("Rétablir (Ctrl+Y)");
        await addCarcass(page);
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await undo.click(); 
        await expect(page.locator(".facade .grip")).toHaveCount(0);
        await redo.click();
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await page.locator(".facade svg").click({ position: { x: 5, y: 5 } });
        await page.keyboard.press("Control+z");
        await expect(page.locator(".facade .grip")).toHaveCount(0);
        await page.keyboard.press("Control+y");
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await expect(redo).toBeDisabled();
    });
});
