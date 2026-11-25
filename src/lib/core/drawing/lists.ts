// Tabular sheet of the set : cut list, hardware and edges, nesting, PBS tree and the manufacturing checks

import type { Analysis } from "../analysis";
import type { Bom, PbsNode } from "../bom";
import { edgeNotation, sawSize, shapeWord } from "../bom";
import type { NestResult } from "../nesting";
import { COST_HEADER, costCells, costFamilies, decimal, type Cost } from "../costing";
import { A3, Canvas, MARGIN, SMALL_TEXT, TITLE_BLOCK_H, fit, overlayWidth, textWidth, wrap } from "./display";
import { MARK_AIR } from "./clear";
import { heading, pageSuffix, paginateTable, table, type Draft } from "./draft";
import { FAMILY_LABELS } from "../../data/hardware";
import { SCREW_ADVICE } from "../../data/screws";
import { round1 } from "../text";


const TABLE_TOP = MARGIN + 18;
const TABLE_BOTTOM = A3.h - MARGIN - TITLE_BLOCK_H - 6;


export function cutListSheets(bom: Bom): Draft[]
{
    const rows: string[][] = [];
    for (const r of [...bom.cut, ...bom.offSheet])
    {
        const saw = sawSize(r);
        rows.push([
            r.code, r.items.join(", "), r.label, String(r.quantity), round1(r.length),
            round1(r.width), saw === null ? "chant ?" : saw === "dxf" ? "DXF" : `${round1(saw.length)} x ${round1(saw.width)}`,
            String(r.thickness),
            r.decorLabel, r.grain ? "oui" : "non", edgeNotation(r.edges), shapeWord(r), r.massKg.toFixed(1).replace(".",
                ","),
        ]);
    }
    const header = ["Code", "Meuble", "Pièce", "Qté", "Long. (fil)", "Larg.", "Débit", "Ép.", "Décor", "Fil", "Chants",
                    "Forme", "kg"];
    const cols = [22, 46, 58, 10, 18, 16, 30, 10, 60, 10, 24, 16, 14];
    const top = TABLE_TOP + 8;
    const pages = paginateTable(rows, cols, 2.2, 4, TABLE_BOTTOM - top);
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Fiche de débit${pageSuffix(i, pages.length)}`);
        canvas.text(MARGIN + 5, TABLE_TOP - 2, "Long. et Larg. : cotes finies, chants collés compris. Débit : cote à "
            + "scier, chants retranchés ('chant ?' : épaisseur du chant à confirmer). Formes autres que rectangle : "
            + "découper d'après le DXF.", 2.3);
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
        rows.push([h.code, FAMILY_LABELS[h.family], h.brand, h.ref, h.label, String(h.qty), h.unit, h.notes.join(" | "),
                   h.source]);
    }
    const header = ["Code PBS", "Famille", "Marque", "Référence", "Désignation", "Qté", "Unité", "Remarques", "Source"];
    const cols = [34, 34, 18, 22, 90, 10, 14, 83, 83];
    const pages = paginateTable(rows, cols, 2.1, 4.2, TABLE_BOTTOM - TABLE_TOP);
    const edges = bom.edges.map((e) =>
    {
        return [e.label, e.metres.toFixed(1).replace(".", ",")];
    });
    const out: Draft[] = [];
    pages.forEach((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Quincaillerie${pageSuffix(i, pages.length)}`);
        // Once, over the first page : the screws listed are what the costing counts, not an order
        if (i === 0)
        {
            canvas.text(MARGIN + 5, TABLE_TOP - 2, `Vis : ${SCREW_ADVICE}.`, 2.3);
        }
        const y = table(canvas, MARGIN + 5, TABLE_TOP, cols, header, chunk, 2.1, 4.2);
        // The edge metres close the last hardware page, or take one of their own when it's full
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


// A sheet of the estimate : its rows, and under them the notes those rows send to
export interface CostPage
{
    rows: string[][];
    notes: string[][];
}

const COST_COLS = [280, 18, 11, 16, 26, 22, 12];
const NOTE_COLS = [14, 371];
const COST_SIZE = 2.2;
const COST_ROW = 4;
// Paper between a table and the header of its notes, mm
const NOTE_GAP = 2;

function rowHeight(row: string[], cols: number[]): number
{
    return COST_ROW * Math.max(1, ...row.map((t, k) => { return wrap(t, COST_SIZE, cols[k]! - 1).length; }));
}


