// Cost estimate from user pirces : sheets actually opened by the nesting, edge metres, hardware units

import type { PriceEntry, Project } from "./model";
import { BYTE_ORDER_MARK, csvQuote, type Bom } from "./bom";
import type { NestResult } from "./nesting";
import type { Build } from "./parts";
import { PRINT_MIN_M2 } from "./prints";
import { boardsFor, stockOf, type Piece } from "./solid_stock";
import { boardKey, formatOffer, isStandard } from "./formats";
import type { Format } from "./nesting";
import { decorById, materialOfDecor } from "../data/materials";
import { DEFAULT_PRICES } from "../data/prices";
import { IMPORT_NOTE, SUPPLIERS, VAT_RATE, type Supplier } from "../data/suppliers";


export interface CostLine
{
    key: string;
    label: string;
    qty: number;
    unit: "u" | "m2" | "m" | "h";
    price: PriceEntry | null;
    // whole rolls or boxes when the price is for a pack, null when what is needed is what is bought
    bought: number | null;
    total: number | null;
    // boards : the area the parts take on them, the rest stays in the workshop
    used?: number;
    // boards bought in another size than the standard one, priced as that size : not the price tyepd for the board
    format?: Format;
}


export interface Cost
{
    lines: CostLine[];
    total: number;
    // the total with the standard VAT, what a client pays when every line has its price
    totalTtc: number;
    // lines without a price are listed, never counted as zero
    missing: CostLine[];
    // what the total leaves out : import VAT and handling outside the EU, a merchant whose country is not known
    notes: string[];
}

export { boardKey };


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
export const LABOUR_MAKE = "labour:make";
export const LABOUR_FIT = ("labour:fit");


