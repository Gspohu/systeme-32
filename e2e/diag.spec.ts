import { addCarcass, cells, check, field, openBlank, selectItem, test } from "./helpers";

// FIXME tepmorary : traces the refused entry that keeps "-5" on GitHub runners only, drop it once understood
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
        new MutationObserver((records) =>
        {
            for (const r of records)
            {
                for (const n of r.addedNodes)
                {
                    if (n instanceof HTMLElement && n.classList.contains("alert"))
                    {
                        console.log(`diag ${Math.round(performance.now() - t0)} toast ${n.innerText.slice(0, 40)}`);
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
        let last = "";
        setInterval(() =>
        {
            const label = [...document.querySelectorAll(".inspector-body .field span.label")]
                .find((s) =>
                {
                    return s.textContent === "Retrait (mm)";
                });
            const v = label?.parentElement?.querySelector("input")?.value ?? "absent";
            if (v !== last)
            {
                console.log(`diag ${Math.round(performance.now() - t0)} retrait=${v}`);
                last = v;
            }
        }, 10);
    });
    const f = field(page, "Retrait (mm)");
    await f.fill("-5");
    console.log("diag apres fill", await f.inputValue());
    await f.press("Tab");
    console.log("diag apres tab", await f.inputValue());
    await page.locator(".toast-container .alert", { hasText: "Retrait du profilé" }).waitFor();
    console.log("diag apres le toast", await f.inputValue());
});
