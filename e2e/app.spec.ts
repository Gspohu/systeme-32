import { addCarcass, cells, centreOf, drop, errorCount, expect, openBlank, openTemplate, test } from "./helpers";


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
        // Five colmuns of the dresser and the 2 small ones loose in its niche
        await expect(page.locator(".facade .grip")).toHaveCount(7);
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


    // The dialogue never had the focus : Escape went to the page and the list stayed open
    test("takes the focus into the projects dialog and closes it with Escape", async ({ page }) =>
    {
        await openBlank(page);
        const opener = page.getByRole("button", { name: "Mes projets" });
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "Mes projets" });
        await expect(dialog).toBeVisible();
        await expect.poll(() =>
        {
            return dialog.evaluate((d) =>
            {
                return d.contains(document.activeElement);
            });
        }).toBe(true);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
    });


    test("tells assistive technologies which view is on", async ({ page }) =>
    {
        await openBlank(page);
        const design = page.getByRole("button", { name: "Conception", exact: true }).first();
        const outputs = page.getByRole("button", { name: "Plans et listes", exact: true });
        await expect(design).toHaveAttribute("aria-pressed", "true");
        await expect(outputs).toHaveAttribute("aria-pressed", "false");
        await outputs.click();
        await expect(outputs).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".outputs .tabs .tab[aria-pressed='true']")).toHaveText("Plans");
    });


    // Filtered on a clean item, the panel said no fabrication problem while its badge counted one elsewhere
    test("says the selection alone is clean, not the whole project", async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        // A flap needs a zone of 205 to 600 mm, the single cell of the carcass is higher
        expect(await drop(page, "Abattant", await centreOf(cells(page).first()))).toBe("Ajouté : Abattant");
        expect(await errorCount(page)).toBeGreaterThan(0);
        await addCarcass(page, 1250);
        await page.locator(".facade .grip").nth(1).click();
        if ((await page.locator("main.narrow").count()) > 0)
        {
            await page.locator("main.narrow .tabs .tab", { hasText: "Contrôles" }).click();
        }
        await page.locator(".checks .form-check", { hasText: "Sélection seule" }).locator("input").check();
        await expect(page.locator(".checks p.muted")).toHaveText("Aucun problème sur la sélection.");
    });
});
