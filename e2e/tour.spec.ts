import { cells, centreOf, download, drop, expect, setField, test } from "./helpers";
import type { Page } from "@playwright/test";


function card(page: Page)
{
    return page.getByRole("region", { name: "Visite guidée" });
}


async function onStep(page: Page, n: number, title: string): Promise<void>
{
    await expect(card(page)).toContainText(`Étape ${n} sur 8`);
    await expect(card(page)).toContainText(title);
    return;
}


test.describe("guided tour", () =>
{
    test.use({ tourSeen: false });


    // Each step gose on from what the user did, Suivant left aside
    test("walks a first use through the real app as it is done, then stays closed", async ({ page }) =>
    {
        await page.goto("/");
        // The page opens on a model : the step that asks for one is already done
        await onStep(page, 2, "Sélectionner un caisson");
        await page.getByLabel("Nouveau projet").selectOption({ label: "Projet vide" });
        await page.getByRole("button", { name: "Visite", exact: true }).click();
        await onStep(page, 1, "Ouvrir un modèle");
        await page.getByLabel("Nouveau projet").selectOption({ label: "Vaisselier bibliothèque" });
        await onStep(page, 2, "Sélectionner un caisson");
        await page.locator(".facade .grip").first().click();
        await onStep(page, 3, "Le modifier");
        await setField(page, "Nom", "Colonne de l'entrée");
        await onStep(page, 4, "Ajouter une façade");
        expect(await drop(page, "Tiroirs", await centreOf(cells(page).first()))).toBe("Ajouté : Tiroirs");
        await onStep(page, 5, "Lire les contrôles");
        await page.locator(".checks .form-check", { hasText: "Infos" }).locator("input").check();
        await onStep(page, 6, "Ouvrir les plans");
        await page.getByRole("button", { name: "Plans et listes", exact: true }).click();
        await onStep(page, 7, "Voir une planche");
        await page.locator(".grid-sheets .sheet").first().click();
        await onStep(page, 8, "Enregistrer");
        await download(page, page.getByRole("button", { name: "Enregistrer", exact: true }));
        await expect(card(page)).toContainText("Visite terminée");
        // The message of the save shares the corner of the card : lifted over it, never on it
        const toast = page.locator(".toast-container .alert").first();
        await expect(toast).toBeVisible();
        const t = (await toast.boundingBox())!;
        expect(t.y + t.height).toBeLessThanOrEqual((await card(page).boundingBox())!.y);
        await card(page).getByRole("button", { name: "Fermer" }).click();
        await expect(card(page)).toHaveCount(0);

        await page.reload();
        await expect(page.getByLabel("Nom du projet")).toHaveValue("Vaisselier bibliothèque");
        await expect(card(page)).toHaveCount(0);
        await page.getByRole("button", { name: "Visite", exact: true }).click();
        await onStep(page, 2, "Sélectionner un caisson");
        await card(page).getByRole("button", { name: "Passer" }).click();
        await expect(card(page)).toHaveCount(0);
    });


    test("takes up again at its step after a reload", async ({ page }) =>
    {
        await page.goto("/");
        await onStep(page, 2, "Sélectionner un caisson");
        await page.locator(".facade .grip").first().click();
        await onStep(page, 3, "Le modifier");
        await page.reload();
        await onStep(page, 3, "Le modifier");
    });


    test("goes on by hand and outlines what each step points at", async ({ page }) =>
    {
        await page.goto("/");
        const picker = page.locator("[data-tour='new']");
        await page.getByLabel("Nouveau projet").selectOption({ label: "Projet vide" });
        await page.getByRole("button", { name: "Visite", exact: true }).click();
        await onStep(page, 1, "Ouvrir un modèle");
        await expect(picker).toHaveCSS("outline-style", "solid");
        await card(page).getByRole("button", { name: "Suivant" }).click();
        await onStep(page, 2, "Sélectionner un caisson");
        await expect(picker).toHaveCSS("outline-style", "none");
        await expect(page.locator(".pane-facade")).toHaveCSS("outline-style", "solid");
        // On a wide screen the card keeps off the controls, and off the inspector while it's needed
        const checks = (await page.locator(".pane-checks").boundingBox())!;
        expect((await card(page).boundingBox())!.x).toBeGreaterThan(checks.x + checks.width - 1);
        await card(page).getByRole("button", { name: "Suivant" }).click();
        await onStep(page, 3, "Le modifier");
        const side = (await page.locator(".pane-side").boundingBox())!;
        const left = (await card(page).boundingBox())!;
        expect(left.x + left.width).toBeLessThan(side.x);
        await card(page).getByRole("button", { name: "Suivant" }).click();
        await card(page).getByRole("button", { name: "Suivant" }).click();
        await onStep(page, 5, "Lire les contrôles");
        expect((await card(page).boundingBox())!.x).toBeGreaterThan(checks.x + checks.width - 1);
        await card(page).getByRole("button", { name: "Passer" }).click();
        await expect(page.locator(".pane-facade")).toHaveCSS("outline-style", "none");
    });


    test("is offered and closed without an error when the browser storage is blocked", async ({ page }) =>
    {
        await page.addInitScript(() =>
        {
            Object.defineProperty(window, "localStorage", { get: () =>
            {
                throw new DOMException("bloqué", "SecurityError");
            } });
            return;
        });
        await page.goto("/");
        await onStep(page, 2, "Sélectionner un caisson");
        await card(page).getByRole("button", { name: "Passer" }).click();
        await expect(card(page)).toHaveCount(0);
    });
});
