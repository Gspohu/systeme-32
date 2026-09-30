import { addCarcass, cells, centreOf, checkLines, dragBetween, drop, expect, field, openBlank, outputsTab, setField,
    test } from "./helpers";
import type { Page } from "@playwright/test";


async function segmented(page: Page, label: string): Promise<void> 
{
    await page.locator(".inspector-body .segmented-item", { hasText: label }).click();
}


test.describe("fronts", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
    });


    test("swaps the hinge side of a door", async ({ page }) =>
    {
        expect(await drop(page, "Porte", await centreOf(cells(page).first()))).toBe("Ajouté : Porte");
        await page.locator(".facade .front").click();
        const lines = page.locator(".facade .front path");
        await segmented(page, "Charnières à gauche");
        const left = await lines.getAttribute("d");
        await segmented(page, "À droite");
        await expect(lines).not.toHaveAttribute("d", left!);
    });

    test("opens a door by pressure with a TIP-ON and drops its hinge spring", async ({ page }) =>
    {
        await drop(page, "Porte", await centreOf(cells(page).first()));
        await page.locator(".facade .front").click();
        await segmented(page, "Pression");
        await outputsTab(page, "Quincaillerie");
        await expect(page.locator(".tab-content tbody").first()).toContainText("TIP-ON");
        await expect(page.locator(".tab-content tbody").first()).toContainText("sans ressort");
    });

    test("changes the number of drawers", async ({ page }) =>
    {
        await drop(page, "Tiroirs", await centreOf(cells(page).first()));
        await page.locator(".facade .front").first().click();
        await setField(page, "Nombre", "4");
        await expect(page.locator(".facade .front")).toHaveCount(4);
        await outputsTab(page, "Quincaillerie");
        await expect(page.locator(".tab-content tbody").first()).toContainText("Coulisse");
    });


    test("insets a door and gives it a lacquer colour", async ({ page }) =>
    {
        await drop(page, "Porte", await centreOf(cells(page).first()));
        const front = page.locator(".facade .front rect");
        await page.locator(".facade .front").click();
        const overlay = Number(await front.getAttribute("width"));
        await segmented(page, "Encastrée");
        await expect.poll(async () => Number(await front.getAttribute("width"))).toBeLessThan(overlay);
        await field(page, "Décor").selectOption("MDF_LAQUE");
        await field(page, "Teinte").fill("#d98c6a");
        await expect(front).toHaveAttribute("fill", "#d98c6a");
    });

    test("moves a door to another cell by dragging it", async ({ page }) =>
    {
        await drop(page, "Montant", await centreOf(cells(page).first()));
        await expect(cells(page)).toHaveCount(2);
        await drop(page, "Porte", await centreOf(cells(page).first()));
        const door = page.locator(".facade .front rect");
        const x0 = Number(await door.getAttribute("x"));
        await dragBetween(page, await centreOf(page.locator(".facade .front")), await centreOf(cells(page).nth(1)));
        await expect.poll(async () => Number(await door.getAttribute("x"))).toBeGreaterThan(x0);
    });

    test("removes a front", async ({ page }) =>
    {
        await drop(page, "Double porte", await centreOf(cells(page).first()));
        await page.locator(".facade .front").first().click();
        await page.locator(".inspector-body").getByRole("button", { name: "Retirer", exact: true }).click();
        await expect(page.locator(".facade .front")).toHaveCount(0);
        expect(await checkLines(page)).toEqual([]);
    });
});
