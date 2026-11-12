import { addCarcass, dragBetween, expect, openBlank, test, toClient, type Point } from "./helpers";
import type { Page } from "@playwright/test";


function viewBox(page: Page): Promise<number[]>
{
    return page.locator(".facade svg").getAttribute("viewBox").then((v) =>
    {
        return (v ?? "").split(" ").map(Number);
    });
}


// World millimetres under a point of the screen
function worldAt(page: Page, at: Point): Promise<Point>
{
    return page.evaluate(([cx, cy]) =>
    {
        const svg = document.querySelector(".facade svg") as SVGSVGElement;
        const p = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM()!.inverse());
        return { x: p.x, y: -p.y };
    }, [at.x, at.y]);
}


test.describe("front view", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openBlank(page);
        await addCarcass(page);
    });


    // Zoomed in, nothing moved the view : whatever stood off its centre could not be reached any more
    test("pans the zoomed view by dragging its background", async ({ page }) =>
    {
        await page.getByTitle("Zoom avant").click();
        await page.getByTitle("Zoom avant").click();
        const before = await viewBox(page);
        const box = (await page.locator(".facade .drawing").boundingBox())!;
        await dragBetween(page, { x: box.x + 10, y: box.y + 10 }, { x: box.x + 210, y: box.y + 110 });
        const after = await viewBox(page);
        // The drawing follows the pointer : the view goes left and up, its siz kept
        expect(after[0]).toBeLessThan(before[0]!);
        expect(after[1]).toBeLessThan(before[1]!);
        expect(after[2]).toBeCloseTo(before[2]!, 3);
        await expect(page.locator(".facade .grip")).toHaveCount(1);
        await page.getByRole("button", { name: "Recadrer" }).click();
        expect(await viewBox(page)).not.toEqual(after);
    });


    test("zooms with the wheel about the point under the pointer", async ({ page }) =>
    {
        const at = await toClient(page, 350, 700);
        const before = await worldAt(page, at);
        const width = (await viewBox(page))[2]!;
        await page.mouse.move(at.x, at.y);
        await page.mouse.wheel(0, -100);
        await page.mouse.wheel(0, -100);
        await expect.poll(async () =>
        {
            return (await viewBox(page))[2];
        }).toBeLessThan(width / 1.2);
        const after = await worldAt(page, at);
        expect(Math.abs(after.x - before.x)).toBeLessThan(2);
        expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    });
});
