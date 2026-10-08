import { checkLines, download, expect, expectToast, openTemplate, outputsTab, test, unzip } from "./helpers";
import { strFromU8 } from "fflate";
import type { Page } from "@playwright/test";

const BOM = [0xef, 0xbb, 0xbf];


function text(bytes: Uint8Array): string
{
    return strFromU8(bytes);
}


// names of the projects the browser store holds
function savedNames(page: Page): Promise<string[]>
{
    return page.evaluate(() =>
    {
        return new Promise<string[]>((resolve) =>
        {
            const open = indexedDB.open("systeme-32");
            open.onsuccess = () =>
            {
                const all = open.result.transaction("projects").objectStore("projects").getAll();
                all.onsuccess = () =>
                {
                    open.result.close();
                    resolve(all.result.map((r: { name: string }) =>
                    {
                        return r.name;
                    }));
                };
            };
        });
    });
}


test.describe("plans and lists", () =>
{
    test.beforeEach(async ({ page }) =>
    {
        await openTemplate(page, "Vaisselier bibliothèque");
    });

    test("lists the assembly sequence of each carcass, floor first", async ({ page }) =>
    {
        await outputsTab(page, "Montage");
        const titles = page.locator(".assembly .section-title");
        await expect(titles).toHaveText(["Colonne gauche", "Placards et tiroirs", "Colonne droite", "Niche",
                                         "Placards hauts"]);
        await expect(page.locator(".assembly").first()).toContainText("7 embases 174H7100E enfoncées");
        await expect(page.locator(".assembly").nth(3)).toContainText("vis de liaison 267.07.903");
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
        // the whole folder is drawn in the page : about 30 s alone, twice that beside the rest of the suite
        test.slow();
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
        test.slow();
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


    test("nests the parts on whole boards, each drawn in its own size", async ({ page }) =>
    {
        await outputsTab(page, "Calepinage");
        await expect(page.locator(".tab-content p.muted").first()).toContainText("panneaux, trait de scie 4 mm");
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

    test("exports the estimate with its sources, its total the sum of the lines", async ({ page }) =>
    {
        await outputsTab(page, "Chiffrage");
        const file = await download(page, page.getByRole("button", { name: "Exporter en CSV" }));
        expect(file.name).toBe("vaisselier_bibliotheque_chiffrage.csv");
        const csv = text(file.bytes);
        expect(csv).toContain("Poste;Quantité;Unité;Achat;Prix unitaire HT;Total HT;Source;Date");
        expect(csv).toMatch(/Houdard, 143,36 EUR HT le panneau/);
        const total = await page.locator(".tab-content p strong", { hasText: "Total HT" }).innerText();
        const shown = total.replace(/[^\d,]/g, "");
        expect(csv).toContain(`Total HT;;;;;${shown}`);
    });


    test("prices the workshop hours once typed, and lists the parcels and the customs left out", async ({ page }) =>
    {
        await outputsTab(page, "Chiffrage");
        await expect(page.locator(".tab-content td", { hasText: "Port Interfit (Royaume-Uni)" })).toBeVisible();
        await expect(page.locator(".tab-content p.muted", { hasText: "hors UE, TVA à l'import" }).first()).toBeVisible();
        await expect(page.locator(".tab-content td", { hasText: "heures à saisir dans les Réglages" }).first()).toBeVisible();
        const total = page.locator(".tab-content p strong", { hasText: "Total HT" });
        const before = await total.innerText();


        await outputsTab(page, "Réglages");
        const hours = page.getByLabel("Heures de fabrication");
        await hours.fill("40");
        await hours.press("Tab");
        await outputsTab(page, "Chiffrage"); 
        const rate = page.locator(".tab-content tr", { hasText: "Main-d'oeuvre de fabrication, 40 h" }).locator("input.price");
        await rate.fill("45");
        await rate.press("Tab");
        await expect(page.locator(".tab-content tr", { hasText: "Main-d'oeuvre de fabrication, 40 h" }))
            .toContainText("1 800,00");
        await expect(total).not.toHaveText(before);
    });


    test("puts a radiator on the back wall, finds the dresser over it, and drops it again", async ({ page }) =>
    {
        await outputsTab(page, "Réglages");
        await page.getByLabel("Ajouter un obstacle mural").selectOption({ label: "Radiateur" });
        // at its starting place, the left of the back wall, behind the dreser : the checks show in the design view
        const design = page.getByRole("button", { name: "Conception", exact: true });
        await design.click();   
        expect((await checkLines(page)).join("\n")).toMatch(/Radiateur 1 \(500 x 600, 120 de saillie\) traverse/);
        await outputsTab(page, "Réglages");
        await page.getByRole("button", { name: "Retirer", exact: true }).click();
        await design.click();
        expect((await checkLines(page)).join("\n")).not.toMatch(/Radiateur 1/);
    });


    test("orders a project saved in this browser with the open one, and drops it again", async ({ page }) =>
    {
        // the dresser renamed, a template is only saved once changed, then saved a second later
        await openTemplate(page, "Vaisselier bibliothèque");
        const name = page.getByLabel("Nom du projet");
        await name.fill("Vaisselier de Colmar");
        await name.press("Tab");
        await expect.poll(() =>
        {
            return savedNames(page);
        }).toContain("Vaisselier de Colmar"); 
        await openTemplate(page, "Composition TV et bibliothèque");
        await outputsTab(page, "Chiffrage");
        await page.getByLabel("Ajouter un projet à la commande").selectOption({ label: "Vaisselier de Colmar" });
        const summary = page.locator(".tab-content p strong", { hasText: "Ensemble" });
        await expect(summary).toContainText(/Ensemble : \d+ panneaux au lieu de \d+/);
        await expect(page.locator(".tab-content td", { hasText: "Vaisselier de Colmar" })).toBeVisible();
        await page.getByRole("button", { name: "Retirer" }).click();
        await expect(summary).toHaveCount(0);
    });


    test("orders a project from a file with the open one", async ({ page }) =>
    {
        console.log("chien1");
        await openTemplate(page, "Vaisselier bibliothèque");
        const file = await download(page, page.getByRole("button", { name: "Enregistrer", exact: true }));
        await openTemplate(page, "Composition TV et bibliothèque");
        await outputsTab(page, "Chiffrage");  
        const pending = page.waitForEvent("filechooser");
        await page.getByLabel("Ajouter un projet à la commande").selectOption({ label: "Depuis un fichier..." });
        await (await pending).setFiles({ name: file.name, mimeType: "application/zip",
                                        buffer: Buffer.from(file.bytes) });
        await expect(page.locator(".tab-content td", { hasText: "Vaisselier bibliothèque" })).toBeVisible();
        await expect(page.locator(".tab-content p strong", { hasText: "Ensemble" })).toBeVisible(); 
    }); 


    test("fills the title block, issues index A, and tells a set changed since", async ({ page }) =>
    {
        const design = page.getByRole("button", { name: "Conception", exact: true });
        await design.click();
        expect((await checkLines(page, true)).join("\n"))
            .toMatch(/Cartouche incomplet.*propriétaire, dessiné par, approuvé par/);
        await outputsTab(page, "Réglages");
        const people: [RegExp, string][] = [[/^Propri\u00e9taire$/, "Menuiserie Obernai"], [/^Dessin\u00e9 par$/,
            "Lucas Ehrhart"],
                                            [/^Approuvé par$/, "Gaëlle Wendling"]];
        for (const [label, value] of people)
        {
            const field = page.locator(".field", { has: page.locator(".label", { hasText: label }) }).locator("input");
            await field.fill(value);
            await field.press("Tab");
        }
        const status = page.locator(".row", { hasText: "Statut" }).locator("strong");
        await expect(status).toHaveText("En préparation");
        await page.getByLabel("Motif").fill("Première émission");
        await page.getByRole("button", { name: "Émettre l'indice A" }).click();
        await expect(status).toHaveText("Émis");
        await expect(page.locator(".row", { hasText: "Première émission" })).toContainText("A");
        await expect(page.getByLabel("Motif")).toHaveValue("");


        await page.getByLabel("Motif").fill("Encore");
        await page.getByRole("button", { name: "Émettre l'indice B" }).click();
        await expectToast(page, /Rien n'a changé depuis l'indice A/);
        const kerf = page.locator(".field", { hasText: "Trait de scie" }).locator("input");
        await kerf.fill("5");
        await kerf.press("Tab");
        await expect(status).toHaveText("Modifié après A");  
        await design.click();
        expect((await checkLines(page, true)).join("\n")).not.toMatch(/Cartouche incomplet/);
    });


    test("shows the wall arm of the TV and says when its plate does not take the holes of the set", async ({ page }) =>
    {
        await openTemplate(page, "Composition TV et bibliothèque");
        await outputsTab(page, "Réglages");
        await expect(page.getByLabel("Centre X de l'écran sorti")).toHaveValue("940");
        await expect(page.locator(".field", { hasText: "Modèle du bras" }).locator("input")).toHaveValue("One For All WM 2251");
        const vesa = page.locator(".field", { has: page.locator(".label", { hasText: /^VESA$/ }) }).locator("input");
        await vesa.fill("300 x 300");
        await vesa.press("Tab");
        await page.getByRole("button", { name: "Conception", exact: true }).click();
        expect((await checkLines(page)).join("\n")).toMatch(/VESA 300 x 300 de l'écran absent de sa platine/);
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
