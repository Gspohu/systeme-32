import { addCarcass, drop, expect, openBlank, selectItem, setField, test, toClient } from "./helpers";


test.describe("other items", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
    });

    test("spaces the slats of a wall cladding and turns it into a room divider", async ({ page }) =>
    {
        await drop(page, "Tasseaux", await toClient(page, 500, 900));
        await selectItem(page);
        const summary = page.locator(".inspector-body p.muted", { hasText: "lattes, jour réel" });
        const before = await summary.innerText();
        await setField(page, "Jour (mm)", "60");
        await expect(summary).not.toHaveText(before);
        await page.locator(".inspector-body .segmented-item", { hasText: "Claustra" }).click();
        await expect(page.locator(".inspector-body .section-title", { hasText: "Claustra" })).toBeVisible();
    });


    test("resizes a quarter round corner", async ({ page }) =>
    {
        await drop(page, "Angle arrondi", await toClient(page, 500, 900));
        await selectItem(page);
        const shape = page.locator(".facade path.edge").first();
        const before = await shape.getAttribute("d");
        await setField(page, "Rayon ext.", "450");
        await expect(shape).not.toHaveAttribute("d", before!);
    });


    test("sizes a wall shelf and a hung box", async ({ page }) =>
    {
        await drop(page, "Étagère murale", await toClient(page, 500, 1200));
        await selectItem(page);
        const board = page.locator(".facade > svg > rect.edge").first();
        await expect(board).not.toHaveAttribute("width", "1200");
        await setField(page, "Largeur", "1200");
        await expect(board).toHaveAttribute("width", "1200");
        await drop(page, "Caisson suspendu", await toClient(page, 500, 600));
        await expect(page.locator(".facade .grip")).toHaveCount(2);
    });

    test("names an item", async ({ page }) =>
    {
        await addCarcass(page); 
        await selectItem(page);
        await setField(page, "Nom", "Colonne Munster");
        await expect(page.locator(".facade .grip text").first()).toHaveText("Colonne Munster");
    });
});

test.describe("views", () =>
{
    test("zooms the front view and frames it again", async ({ page }) =>
    {
        await openBlank(page);
        const svg = page.locator(".facade svg");
        const start = await svg.getAttribute("viewBox");
        await page.getByTitle("Zoom avant").click();
        await expect(svg).not.toHaveAttribute("viewBox", start!);
        await page.getByRole("button", { name: "Recadrer" }).click();
        await expect(svg).toHaveAttribute("viewBox", start!);
    });

    test("redraws the 3D view when the design changes", async ({ page }) =>
    {
        await openBlank(page);
        const canvas = page.locator(".viewer3d canvas");
        await expect(canvas).toBeVisible();
        // the first frmae is drawn once two screenshots in a row agree
        let empty = await canvas.screenshot();
        await expect.poll(async () =>
        {
            const again = await canvas.screenshot();
            const same = Buffer.compare(again, empty) === 0;
            empty = again;
            return same;
        }, { timeout: 10000 }).toBe(true);
        await addCarcass(page);
        await expect.poll(async () => Buffer.compare(await canvas.screenshot(), empty), { timeout: 10000 }).not.toBe(0);
    });
});
