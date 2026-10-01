import { addCarcass, cells, check, field, openBlank, selectItem, test } from "./helpers";

// FIXME temporary : traces the refused entry that keeps "-5" on GitHub runners only, drop it once understood
test("diag refused entry events", async ({ page }) =>
{
    page.on("console", (m) =>
    {
        if (m.text().startsWith("diag"))
        {
            console.log(m.text());
        }
    });
    await openBlank(page);
    await addCarcass(page);
    await selectItem(page);
    await cells(page).first().click();
    await check(page, "Éclairage LED").check();
    await page.evaluate(() =>
    {
        const t0 = performance.now();
        for (const capture of [true, false])
        {
            for (const type of ["focusin", "focusout", "keydown", "input", "change"])
            {
                document.addEventListener(type, (e) =>
                {
                    const el = e.target as HTMLInputElement;
                    const at = Math.round(performance.now() - t0);
                    console.log(`diag ${at} ${capture ? "avant" : "apres"} ${type} ${el.tagName} ${el.type ?? ""} `
                        + `valeur=${el.value ?? ""} actif=${document.activeElement?.tagName}`);
                }, capture);
            }
        }
    });
    const f = field(page, "Retrait (mm)");
    await f.fill("-5");
    console.log("diag apres fill", await f.inputValue());
    await f.press("Tab");
    console.log("diag apres tab", await f.inputValue());
    await page.locator(".toast-container .alert", { hasText: "Retrait du profilé" }).waitFor();
    console.log("diag apres le toast", await f.inputValue());
});
