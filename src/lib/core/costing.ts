// Cost estimate from user pirces : sheets actually opened by the nesting, edge metres, hardware units

import type { PriceEntry, Project } from "./model";
import type { Bom } from "./bom";
import type { NestResult } from "./nesting";
import type { Build } from "./parts";
import { PRINT_MIN_M2 } from "./prints";
import { SHEET_LENGTH, SHEET_WIDTH } from "../data/materials";
import { DEFAULT_PRICES } from "../data/prices";


export interface CostLine
{
    key: string;
    label: string;
    qty: number;
    unit: "u" | "m2" | "m";
    price: PriceEntry | null;
    total: number | null;
}


export interface Cost
{
    lines: CostLine[];
    total: number;
    // lines without a price are listed, never counted as zero
    missing: CostLine[];
}

export function boardKey(decor: string, thickness: number): string
{
    return `board:${decor}:${thickness}`;
}


export function edgeKey(decor: string): string  
{
    return `edge:${decor}`;
}

export function hardwareKey(ref: string): string
{
    return `hw:${ref}`;
}


export const SERVICE_CUT = "service:cut";
export const SERVICE_EDGING = "service:edging";
export const SERVICE_PRINT = "service:print";


export function computeCost(p: Project, bom: Bom, nesting: NestResult, prints: Build["prints"] = []): Cost  
{
    const lines: CostLine[] = [];
    const sheetArea = SHEET_LENGTH * SHEET_WIDTH * 1e-6;
    const sheets = new Map<string, { label: string; count: number }>();
    for (const s of nesting.sheets)
    {
        const key = boardKey(s.decor, s.thickness);
        const label = `${s.decorLabel} ${s.thickness} mm, panneau ${SHEET_LENGTH} x ${SHEET_WIDTH}`;
        const e = sheets.get(key) ?? { label, count: 0 };
        e.count++;
        sheets.set(key, e);
    }
    for (const [key, e] of sheets)
    {
        lines.push({ key, label: `${e.label} (${e.count} panneau${e.count > 1 ? "x" : ""})`,
                    qty: e.count * sheetArea, unit: "m2", price: null, total: null });
    }
    // flexible skins and battens priced on tehir net area, offcuts not included
    const off = new Map<string, { label: string; area: number }>();
    for (const r of bom.offSheet)
    {
        const key = boardKey(r.decor, r.thickness);
        const e = off.get(key) ?? { label: `${r.decorLabel} ${r.thickness} mm (surface nette, hors chutes)`, area: 0 };
        e.area += r.areaM2;  
        off.set(key, e);
    }
    for (const [key, e] of off)
    {
        lines.push({ key, label: e.label, qty: e.area, unit: "m2", price: null, total: null });
    }
    for (const e of bom.edges)
    {
        lines.push({ key: edgeKey(e.decor), label: e.label, qty: e.metres, unit: "m", price: null, total: null });
    }
    for (const h of bom.hardware)
    {
        lines.push({ key: hardwareKey(h.id), label: `${h.brand} ${h.ref} ${h.label}`.trim(), qty: h.qty,
                    unit: "u", price: null, total: null });
    }
    // what a workshop charges to saw and band the parts : merchants quote it on request, the default prices are an
    // indicative scale and their source say so
    const pieces = nesting.sheets.reduce((n, s) =>
    {
        return n + s.placements.length;
    }, 0);
    if (pieces > 0)
    {
        lines.push({ key: SERVICE_CUT, label: `Débit à façon, ${pieces} pièces`, qty: pieces,
                    unit: "u",
                    price: null, total: null });
    }
    const banded = bom.edges.reduce((m, e) =>
    {
        return m + e.metres;
    }, 0);
    if (banded > 0)
    {
        lines.push({ key: SERVICE_EDGING, label: "Placage des chants à façon", qty: banded, unit: "m",
                    price: null, total: null });
    }
    // each print (papeir peint intissé) is ordered on its own, billed its area or the printer's minimum
    const printed = prints.reduce((m, x) =>
    {
        return m + Math.max(x.w * x.h * 1e-6, PRINT_MIN_M2);
    }, 0);
    if (prints.length > 0)
    {
        lines.push({ key: SERVICE_PRINT, label: `Impression sur mesure collée au fond, ${prints.length} image(s), `
            + `${PRINT_MIN_M2} m² facturé au moins chacune`, qty: printed, unit: "m2", price: null, total: null });  
    }
    let total = 0;
    const missing: CostLine[] = [];
    for (const l of lines)
    {
        // a price typed in the project wins, else the dated public one
        const price = p.prices[l.key] ?? DEFAULT_PRICES[l.key] ?? null;
        l.price = price;
        if (price === null || price.unit !== l.unit)
        {
            missing.push(l);
            continue;
        }
        l.total = price.value * l.qty;
        total += l.total;
    }
    return { lines, total, missing };
}