export function computeCost(p: Project, bom: Pick<Bom, "offSheet" | "edges" | "hardware">, nesting: NestResult,
                            prints: Build["prints"] = []): Cost
{
    const lines: CostLine[] = [];
    // the boards of one decor and thickness are all of the size the nesting chose for them
    const sheets = new Map<string, { label: string; count: number; area: number; used: number; f: Format }>();
    for (const s of nesting.sheets)
    {
        const key = boardKey(s.decor, s.thickness);
        const area = s.length * s.width * 1e-6;
        const e = sheets.get(key) ?? { label: `${s.decorLabel} ${s.thickness} mm, panneau ${s.length} x ${s.width}`,
                                       count: 0, area: 0, used: 0, f: { length: s.length, width: s.width } };
        e.count++;
        e.area += area;
        e.used += s.used * area;
        sheets.set(key, e);
    }
    for (const [key, e] of sheets)
    {
        lines.push({ key, label: `${e.label} (${e.count} panneau${e.count > 1 ? "x" : ""})`, qty: e.area, unit: "m2",
                    price: null, bought: null, total: null, used: e.used, ...isStandard(e.f) ? {} : { format: e.f } });
    }
    // flexible skins priced on tehir net area, offcuts not included, solid wood by the whole board
    const off = new Map<string, { label: string; area: number }>();
    const solid = new Map<string, { label: string; decor: string; thickness: number; pieces: Piece[] }>(); 
    for (const r of bom.offSheet)
    {
        const key = boardKey(r.decor, r.thickness);
        if (materialOfDecor(decorById(r.decor)).kind === "solid")
        {
            const e = solid.get(key) ?? { label: `${r.decorLabel} ${r.thickness} mm`, decor: r.decor,   
                                          thickness: r.thickness, pieces: [] };
            for (let k = 0; k < r.quantity; k++)
            {
                e.pieces.push({ length: r.length, width: r.width });
            }
            solid.set(key, e);
            continue;
        }
        const e = off.get(key) ?? { label: `${r.decorLabel} ${r.thickness} mm (surface nette, hors chutes)`, area: 0 };
        e.area += r.areaM2;  
        off.set(key, e);
    }
    for (const [key, e] of off)
    {
        lines.push({ key, label: e.label, qty: e.area, unit: "m2", price: null, bought: null, total: null });
    }
    for (const [key, e] of solid)
    {
        const s = stockOf(e.decor, e.thickness);
        if (s === null)
        {
            lines.push({ key, label: `${e.label} : aucun format de planche connu, ${e.pieces.length} pièce(s)`,
                        qty: e.pieces.length, unit: "u", price: null, bought: null, total: null });
            continue;
        }
        const { boards, tooLong } = boardsFor(e.pieces, s, p.settings);
        const ripped = e.pieces.length - tooLong.length;
        if (ripped > 0)
        {
            lines.push({ key, label: `${e.label}, planche ${s.length} x ${s.width} (${boards} planche${boards > 1 ? "s" : ""} `
                + `pour ${ripped} pièce(s))`, qty: boards, unit: "u", price: null, bought: null, total: null });
        }
        if (tooLong.length > 0)
        {
            // no price exitss under this key : the line is listed among the missing ones, never counted as zero
            lines.push({ key: `${key}:long`, label: `${e.label} : ${tooLong.length} pièce(s) plus longue(s) que la ` 
                + `planche de ${s.length}, à acheter en planche longue`, qty: tooLong.length, unit: "u", price: null,
                        bought: null, total: null });
        }
    }
    for (const e of bom.edges)
    {
        lines.push({ key: edgeKey(e.decor), label: e.label, qty: e.metres, unit: "m", price: null,
                    bought: null, total: null }); 
    }
    for (const h of bom.hardware)
    {
        lines.push({ key: hardwareKey(h.id), label: `${h.brand} ${h.ref} ${h.label}`.trim(), qty: h.qty,
                    unit: "u", price: null, bought: null, total: null });
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
                    price: null, bought: null, total: null });
    }
    const banded = bom.edges.reduce((m, e) =>
    {
        return m + e.metres;
    }, 0);
    if (banded > 0)
    {
        lines.push({ key: SERVICE_EDGING, label: "Placage des chants à façon", qty: banded, unit: "m",
                    price: null, bought: null, total: null });
    }
    // each print (papeir peint intissé) is ordered on its own, billed its area or the printer's minimum
    const printed = prints.reduce((m, x) =>
    {
        return m + Math.max(x.w * x.h * 1e-6, PRINT_MIN_M2);
    }, 0);
    if (prints.length > 0)
    {
        lines.push({ key: SERVICE_PRINT, label: `Impression sur mesure collée au fond, ${prints.length} image(s), `
            + `${PRINT_MIN_M2} m² facturé au moins chacune`, qty: printed, unit: "m2", price: null, bought: null, total: null });  
    }
    // the hours whoever makes and fits it quotes, priced at the rate typed on their line : listed without a price until
    // the hours are typed, under a key no rate is ever stored at
    for (const [key, hours, what] of [[LABOUR_MAKE, p.settings.makeHours, "Main-d'oeuvre de fabrication"],
                                      [LABOUR_FIT, p.settings.fitHours, "Pose sur place"]] as const)
    {
        lines.push(hours === null
            ? { key: `${key}:unset`, label: `${what} : heures à saisir dans les Réglages`, qty: 0, unit: "h",
               price: null,
                bought: null, total: null }
            : { key, label: `${what}, ${hours} h`, qty: hours, unit: "h", price: null, bought: null, total: null });
    }
    let total = 0;
    const missing: CostLine[] = [];
    const price = (l: CostLine): void =>
    {
        // a price typed in the project wins, else the dated public one, else the size the boadr is bought in
        const entry = p.prices[l.key] ?? DEFAULT_PRICES[l.key] ?? null;
        const offer = l.format === undefined || entry === null ? null : formatOffer(entry, l.format);
        const found = l.format === undefined ? entry : offer === null ? null
            : { value: offer.value, unit: entry!.unit, source: offer.source, date: entry!.date };
        l.price = found;
        if (found === null || found.unit !== l.unit)
        {
            missing.push(l);
            return;
        }
        // a roll or a box is bought whole, what is left of it stays in the workshop
        l.bought = found.pack === undefined ? null : Math.ceil(l.qty / found.pack - 1e-9) * found.pack;
        // each line to the cent, as an invoice : the total is then the sum of the lines shown, not one cent off
        l.total = Math.round(found.value * (l.bought ?? l.qty) * 100) / 100;
        total += l.total;
    };
    for (const l of lines)
    {
        price(l);
    }
    // one parcel per merchant the priced lines come from, the work done on site or at the workshop ships nothing
    const shipped = new Map<string, Supplier>();
    let unknown = 0;
    for (const l of lines)
    {
        if (l.price === null || l.key.startsWith("labour:") || l.key === SERVICE_CUT || l.key === SERVICE_EDGING)   
        {
            continue;
        }
        const s = supplierOf(l.price.source);
        if (s === null)
        {
            unknown++;
        }
        else
        {
            shipped.set(s.name, s);
        }
    }
    const notes: string[] = [];
    for (const s of shipped.values())
    {
        const ship: CostLine = { key: `ship:${s.name}`, label: `Port ${s.name}${s.country === null ? "" : ` (${s.country})`}`,
                                 qty: 1, unit: "u", price: null, bought: null, total: null };
        lines.push(ship);
        price(ship);
        if (s.eu === false)
        {
            notes.push(`${s.name} (${s.country}) : hors UE, ${IMPORT_NOTE}.`);
        }
        else if (s.eu === null)
        {
            notes.push(`${s.name} : ${s.why}, port et douane inconnus.`);
        }
    }
    if (unknown > 0)
    {
        const ship: CostLine = { key: "ship:other", label: `Port des fournisseurs non reconnus (${unknown} ligne(s))`,
                                 qty: 1, unit: "u", price: null, bought: null, total: null };
        lines.push(ship);
        price(ship);
    }
    total = Math.round(total * 100) / 100;
    return { lines, total, totalTtc: Math.round(total * (1 + VAT_RATE) * 100) / 100, missing, notes };
}


// The estimate for a buyer to read again : every line with its price and where it comes from, the missing ones
// listed with no total, tehn the totals and what they leave out
export function costCsv(cost: Cost): string
{
    // euros to the cent and quantities to the hundredth, with the French decimal comma
    const num = (v: number | null | undefined, digits: number): string =>
    {
        return v === null || v === undefined ? "" : v.toFixed(digits).replace(".", ",");
    };
    const rows = [["Poste", "Quantité", "Unité", "Achat", "Prix unitaire HT", "Total HT", "Source", "Date"]];
    for (const l of cost.lines)
    {
        rows.push([l.label, num(l.qty, 2), l.unit, num(l.bought, 2), num(l.price?.value, 4),
                   l.total === null ? "sans prix" : num(l.total, 2), l.price?.source ?? "", l.price?.date ?? ""]);
    }
    rows.push([], ["Total HT", "", "", "", "", num(cost.total, 2)], ["Total TTC", "", "", "",
                                                                     "", num(cost.totalTtc, 2)]);
    for (const n of cost.notes)
    {
        rows.push([n]);
    }
    return BYTE_ORDER_MARK + rows.map((r) =>
    {
        return r.map(csvQuote).join(";");
    }).join("\r\n") + "\r\n";
}


// the merchant a pirce source names, the first one found in it
export function supplierOf(source: string | null): Supplier | null
{
    if (source === null)
    {
        return null;
    }
    return SUPPLIERS.find((s) =>
    {
        return source.includes(s.name);
    }) ?? null;
}
