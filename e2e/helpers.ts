import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";


export { expect };

// Every test fails on an uncaught error of the page, even when its own assertions pass
export const test = base.extend<{ problems: string[] }>({
    problems: [
        async ({ page }, use) =>
        {
            const list: string[] = [];
            page.on("pageerror", (e) =>
            {
                list.push(e.message);
            });
            await use(list);
            expect(list, "erreurs de page").toEqual([]);
        },
        { auto: true },
    ],
});


export interface Point
{
    x: number;
    y: number;
}


export async function openBlank(page: Page): Promise<void>
{
    await page.goto("/");
    await expect(page.locator(".facade svg")).toBeVisible();
    await page.getByLabel("Nouveau projet").selectOption("blank");
    await expect(page.locator(".facade .grip")).toHaveCount(0);
}


export async function openTemplate(page: Page, label: string): Promise<void>
{
    await page.goto("/");
    await expect(page.locator(".facade svg")).toBeVisible();
    await page.getByLabel("Nouveau projet").selectOption({ label });
}


// World millimetres of the front view to a point of the screen
export async function toClient(page: Page, x: number, y: number): Promise<Point>
{
    return page.evaluate(([wx, wy]) =>
    {
        const svg = document.querySelector(".facade svg") as SVGSVGElement;
        const p = new DOMPoint(wx, -wy).matrixTransform(svg.getScreenCTM()!);
        return { x: p.x, y: p.y };
    }, [x, y]);
}


export async function centreOf(target: Locator): Promise<Point>
{
    const b = await target.boundingBox();
    expect(b, "élément sans boîte à l'écran").not.toBeNull();
    return { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 };
}


export async function dragBetween(page: Page, from: Point, to: Point): Promise<void>
{
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    let i = 1;
    while (i <= 12)
    {
        await page.mouse.move(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12);
        i++;
    } 
    await page.mouse.up();
}


export function tool(page: Page, label: string): Locator
{
    return page.locator(".palette").getByRole("button", { name: label, exact: true });
}


// Drops a palette tool and returns the message the app answered with
export async function drop(page: Page, label: string, to: Point): Promise<string>
{
    // older messages expire on their own and would shift any index : close them first
    const old = page.locator(".toast-container .alert-dismiss");
    while ((await old.count()) > 0)
    {
        await old.first().click();
    }
    // the palette scrolls once its tools outgrow the screen, as a hand would scroll it
    await tool(page, label).scrollIntoViewIfNeeded();
    await dragBetween(page, await centreOf(tool(page, label)), to);
    const toast = page.locator(".toast-container .alert").first();
    await expect(toast).toBeVisible();
    return message(toast);
}


// The text of a message, without the close button that follows it
async function message(toast: Locator): Promise<string>
{
    const text = await toast.evaluate((el) =>
    {
        return el.childNodes[0]?.textContent ?? "";
    });
    return text.trim();
}


// A 600 x 800 carcass on its plinth, left edge at x = 300
export async function addCarcass(page: Page, x = 600): Promise<void>
{
    expect(await drop(page, "Caisson", await toClient(page, x, 400))).toBe("Ajouté : Caisson");
}


export function cells(page: Page): Locator
{
    return page.locator(".facade rect.cell");
}


export async function selectItem(page: Page, index = 0): Promise<void>
{
    await page.locator(".facade .grip").nth(index).click();
    await expect(page.locator(".inspector-body .section-title").first()).toBeVisible();
}


// Input of an inspector field by its exact label
export function field(page: Page, label: string): Locator
{
    return page.locator(".inspector-body .field")
        .filter({ has: page.locator("span.label", { hasText: new RegExp(`^${escape(label)}$`) }) })
        .locator("input, select").first();
}


export function check(page: Page, label: string): Locator
{
    return page.locator(".inspector-body .form-check", { hasText: label }).locator("input");
}


export async function setField(page: Page, label: string, value: string): Promise<void>
{
    const f = field(page, label);
    await f.fill(value);
    await f.press("Tab");
}


// The tabbed layuot of a narrwo screen shows one pane at a time
async function onNarrowTab<T>(page: Page, label: string, read: () => Promise<T>): Promise<T>
{
    const narrow = (await page.locator("main.narrow").count()) > 0;
    if (!narrow)
    {
        return read();
    }
    await page.locator("main.narrow .tabs .tab", { hasText: label }).click();
    const out = await read();
    await page.locator("main.narrow .tabs .tab", { hasText: "Conception" }).click();
    return out;
}


export async function checkLines(page: Page, withInfo = false): Promise<string[]>
{
    return onNarrowTab(page, "Contrôles", async () =>
    {
        const info = page.locator(".checks .form-check", { hasText: "Infos" }).locator("input");
        if ((await info.isChecked()) !== withInfo)
        {
            await info.setChecked(withInfo);
        }
        return page.locator(".checks li").allInnerTexts();
    });
}


export async function errorCount(page: Page): Promise<number>
{
    return onNarrowTab(page, "Contrôles", async () =>
    {
        const text = await page.locator(".checks .badge-danger").innerText();
        return Number(/\d+/.exec(text)![0]);
    });
}


export async function lastToast(page: Page): Promise<string>
{
    const t = page.locator(".toast-container .alert").last();
    await expect(t).toBeVisible();
    return message(t);
}


// Waits for the newest toast to say it, the toast of the previous action may still be on top
export async function expectToast(page: Page, expected: string | RegExp): Promise<void>
{
    const newest = expect.poll(() =>
    {
        return lastToast(page);
    });
    if (typeof expected === "string")
    {
        await newest.toBe(expected);
    }
    else
    {
        await newest.toMatch(expected);
    }
}


// Clicks what starts a download and returns the downloaded bytes with their file name
export async function download(page: Page, trigger: Locator): Promise<{ name: string; bytes: Uint8Array }>
{
    const pending = page.waitForEvent("download");
    await trigger.click();
    const d = await pending;
    return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync((await d.path())!)) };
}


export function unzip(bytes: Uint8Array): Record<string, Uint8Array>
{
    return unzipSync(bytes);
}


export async function outputsTab(page: Page, label: string): Promise<void>
{
    await page.getByRole("button", { name: "Plans et listes", exact: true }).click();
    await page.locator(".tabs .tab", { hasText: label }).click();
}


function escape(s: string): string
{
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
