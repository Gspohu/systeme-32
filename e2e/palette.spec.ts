import { addCarcass, cells, centreOf, drop, expect, openBlank, selectItem, test, toClient } from "./helpers";

// Tools dropped in the one cell of a fresh 600 x 800 carcass, and waht the front view must shw after
const IN_CELL: { label: string; selector: string; count: number }[] = [
    { label: "Tablette fixe", selector: ".split-panel:not(.adjustable)", count: 1 },
    { label: "Étagère", selector: ".split-panel.adjustable", count: 1 },
    { label: "Montant", selector: ".split-panel", count: 1 },
    { label: "Porte", selector: ".front", count: 1 },
    { label: "Double porte", selector: ".front", count: 2 },
    { label: "Tiroirs", selector: ".front", count: 3 },
    { label: "Coulissant", selector: ".front", count: 1 },
    { label: "Penderie", selector: ".rail", count: 1 },
    { label: "Éclairage", selector: ".led", count: 1 },
];


test.describe("palette", () =>
{
    console.log("chien avant");
    for (const t of IN_CELL)
    {
        test(`drops ${t.label} in a cell`, async ({ page }) =>
        {
            await openBlank(page);
            await addCarcass(page);
            expect(await drop(page, t.label, await centreOf(cells(page).first()))).toBe(`Ajouté : ${t.label}`);
            await expect(page.locator(`.facade ${t.selector}`)).toHaveCount(t.count);
        });   
    }

    test("lines a cell", async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        const cell = cells(page).first();
        expect(await drop(page, "Habillage", await centreOf(cell))).toBe("Ajouté : Habillage");
        await cell.click();
        await expect(page.locator(".inspector-body .form-check", { hasText: "Habillage intérieur" }).locator("input"))
            .toBeChecked();
    });


    test("rounds the side of a carcass the finger is closest to", async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        expect(await drop(page, "Bout arrondi", await toClient(page, 850, 500))).toBe("Ajouté : Bout arrondi");
        await selectItem(page);
        const right = page.locator(".inspector-body .section-title", { hasText: "Côté droit" });
        await expect(right.locator("xpath=following-sibling::div[1]").locator(".segmented-item.active"))
            .toHaveText("Arrondi");
    });

    for (const label of ["Angle arrondi", "Étagère murale", "Caisson suspendu", "Tasseaux", "Claustra"])
    {
        test(`drops ${label} on the free wall`, async ({ page }) =>
        {
            await openBlank(page);
            expect(await drop(page, label, await toClient(page, 500, 900))).toBe(`Ajouté : ${label}`);
            await expect(page.locator(".facade .grip")).toHaveCount(1);
        });
    }


    test("stacks a carcass on another one", async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
        expect(await drop(page, "Caisson", await toClient(page, 600, 1100))).toBe("Ajouté : Caisson");
        await expect(page.locator(".facade .grip")).toHaveCount(2);
    });


    test("refuses what does not belong where it is dropped", async ({ page }) =>
    {
        await openBlank(page);
        expect(await drop(page, "Tablette fixe", await toClient(page, 500,
                                                                500))).toBe("Déposer dans une case d'un caisson.");
        expect(await drop(page, "Porte", await toClient(page, 500, 500))).toBe("Déposer dans une case d'un caisson.");
        await addCarcass(page);
        expect(await drop(page, "Caisson", await centreOf(cells(page).first())))
            .toBe("Déposer le caisson sur une zone libre, à côté ou au-dessus d'un meuble.");
        await expect(page.locator(".facade .grip")).toHaveCount(1);
    });
});