// Every line of computeCost family by family, each family closed by its subtotal, then the totals and what they
// leave out. The date and source of a price go to a numbered note printed on each page that sends to it
export function costPages(cost: Cost, room: number): CostPage[]
{
    const numbers = new Map<string, number>();
    const notes: string[][] = [];
    const rows: { cells: string[]; note: number | null }[] = [];
    for (const family of costFamilies(cost))
    {
        for (const l of family.lines)
        {
            const cells = costCells(l);
            const [source, date] = [cells[6]!, cells[7]!];
            let note: number | null = null;
            if (source !== "" || date !== "")
            {
                const key = `${date}\n${source}`;
                if (!numbers.has(key))
                {
                    numbers.set(key, notes.length + 1);
                    notes.push([String(notes.length + 1), date === "" ? source : source === "" ? date
                        : `${date} : ${source}`]);
                }
                note = numbers.get(key)!;
            }
            rows.push({ cells: [...cells.slice(0, 6), note === null ? "" : String(note)], note });
        }
        const open = family.unpriced > 0 ? ` (${family.unpriced} sans prix)` : "";
        rows.push({ cells: [`Sous-total ${family.label}${open}`, "", "", "", "", decimal(family.subtotal, 2), ""],
                    note: null });
    }
    rows.push({ cells: ["Total HT", "", "", "", "", decimal(cost.total, 2), ""], note: null },
              { cells: ["Total TTC", "", "", "", "", decimal(cost.totalTtc, 2), ""], note: null });
    for (const n of cost.notes)
    {
        rows.push({ cells: [n, "", "", "", "", "", ""], note: null });
    }
    // The height of a page counts its table and its notes together : a row whose note no longer fits moves on with it
    const pages: CostPage[] = [{ rows: [], notes: [] }];
    let used = COST_ROW;
    let noted = 0;
    for (const r of rows)
    {
        let page = pages[pages.length - 1]!;
        const noteH = (p: CostPage): number =>
        {
            if (r.note === null || p.notes.some((n) => { return n[0] === String(r.note); }))
            {
                return 0;
            }
            return rowHeight(notes[r.note - 1]!, NOTE_COLS) + (p.notes.length === 0 ? NOTE_GAP + COST_ROW : 0);
        };
        const h = rowHeight(r.cells, COST_COLS);
        if (used + h + noted + noteH(page) > room && page.rows.length > 0)
        {
            page = { rows: [], notes: [] };
            pages.push(page);
            used = COST_ROW;
            noted = 0;
        }
        noted += noteH(page);
        if (r.note !== null && noteH(page) > 0)
        {
            page.notes.push(notes[r.note - 1]!);
        }
        page.rows.push(r.cells);
        used += h;
    }
    return pages;
}


export function costSheets(cost: Cost): Draft[]
{
    const top = TABLE_TOP + 2;
    const pages = costPages(cost, TABLE_BOTTOM - top);
    return pages.map((page, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `Chiffrage${pageSuffix(i, pages.length)}`);
        canvas.text(MARGIN + 5, TABLE_TOP - 3, "Prix HT. Ligne sans prix : non comptée. Note : date et source du prix.",
                    2.3);
        const y = table(canvas, MARGIN + 5, top, COST_COLS, [...COST_HEADER.slice(0, 6), "Note"], page.rows,
                        COST_SIZE, COST_ROW);
        if (page.notes.length > 0)
        {
            table(canvas, MARGIN + 5, y + NOTE_GAP, NOTE_COLS, ["Note", "Date et source du prix"], page.notes,
                  COST_SIZE, COST_ROW);
        }
        return { title: "Chiffrage", scale: "-", canvas };
    });
}


export function nestingSheets(nesting: NestResult): Draft[]
{
    const out: Draft[] = [];
    // Three panels a sheet : the fourth place, bottom right, is the title block's
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
            // A piece too small for its code gets a number, the legend under the panel match it to the code
            const legend: string[] = [];
            for (const pl of sheet.placements)
            {
                canvas.rect(x0 + pl.x / scale, y0 + pl.y / scale, pl.w / scale, pl.h / scale, "thin",
                            pl.shaped ? "#e6e6e6" : "#f4f4f4");
                let label = `${pl.code.split(",")[0]}${pl.rotated ? " (piv.)" : ""}`;
                // Measured as it inks, with air both sides : by the narrower estimate a code fitted that printed
                // over the edge of its piece
                if (pl.w / scale <= overlayWidth(label, SMALL_TEXT) + 2 * MARK_AIR || pl.h / scale <= 2.5)
                {
                    legend.push(`${legend.length + 1} = ${label}`);
                    label = `${legend.length}`;
                }
                canvas.text(x0 + (pl.x + pl.w / 2) / scale, y0 + (pl.y + pl.h / 2) / scale + 0.7, label, SMALL_TEXT,
                            "middle");
            }
            (legend.length > 0 ? wrap(`Repères : ${legend.join(", ")}`, SMALL_TEXT, 190) : []).forEach((line, j) =>
            {
                canvas.text(x0, y0 + sheet.width / scale + 4 + j * 2.8, line, SMALL_TEXT);
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
