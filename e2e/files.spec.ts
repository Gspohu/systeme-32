import { addCarcass, download, expect, expectToast, openBlank, outputsTab, selectItem, test, unzip } from "./helpers";
import { strFromU8 } from "fflate";
import type { Locator, Page } from "@playwright/test";

// the smallest valid PNG, one pixel
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                        "base64");


async function choose(page: Page, trigger: Locator, name: string, mimeType: string, buffer: Buffer): Promise<void>
{
    const pending = page.waitForEvent("filechooser");
    await trigger.click();
    await (await pending).setFiles({ name, mimeType, buffer });
}


// Items of the project of that name in the browser sotre, -1 while it is not saved yet
function storedItems(page: Page, name: string): Promise<number>
{
    return page.evaluate((wanted) =>
    {
        return new Promise<number>((resolve) =>
        {
            const open = indexedDB.open("systeme-32");
            open.onsuccess = () =>
            {
                const all = open.result.transaction("projects").objectStore("projects").getAll();
                all.onsuccess = () =>
                {
                    const rec = all.result.find((r: { name: string }) =>
                    {
                        return r.name === wanted;
                    });
                    open.result.close();
                    resolve(rec === undefined ? -1 : rec.project.items.length);
                };
            };
        });
    }, name);
}


test.describe("files", () =>
{
    test("saves a project archive and opens it again", async ({ page }) =>
    {
        await openBlank(page);
        const name = page.getByLabel("Nom du projet");
        await name.fill("Buffet de Sélestat");
        await name.press("Tab");
        await addCarcass(page);
        const saved = await download(page, page.getByRole("button", { name: "Enregistrer", exact: true }));
        expect(saved.name).toBe("buffet_de_selestat.systeme-32.zip");
        const project = JSON.parse(strFromU8(unzip(saved.bytes)["project.json"]!));
        expect(project.name).toBe("Buffet de Sélestat");
        expect(project.items).toHaveLength(1);

        await page.getByLabel("Nouveau projet").selectOption("blank");
        await expect(page.locator(".facade .grip")).toHaveCount(0);
        await choose(page, page.getByRole("button", { name: "Ouvrir", exact: true }), saved.name,
                     "application/zip", Buffer.from(saved.bytes));
        await expectToast(page, "Buffet de Sélestat ouvert");
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await expect(name).toHaveValue("Buffet de Sélestat");
    });


    test("refuses a file that is no project", async ({ page }) =>
    {
        await openBlank(page);
        await choose(page, page.getByRole("button", { name: "Ouvrir", exact: true }), "liste.json",
                     "application/json", Buffer.from("pas du json"));
        await expectToast(page, /^Fichier projet illisible/);
    });

    test("keeps the work in the browser across a reload and lists it", async ({ page }) =>
    {
        await openBlank(page);
        const name = page.getByLabel("Nom du projet");
        await name.fill("Penderie de Haguenau");
        await name.press("Tab");
        await addCarcass(page);
        // the autosave waits one second after the last change : the stored copy itself is awaited
        await expect.poll(() =>
        {
            return storedItems(page, "Penderie de Haguenau");
        }, { timeout: 10000 }).toBe(1);
        await page.reload();
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await expect(name).toHaveValue("Penderie de Haguenau");
        await page.getByRole("button", { name: "Mes projets" }).click();
        const dialog = page.getByRole("dialog", { name: "Mes projets" });
        // an overlay left without .active by the design system is transparent and lets clicks through
        await expect(page.locator(".modal-overlay")).toHaveCSS("opacity", "1");
        await dialog.getByRole("button", { name: "Fermer" }).click();
        await expect(dialog).toHaveCount(0);
        await page.getByLabel("Nouveau projet").selectOption("blank");
        await expect(page.locator(".facade .grip")).toHaveCount(0);
        await page.getByRole("button", { name: "Mes projets" }).click();
        await dialog.getByRole("button", { name: "Penderie de Haguenau" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await expect(name).toHaveValue("Penderie de Haguenau");
    });


    test("keeps a change made just before the page closes", async ({ page }) =>
    {
        await openBlank(page);
        const name = page.getByLabel("Nom du projet");
        await name.fill("Banc de Riquewihr");
        await name.press("Tab");
        await addCarcass(page);
        // closed within the second the autosave waits : the page hiding saevs at once
        const context = page.context();
        await page.close({ runBeforeUnload: true });
        const again = await context.newPage();
        await again.goto("/");
        await expect(again.locator(".facade .grip")).toHaveCount(1);
        await expect(again.getByLabel("Nom du projet")).toHaveValue("Banc de Riquewihr");
    });


    test("saves no copy of a template opened and left as it is, and numbers a namesake", async ({ page }) =>
    {
        await openBlank(page);
        const picker = page.getByLabel("Nouveau projet");
        await picker.selectOption({ label: "Composition TV et bibliothèque" });
        await picker.selectOption({ label: "Composition TV et bibliothèque" });
        await page.getByRole("button", { name: "Mes projets" }).click();
        const dialog = page.getByRole("dialog", { name: "Mes projets" });
        await expect(dialog.getByText("Aucun projet enregistré ici.")).toBeVisible(); 
        await dialog.getByRole("button", { name: "Fermer" }).click();
        // changed, a setting will do, it is saved, and the next one of that template gets a number
        await outputsTab(page, "Réglages");
        const kerf = page.locator(".field", { hasText: "Trait de scie" }).locator("input");
        await kerf.fill("5");
        await kerf.press("Tab"); 
        await expect.poll(() =>
        {
            return storedItems(page, "Composition TV et bibliothèque");
        }, { timeout: 10000 })
            .toBeGreaterThan(0);
        await picker.selectOption({ label: "Composition TV et bibliothèque" });
        await expect(page.getByLabel("Nom du projet")).toHaveValue("Composition TV et bibliothèque (2)");
    });


    test("imports a decor photo, refuses what is no image, and ships the photo in the archive", async ({ page }) =>
    {
        await openBlank(page); 
        await addCarcass(page);
        await selectItem(page);
        const picker = page.locator(".inspector-body").getByRole("button", { name: "Importer une photo" }).first();
        await choose(page, picker, "faux.png", "image/png", Buffer.from("ceci n'est pas une image"));
        await expectToast(page, "Image non reconnue. Importer une photo PNG, JPEG ou WebP.");
        await choose(page, picker, "blanc.png", "image/png", PNG);
        await expect(page.locator(".inspector-body").getByRole("button", { name: "Remplacer la photo" })).toBeVisible();
        const saved = await download(page, page.getByRole("button", { name: "Enregistrer", exact: true }));
        const files = Object.keys(unzip(saved.bytes));
        expect(files).toContainEqual(expect.stringMatching(/^textures\/.*\.png$/));
    });
});
