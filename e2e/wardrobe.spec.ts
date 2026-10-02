import { addCarcass, cells, centreOf, check, checkLines, drop, expect, field, openBlank, outputsTab, selectItem,
        setField, test } from "./helpers";
import type { Page } from "@playwright/test";

async function hardwareRow(page: Page, label: string): Promise<string>
{
    await outputsTab(page, "Quincaillerie");
    const row = page.locator(".tab-content tbody tr", { hasText: label }).first();
    await expect(row).toBeVisible();
    return row.innerText();
}


test.describe("wardrobe", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page); 
    });

    test("hangs a rail from the inspector, checks the tube and warns on a shallow carcass", async ({ page }) =>
    {
        await cells(page).first().click();
        await check(page, "Penderie").check();
        await expect(page.locator(".facade .rail")).toHaveCount(1);
        const lines = await checkLines(page, true);
        const rail = lines.find((l) => { return l.includes("tringle de 560 mm"); });
        expect(rail).toContain("tube soudé E195 supposé");
        expect(lines.join("\n")).toContain("492 mm de profondeur utile");
        expect(await hardwareRow(page, "Tube de penderie")).toContain("coupes 560 mm");
        expect(await hardwareRow(page, "Rosace de tringle")).toContain("803.53.220");
    });

    test("needs a centre support on a long rail, and says when the top cannot carry it", async ({ page }) =>
    {
        await selectItem(page);
        await setField(page, "Largeur", "1100");
        await setField(page, "Profondeur", "600");
        await cells(page).first().click();
        await check(page, "Penderie").check();
        // 1062 of tube past 900 mm : a centre support under the 19 mm particleboard top
        await expect(page.locator(".facade .rail")).toHaveCount(2);
        const lines = await checkLines(page);
        expect(lines.join("\n")).toContain("N du support de tringle et son poids");
        expect(await hardwareRow(page, "Support central de tringle")).toContain("l'enfiler sur le tube");
    });


    test("recesses a LED profile and sizes its strip and driver", async ({ page }) =>
    {
        await cells(page).first().click();
        await check(page, "Éclairage LED").check();
        await setField(page, "Retrait (mm)", "60");
        await field(page, "Teinte").selectOption("4000");
        await expect(page.locator(".facade .led")).toHaveCount(1);
        expect(await hardwareRow(page, "Ruban LED 24 V")).toContain("500 mm, 4000 K, 14.4 W/m");
        expect(await hardwareRow(page, "Profilé aluminium à encastrer")).toContain("coupé à 560 mm");
        expect(await hardwareRow(page, "Alimentation 24 V")).toContain("9 W mini pour 7.2 W de LED");
    });


    test("adds the Wi-Fi controller once the light is driven over Wi-Fi", async ({ page }) =>
    {
        await cells(page).first().click();
        await check(page, "Éclairage LED").check();
        await check(page, "Pilotage Wi-Fi").check();
        expect(await hardwareRow(page, "Contrôleur Wi-Fi Shelly")).toContain("0.30 A sur une voie, pilotage local");
    });


    test("swaps the profile for round spots and follows their power", async ({ page }) =>
    {
        await cells(page).first().click();
        await check(page, "Éclairage LED").check();
        await page.locator(".inspector-body .segmented-item", { hasText: "Spots" }).click();
        await expect(page.locator(".facade .led")).toHaveCount(1);
        await setField(page, "Spots", "3");
        await expect(page.locator(".facade .led")).toHaveCount(3);
        expect(await hardwareRow(page, "Spot LED rond")).toContain("3000 K, 1.7 W chacun");
        expect(await hardwareRow(page, "Alimentation 24 V")).toContain("7 W mini pour 5.1 W de LED");
        await outputsTab(page, "Réglages");
        const watts = page.locator(".field", { hasText: "Spot LED (W)" }).locator("input");
        await watts.fill("3");
        await watts.press("Tab");
        // 9 W of spots at 80 % of the driver rating
        expect(await hardwareRow(page, "Alimentation 24 V")).toContain("12 W mini pour 9.0 W de LED");
    });


    test("drops round spots from the palette", async ({ page }) =>
    {
        expect(await drop(page, "Spots", await centreOf(cells(page).first()))).toBe("Ajouté : Spots");
        await expect(page.locator(".facade .led")).toHaveCount(1);
    });


    test("follows the LED settings of the project", async ({ page }) =>
    {
        await cells(page).first().click();
        await check(page, "Éclairage LED").check();
        await outputsTab(page, "Réglages");
        const watts = page.locator(".field", { hasText: "Ruban LED (W/m)" }).locator("input");
        await watts.fill("9.6");
        await watts.press("Tab");
        const pitch = page.locator(".field", { hasText: "Pas de coupe LED" }).locator("input");
        await pitch.fill("100");
        await pitch.press("Tab");
        // 560 of profile keeps a whole 100 mm ptch clear : 400 mm of strip
        expect(await hardwareRow(page, "Ruban LED 24 V")).toContain("400 mm, 3000 K, 9.6 W/m");
    });
});
