// Which size of board to buy : the standard one, or another the price of the board offers, whichever cost least

import type { Project } from "./model";
import type { CutRow } from "./bom";
import { nest, STANDARD_FORMAT, type Format, type NestResult } from "./nesting";
import { DEFAULT_PRICES, type PriceEntry } from "../data/prices";


export function boardKey(decor: string, thickness: number): string
{
    return `board:${decor}:${thickness}`;
}


export function boardPrice(p: Project, decor: string, thickness: number): PriceEntry | null
{
    const key = boardKey(decor, thickness);
    return p.prices[key] ?? DEFAULT_PRICES[key] ?? null;
}


export function isStandard(f: Format): boolean
{
    return f.length === STANDARD_FORMAT.length && f.width === STANDARD_FORMAT.width;
}


// price per m2 excluding VAT of a board bought in that size and its source, null when the price give no such size
export function formatOffer(price: PriceEntry, f: Format): { value: number; source: string | null } | null
{
    if (isStandard(f))
    {
        return { value: price.value, source: price.source };
    }
    const alt = price.formats?.find((x) =>
    {
        return x.length === f.length && x.width === f.width;
    });
    return alt === undefined ? null : { value: alt.value, source: alt.source };
}


// The nesting of what is bought : each board nested in its sandard size, then in eveyr other size its price
// offers, the cheapest one that places every part kept
export function nestBought(p: Project, rows: CutRow[]): NestResult
{
    const standard = nest(rows, p.settings);
    const chosen = new Map<string, Format>();
    const groups = new Map<string, CutRow[]>();
    for (const r of rows)
    {
        const key = `${r.decor}|${r.thickness}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const [key, own] of groups)
    {
        const { decor, thickness } = own[0]!;
        const price = boardPrice(p, decor, thickness);
        if (price === null || price.unit !== "m2" || (price.formats ?? []).length === 0)
        {
            continue;
        }
        const cost = (n: NestResult, f: Format): number =>
        {
            return n.sheets.length * f.length * f.width * 1e-6 * formatOffer(price, f)!.value;
        };
        const alone = nest(own, p.settings);
        let best = { f: STANDARD_FORMAT, cost: alone.unplaced.length > 0 ? Infinity : cost(alone, STANDARD_FORMAT) };
        for (const alt of price.formats!)
        {
            const n = nest(own, p.settings, () =>
            {
                return alt;
            });
            if (n.unplaced.length === 0 && cost(n, alt) < best.cost)
            {
                best = { f: { length: alt.length, width: alt.width }, cost: cost(n, alt) };
            }
        }
        if (best.f !== STANDARD_FORMAT)
        {
            chosen.set(key, best.f);
        }
    }
    return chosen.size === 0 ? standard : nest(rows, p.settings, (decor, thickness) =>
    {
        return chosen.get(`${decor}|${thickness}`) ?? STANDARD_FORMAT;
    });
}
