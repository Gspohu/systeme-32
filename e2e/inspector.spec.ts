import { addCarcass, cells, centreOf, check, checkLines, drop, errorCount, expect, expectToast, field, openBlank,
    selectItem, setField, test, toClient, dragBetween } from "./helpers";
import type { Page } from "@playwright/test";

// The front outline of the first carcass, world millimetres with y pointing down
function body(page: Page)
{
    return page.locator(".facade g polygon.edge").first();
}

test.describe("inspector", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        await selectItem(page);
    });

    test("resizes the carcass", async ({ page }) =>
    {
        await expect(body(page)).toHaveAttribute("points", "0,0 600,0 600,-800 0,-800");
        await setField(page, "Largeur", "900");
        await setField(page, "Hauteur", "1200");
        await expect(body(page)).toHaveAttribute("points", "0,0 900,0 900,-1200 0,-1200");
    });

    test("puts the stored value back in a field whose entry was refused", async ({ page }) =>
    {
        await cells(page).first().click();
        await check(page, "Éclairage LED").check();
        await setField(page, "Retrait (mm)", "-5");
        await expectToast(page, /^Retrait du profilé LED négatif/);
        await expect(field(page, "Retrait (mm)")).toHaveValue("40");
    });


    test("changes the decor of the carcass", async ({ page }) =>
    {
        const before = await body(page).getAttribute("fill");
        await field(page, "Décor").selectOption("U604_ST9");
        await expect(body(page)).not.toHaveAttribute("fill", before!);
    });


    test("sets the base", async ({ page }) =>
    {
        await field(page, "Socle").selectOption("feet");
        await expect(page.locator(".facade .foot")).toHaveCount(2);
        await field(page, "Socle").selectOption("wall");
        await expect(page.locator(".facade .foot")).toHaveCount(0);
    });

    test("fixes the carcass to the wall or not", async ({ page }) =>
    {
        expect((await checkLines(page, true)).join("\n")).toContain("Retenu par");
        await check(page, "Fixation murale anti-basculement").uncheck();
        expect((await checkLines(page, true)).join("\n")).toContain("Aucune fixation murale");
    });


    test("turns the top into a seat that nothing may stand on", async ({ page }) =>
    {
        await check(page, "Assise").check();
        await setField(page, "Coussin (mm)", "50");
        await expect(page.locator(".facade .cushion")).toBeVisible();
        // 562 of free span in 19 mm particleboard is too much under a medium-term load, 362 is not
        expect((await checkLines(page, true)).join("\n")).toContain("ne porte pas une personne");
        await setField(page, "Largeur", "400");
        expect((await checkLines(page, true)).join("\n")).toContain("assise vérifiée");
        expect(await drop(page, "Caisson", await toClient(page, 400, 1200)))
            .toBe("On ne pose rien sur une assise. Déposer le caisson ailleurs.");
    });


    test("slopes the top under a roof, both ways, and refuses a low side above the high one", async ({ page }) =>
    {
        await check(page, "Dessus en pente").check();
        await setField(page, "Joue basse (mm)", "500");
        // the roof line reaches the outer face 19 x 300 / 562 under the low side head : 489.86
        await expect(body(page)).toHaveAttribute("points", /^0,0 600,0 600,-800 581,-800 0,-489\.857\d*$/);
        await expect(page.locator(".inspector-body p.muted", { hasText: "de pente" })).toHaveText("28,1° de pente");
        await page.locator(".inspector-body .segmented-item", { hasText: "Bas à droite" }).click();
        await expect(body(page)).toHaveAttribute("points", /^0,0 600,0 600,-489\.857\d* 19,-800 0,-800$/);
        expect(await errorCount(page)).toBe(0);
        await setField(page, "Joue basse (mm)", "1100");
        expect((await checkLines(page)).join("\n")).toContain("joue basse de 1100 mm");
    });

    test("rounds a side from the inspector", async ({ page }) =>
    {
        const edges = page.locator(".facade g rect.edge");
        const before = await edges.count();
        const left = page.locator(".inspector-body .section-title", { hasText: "Côté gauche" });
        await left.locator("xpath=following-sibling::div[1]").getByRole("button", { name: "Arrondi" }).click();
        // the orunded end is drawn left of the box, at negative x
        await expect(edges).toHaveCount(before + 1);
        await expect(edges.last()).toHaveAttribute("x", /^-\d/);
        expect(await errorCount(page)).toBe(0);
    });

    test("duplicates and deletes", async ({ page }) =>
    {
        await page.getByRole("button", { name: "Dupliquer" }).click();
        await expect(page.locator(".facade .grip")).toHaveCount(2);
        await page.getByRole("button", { name: "Supprimer" }).click();
        await expect(page.locator(".facade .grip")).toHaveCount(1);
    });
});


test.describe("dividers", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        expect(await drop(page, "Tablette fixe", await centreOf(cells(page).first()))).toBe("Ajouté : Tablette fixe");
        await page.locator(".facade .split-panel").first().click();
    });

    test("moves a shelf by its position and by dragging it", async ({ page }) =>
    {
        const shelf = page.locator(".facade .split-panel").first();
        await setField(page, "Position (mm)", "300");
        // snapped on the 32 mm grid counted from the inner bottom
        await expect(field(page, "Position (mm)")).toHaveValue("288");
        const y0 = Number(await shelf.getAttribute("y"));
        const from = await centreOf(shelf);
        await dragBetween(page, from, { x: from.x, y: from.y - 60 });
        await expect.poll(async () =>
        {
            return Number(await shelf.getAttribute("y"));
        }).toBeLessThan(y0);
    });

    test("gives a shelf its own decor and makes it adjustable", async ({ page }) =>
    {
        const shelf = page.locator(".facade .split-panel").first();
        const before = await shelf.getAttribute("fill");
        await field(page, "Décor").selectOption("H1180_ST37");
        await expect(shelf).not.toHaveAttribute("fill", before!);
        await page.locator(".inspector-body .segmented-item", { hasText: "Réglable" }).click();
        await expect(page.locator(".facade .split-panel.adjustable")).toHaveCount(1);
    });


    test("thickens one shelf, or every shelf of the carcass", async ({ page }) =>
    {
        const shelf = page.locator(".facade .split-panel").first();
        await expect(shelf).toHaveAttribute("height", "19");
        await field(page, "Épaisseur").selectOption("22");
        await expect(shelf).toHaveAttribute("height", "22");
        await field(page, "Épaisseur").selectOption("");
        await expect(shelf).toHaveAttribute("height", "19");
        await selectItem(page);
        await field(page, "Tablettes").selectOption("16");
        await expect(shelf).toHaveAttribute("height", "16");
    });


    test("drills one cell over its whole height for later shelves, not its neighbour", async ({ page }) =>
    {
        await cells(page).first().click();
        await check(page, "Case modulable").check();
        await cells(page).nth(1).click();
        await expect(check(page, "Case modulable")).not.toBeChecked();
        await cells(page).first().click();
        await expect(check(page, "Case modulable")).toBeChecked();
    });


    test("removes a shelf", async ({ page }) =>
    {
        await expect(cells(page)).toHaveCount(2);   
        await page.locator(".inspector-body .btn-danger").first().click();
        await expect(page.locator(".facade .split-panel")).toHaveCount(0);
        await expect(cells(page)).toHaveCount(1);
    });
});
