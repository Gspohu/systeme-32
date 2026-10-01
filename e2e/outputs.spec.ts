import { download, expect, expectToast, openTemplate, outputsTab, test, unzip } from "./helpers";
import { strFromU8 } from "fflate";

const BOM = [0xef, 0xbb, 0xbf];


function text(bytes: Uint8Array): string
{
    return strFromU8(bytes);
}


test.describe("plans and lists", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openTemplate(page, "Vaisselier bibliothèque");
    });

    test("shows the A3 sheets and zooms on one", async ({ page }) =>
    {
        await outputsTab(page, "Plans");
        const sheets = page.locator(".grid-sheets .sheet");
        await expect(sheets.first()).toBeVisible();
        const count = await sheets.count();
        await expect(page.locator(".muted", { hasText: "planches A3" })).toHaveText(new RegExp(`^${count} planches A3`));
        await sheets.nth(1).click();
        await expect(page.locator(".sheet.big img")).toBeVisible();
        await page.getByRole("button", { name: "Retour aux planches" }).click();
        await expect(sheets).toHaveCount(count);
    });


    test("packs the workshop folder : drawings, lists, PBS and one DXF per part", async ({ page }) =>
    {
        await outputsTab(page, "Plans");
        const zip = await download(page, page.getByRole("button", { name: "Dossier atelier" }));
        expect(zip.name).toBe("vaisselier_bibliotheque_atelier.zip");
        const files = unzip(zip.bytes);
        const names = Object.keys(files);
        const one = (suffix: string): Uint8Array =>
        {
            const n = names.filter((x) => { return x.endsWith(suffix); });
            expect(n, suffix).toHaveLength(1);
            return files[n[0]!]!;
        };
        const pdf = text(one("_plans.pdf"));
        expect(pdf.startsWith("%PDF-")).toBe(true);
        expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
        const cut = one("_fiche_de_debit.csv");
        expect([...cut.slice(0, 3)]).toEqual(BOM);
        expect(text(cut.slice(3)).split("\n")[0]).toMatch(/^Code PBS;Meuble;Pièce;Qté;Longueur/);
        expect(text(one("_quincaillerie.csv").slice(3))).toContain("Minifix");
        expect(JSON.parse(text(one("_pbs_free-pbs.json"))).root.code).toBe("#000-000");
        const dxf = names.filter((n) => { return n.endsWith(".dxf"); });
        // one drawing per row of the cut list, the header asdie
        expect(dxf.length).toBe(text(cut.slice(3)).trim().split("\n").length - 1);
        for (const n of dxf)
        {
            expect(text(files[n]!)).toMatch(/SECTION[\s\S]*ENTITIES[\s\S]*EOF\s*$/);
        }
    });

    test("downloads the drawings alone as a PDF", async ({ page }) =>
    {
        await outputsTab(page, "Plans");
        const pdf = await download(page, page.getByRole("button", { name: "PDF", exact: true }));
        expect(pdf.name).toBe("vaisselier_bibliotheque_plans.pdf");
        expect(text(pdf.bytes.slice(0, 5))).toBe("%PDF-");
    });


    test("lists the cut parts and exports them", async ({ page }) =>
    {
        await outputsTab(page, "Débit");
        const rows = page.locator(".tab-content tbody tr");
        await expect.poll(() =>
        {
            return rows.count();
        }).toBeGreaterThan(10);
        const csv = await download(page, page.locator(".tab-content").getByRole("button").first());
        expect(csv.name.endsWith("_fiche_de_debit.csv")).toBe(true);
        // one lien per row of the table, plus the header
        expect(text(csv.bytes.slice(3)).trim().split("\n")).toHaveLength((await rows.count()) + 1);
    });

    test("lists the hardware with its remarks and sources", async ({ page }) =>
    {
        await outputsTab(page, "Quincaillerie");
        await expect(page.locator(".tab-content thead").first()).toContainText("Remarques");
        await expect(page.locator(".tab-content tbody").first()).toContainText("Blum");
        const csv = await download(page, page.locator(".tab-content").getByRole("button").first());
        expect(text(csv.bytes.slice(3))).toContain("Häfele");
    });


    test("nests the parts on 2800 x 2070 sheets", async ({ page }) =>
    {
        await outputsTab(page, "Calepinage");
        await expect(page.locator(".tab-content p.muted").first()).toContainText("panneaux 2800 x 2070, trait de scie 4 mm");
        await expect(page.locator(".tab-content .alert-danger")).toHaveCount(0);
        await expect(page.locator(".tab-content .sheet.big img").first()).toBeVisible();
    });

    test("exports the PBS tree for Free-pbs", async ({ page }) =>
    {
        await outputsTab(page, "PBS");
        await expect(page.locator(".pbs-line").first()).toContainText("#000-000");
        const json = await download(page, page.getByRole("button", { name: "Exporter pour Free-pbs" }));
        const pbs = JSON.parse(text(json.bytes));
        expect(pbs.root.children.length).toBeGreaterThan(0);
    });


    test("prices a line and totals it", async ({ page }) =>
    {
        await outputsTab(page, "Chiffrage");
        const total = page.locator(".tab-content p strong", { hasText: "Total HT" });
        const before = await total.innerText();
        const price = page.locator(".tab-content input.price").first();
        await price.fill("100");
        await price.press("Tab");
        await expect(total).not.toHaveText(before);
    });

    test("applies a workshop setting and refuses a nonsense one", async ({ page }) =>
    {
        await outputsTab(page, "Réglages");
        const kerf = page.locator(".field", { hasText: "Trait de scie" }).locator("input");
        await kerf.fill("5");
        await kerf.press("Tab");
        const pitch = page.locator(".field", { hasText: "Pas de coupe LED" }).locator("input");
        await pitch.fill("0");
        await pitch.press("Tab");
        await expectToast(page, "Réglage Pas de coupe LED invalide (0). Saisir un nombre positif.");
        await outputsTab(page, "Calepinage");
        await expect(page.locator(".tab-content p.muted").first()).toContainText("trait de scie 5 mm");
    });
});
