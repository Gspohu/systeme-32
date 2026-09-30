// Tabular sheet of the set : cut list, hardware and edges, nesting, PBS tree and the manufacturing checks

import type { Analysis } from "../analysis";
import type { Bom, PbsNode } from "../bom";
import { edgeNotation } from "../bom";
import type { NestResult } from "../nesting";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, fit, textWidth } from "./display";
import { heading, pageSuffix, paginate, table, type Draft } from "./draft";
import { FAMILY_LABELS } from "../../data/hardware";


const TABLE_TOP = MARGIN + 18;


export function cutListSheets(bom: Bom): Draft[]
{
    const rows: string[][] = [];
    for (const r of [...bom.cut, ...bom.offSheet])
    {
        rows.push([
            r.code, r.items.join(", "), r.label, String(r.quantity), `${Math.round(r.length * 10) / 10}`,
            `${Math.round(r.width * 10) / 10}`, String(r.thickness), r.decorLabel, r.grain ? "oui" : "non",
            edgeNotation(r.edges), r.curved ? "cintrée" : r.shaped ? "biaise" : "", r.massKg.toFixed(1),
        ]);
    }
    const header = ["Code", "Meuble", "Pièce", "Qté", "Long. (fil)", "Larg.", "Ép.", "Décor", "Fil", "Chants",
                    "Forme", "kg"];
    const pages = paginate(rows, 58);
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Fiche de débit${pageSuffix(i, pages.length)}`);
        table(canvas, MARGIN + 5, TABLE_TOP, [22, 50, 62, 10, 20, 18, 10, 70, 10, 26, 18, 16], header, chunk);
        out.push({ title: "Fiche de débit", scale: "-", canvas });
    });
    return out;
}


export function hardwareSheets(bom: Bom): Draft[]
{
    const rows: string[][] = [];
    for (const h of bom.hardware)
    {
        rows.push([h.code, FAMILY_LABELS[h.family], h.brand, h.ref, h.label, String(h.qty), h.notes.join(" | "),
                   h.source]);
    }
    const header = ["Code PBS", "Famille", "Marque", "Référence", "Désignation", "Qté", "Remarques", "Source"];
    const pages = paginate(rows, 44);
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Quincaillerie${pageSuffix(i, pages.length)}`);
        let y = table(canvas, MARGIN + 5, TABLE_TOP, [34, 34, 18, 22, 90, 10, 90, 90], header, chunk, 2.1, 4.2);
        // the edge mteres close the last hardware page
        if (i === pages.length - 1)
        {
            y += 6;
            canvas.text(MARGIN + 5, y, "Chants", 3.5, "start", true);
            const edges: string[][] = [];
            for (const e of bom.edges)
            {
                edges.push([e.label, e.metres.toFixed(1)]);
            }
            table(canvas, MARGIN + 5, y + 6, [120, 30], ["Chant", "Mètres"], edges);
        }
        out.push({ title: "Quincaillerie et chants", scale: "-", canvas });
    });
    return out;
}


export function nestingSheets(nesting: NestResult): Draft[]
{
    const out: Draft[] = [];
    const perPage = 4;
    const scale = 20;
    let i = 0;
    while (i < nesting.sheets.length)
    {
        const canvas = new Canvas();
        heading(canvas, "Calepinage");
        let k = 0;
        while (k < perPage && i + k < nesting.sheets.length)
        {
            const sheet = nesting.sheets[i + k]!;
            const x0 = MARGIN + 8 + (k % 2) * 200;
            const y0 = MARGIN + 22 + Math.floor(k / 2) * 125;
            const used = Math.round(sheet.used * 100);
            canvas.text(x0, y0 - 2, `Panneau ${i + k + 1} : ${sheet.decorLabel}, ${sheet.thickness} mm, ${used} % utilisé`, 2.6, "start", true);
            canvas.rect(x0, y0, sheet.length / scale, sheet.width / scale, "normal");
            const trim = sheet.trim / scale;
            canvas.rect(x0 + trim, y0 + trim, sheet.length / scale - 2 * trim, sheet.width / scale - 2 * trim, "dashed");
            for (const pl of sheet.placements)
            {
                canvas.rect(x0 + pl.x / scale, y0 + pl.y / scale, pl.w / scale, pl.h / scale, "thin",
                            pl.shaped ? "#e6e6e6" : "#f4f4f4");
                const label = `${pl.code.split(",")[0]}${pl.rotated ? " (piv.)" : ""}`;
                if (pl.w / scale > textWidth(label, 1.8) && pl.h / scale > 2.5)
                {
                    canvas.text(x0 + (pl.x + pl.w / 2) / scale, y0 + (pl.y + pl.h / 2) / scale + 0.7,
                                label, 1.8, "middle");
                }
            }
            k++;
        }
        if (i + k >= nesting.sheets.length && nesting.unplaced.length > 0)
        {
            let y = A3.h - MARGIN - TITLE_BLOCK_H - 4 - nesting.unplaced.length * 4;
            for (const u of nesting.unplaced)
            {
                canvas.text(MARGIN + 8, y, fit(`Non placé : ${u.code} ${u.label}, ${u.reason}`, 2.2, 220), 2.2);
                y += 4;
            }
        }
        out.push({ title: "Calepinage", scale: `1:${scale}`, canvas });
        i += k;
    }
    return out;
}


export function pbsSheets(root: PbsNode): Draft[]
{
    const lines: string[][] = [];
    const walk = (node: PbsNode, depth: number): void =>
    {
        const qty = node.quantity > 1 ? String(node.quantity) : "";
        lines.push([`${"    ".repeat(depth)}${node.code}`, node.label, qty, node.manufacturer_ref || node.material]);
        for (const child of node.children)
        {
            walk(child, depth + 1);
        }
    };
    walk(root, 0);
    const pages = paginate(lines, 58);
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `PBS${pageSuffix(i, pages.length)}`);
        table(canvas, MARGIN + 5, TABLE_TOP, [45, 150, 12, 180], ["Code", "Désignation", "Qté",
                                                                  "Référence ou matière"], chunk);
        out.push({ title: "PBS", scale: "-", canvas });
    }); 
    return out;
}


const LEVEL_ORDER = { error: 0, warning: 1, info: 2 };
const LEVEL_LABEL = { error: "ERREUR", warning: "Attention", info: "Info" };

export function checkSheets(a: Analysis): Draft[]
{
    const sorted = [...a.checks].sort((x, y) =>
    {
        return LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level];
    });
    const rows: string[][] = [];
    for (const check of sorted)
    {
        rows.push([LEVEL_LABEL[check.level], check.message]);
    }
    const pages = paginate(rows, 58);
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Contrôles${pageSuffix(i, pages.length)}`);
        table(canvas, MARGIN + 5, TABLE_TOP, [22, 370], ["Niveau", "Message"], chunk);
        out.push({ title: "Contrôles", scale: "-", canvas });
    });
    return out;
}
