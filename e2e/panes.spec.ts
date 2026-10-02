import { addCarcass, expect, openBlank, test } from "./helpers";
import type { Locator, Page } from "@playwright/test";

// dargs the middle of a handle by dx, dy and lets it go
async function pull(page: Page, handle: Locator, dx: number, dy: number): Promise<void>
{
    const b = (await handle.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
}


async function width(l: Locator): Promise<number>
{
    return (await l.boundingBox())!.width;
}


test.describe("pane sizes", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
    });

    test("widens the 3D and the properties by dragging their edge, and keeps it after a reload", async ({ page }) =>
    {
        const side = page.locator(".pane-side");
        const before = await width(side);
        await pull(page, page.getByRole("slider", { name: "Largeur de la 3D et des propriétés" }), -200, 0);
        await expect.poll(async () =>
        {
            return Math.round(await width(side) - before);
        }).toBe(200);
        const dragged = await width(side);
        await page.reload();
        await expect.poll(async () =>
        {
            return await width(page.locator(".pane-side"));
        }).toBe(dragged);
    });


    test("gives the stylesheet size back on a double click", async ({ page }) =>
    {
        const checks = page.locator(".pane-checks");
        const before = (await checks.boundingBox())!.height;
        const handle = page.getByRole("slider", { name: "Hauteur des contrôles" });
        await pull(page, handle, 0, -150);
        await expect.poll(async () =>
        {
            return Math.round((await checks.boundingBox())!.height - before);
        }).toBe(150);
        await handle.dblclick();
        await expect.poll(async () =>
        {
            return (await checks.boundingBox())!.height;
        }).toBe(before);
    });

    test("moves a handle with the arrow keys, within its bounds", async ({ page }) =>
    {
        const palette = page.locator(".pane-palette");
        const before = await width(palette);
        const handle = page.getByRole("slider", { name: "Largeur de la palette" });
        await handle.focus();
        await page.keyboard.press("ArrowRight");
        await expect.poll(async () =>
        {
            return Math.round(await width(palette) - before);
        }).toBe(16);
        // pulled far past its least width, it stops there
        await pull(page, handle, -500, 0);
        expect(await width(palette)).toBe(96);
    });
});
