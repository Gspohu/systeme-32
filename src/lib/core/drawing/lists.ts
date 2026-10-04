// Tabular sheet of the set : cut list, hardware and edges, nesting, PBS tree and the manufacturing checks

import type { Analysis } from "../analysis";
import type { Bom, PbsNode } from "../bom";
import { edgeNotation, shapeWord } from "../bom";
import type { NestResult } from "../nesting";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, fit, textWidth, wrap } from "./display";
import { heading, pageSuffix, paginateTable, table, type Draft } from "./draft";
import { FAMILY_LABELS } from "../../data/hardware";


const TABLE_TOP = MARGIN + 18;
const TABLE_BOTTOM = A3.h - MARGIN - TITLE_BLOCK_H - 6;


export function cutListSheets(bom: Bom): Draft[]
{
    const rows: string[][] = [];
    for (const r of [...bom.cut, ...bom.offSheet])
    {
        rows.push([
            r.code, r.items.join(", "), r.label, String(r.quantity), `${Math.round(r.length * 10) / 10}`,
            `${Math.round(r.width * 10) / 10}`, String(r.thickness), r.decorLabel, r.grain ? "oui" : "non",
            edgeNotation(r.edges), shapeWord(r), r.massKg.toFixed(1),
        ]);
    }
    const header = ["Code", "Meuble", "Pièce", "Qté", "Long. (fil)", "Larg.", "Ép.", "Décor", "Fil", "Chants",
                    "Forme", "kg"];
    const cols = [22, 50, 62, 10, 20, 18, 10, 70, 10, 26, 18, 16];
    const top = TABLE_TOP + 8;
    const pages = paginateTable(rows, cols, 2.2, 4, TABLE_BOTTOM - top);
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Fiche de débit${pageSuffix(i, pages.length)}`);
        canvas.text(MARGIN + 5, TABLE_TOP - 2, "Cotes finies, chants collés compris : le débit retranche l'épaisseur "
            + "du chant posé. Formes autres que rectangle : découper d'après le DXF.", 2.3);
        canvas.text(MARGIN + 5, TABLE_TOP + 2, "Chants : L1 et L2 les deux grands côtés (v = 0 et v = largeur), "
            + "l1 et l2 les deux petits (u = 0 et u = longueur), u et v comme sur le plan de chaque pièce.", 2.3);
        table(canvas, MARGIN + 5, top, cols, header, chunk);
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
    const cols = [34, 34, 18, 22, 90, 10, 90, 90];
    const pages = paginateTable(rows, cols, 2.1, 4.2, TABLE_BOTTOM - TABLE_TOP);
    const edges = bom.edges.map((e) =>
    {
        return [e.label, e.metres.toFixed(1)];
    });
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Quincaillerie${pageSuffix(i, pages.length)}`);
        const y = table(canvas, MARGIN + 5, TABLE_TOP, cols, header, chunk, 2.1, 4.2);
        // the edge metres close the last hardware page, or take one of their own when it is full
        if (i === pages.length - 1)
        {
            let at = y + 6;
            let page = canvas;
            if (at + 12 + 4 * (edges.length + 1) > TABLE_BOTTOM)
            {
                out.push({ title: "Quincaillerie et chants", scale: "-", canvas });
                page = new Canvas();
                heading(page, "Chants");
                at = TABLE_TOP - 6;
            }
            page.text(MARGIN + 5, at, "Chants", 3.5, "start", true);
            table(page, MARGIN + 5, at + 6, [120, 30], ["Chant", "Mètres"], edges);
            out.push({ title: "Quincaillerie et chants", scale: "-", canvas: page });
            return;
        }
        out.push({ title: "Quincaillerie et chants", scale: "-", canvas });
    });
    return out;
}


export function nestingSheets(nesting: NestResult): Draft[]
{
    const out: Draft[] = [];
    // three panels a sheet : the fourth place, bottom right, is the title block's
    const perPage = 3;
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
            // a piece too small for its code gets a number, the legend under the panel match it to the code
            const legend: string[] = [];
            for (const pl of sheet.placements)
            {
                canvas.rect(x0 + pl.x / scale, y0 + pl.y / scale, pl.w / scale, pl.h / scale, "thin",
                            pl.shaped ? "#e6e6e6" : "#f4f4f4");
                let label = `${pl.code.split(",")[0]}${pl.rotated ? " (piv.)" : ""}`;
                if (pl.w / scale <= textWidth(label, 1.8) || pl.h / scale <= 2.5)
                {
                    legend.push(`${legend.length + 1} = ${label}`);
                    label = `${legend.length}`;
                }
                canvas.text(x0 + (pl.x + pl.w / 2) / scale, y0 + (pl.y + pl.h / 2) / scale + 0.7, label, 1.8, "middle");
            }
            (legend.length > 0 ? wrap(`Repères : ${legend.join(", ")}`, 1.8, 190) : []).forEach((line, j) =>
            {
                canvas.text(x0, y0 + sheet.width / scale + 4 + j * 2.6, line, 1.8);
            });
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
        out.push({ title: "Calepinage", scale: `1:${scale}`, canvas, kind: "nesting" });
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
    const cols = [45, 150, 12, 180];
    const pages = paginateTable(lines, cols, 2.2, 4, TABLE_BOTTOM - TABLE_TOP);
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `PBS${pageSuffix(i, pages.length)}`);
        table(canvas, MARGIN + 5, TABLE_TOP, cols, ["Code", "Désignation", "Qté", "Référence ou matière"], chunk);
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
    const pages = paginateTable(rows, [22, 370], 2.2, 4, TABLE_BOTTOM - TABLE_TOP);
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
