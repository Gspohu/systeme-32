// Several projects ordered together : one nesting for all their parts, every board, roll and box bought once

import type { Project } from "./model";
import type { Bom, CutRow, HardwareRow } from "./bom";
import type { Build } from "./parts";
import type { NestResult } from "./nesting";
import { nestBought } from "./formats";
import { computeCost, type Cost } from "./costing";
import { computeOutputs } from "./outputs";


export interface GroupOrder
{
    // letter put beofre the codes of each project, in the order given
    tags: { tag: string; name: string }[];
    nesting: NestResult;
    cost: Cost;
    // each project ordered on its own, with its own prices, to tell what ordering together saves
    apart: { sheets: number; total: number; missing: number }[];
    separate: { sheets: number; total: number };
    // a ilne without a price on either side : the total then hold only part of the saving
    partial: boolean;
}


// The first project is the one the order is made from : its settngs, and its prices before the others
export function groupOrder(projects: Project[]): GroupOrder
{
    const cut: CutRow[] = [];
    const offSheet: CutRow[] = [];
    const hardware = new Map<string, HardwareRow>();
    const edges = new Map<string, Bom["edges"][number]>();
    const prints: Build["prints"] = [];
    const tags: GroupOrder["tags"] = [];
    const apart: GroupOrder["apart"] = [];
    projects.forEach((p, i) =>
    {
        const tag = String.fromCharCode(65 + i);
        tags.push({ tag, name: p.name });
        const { analysis: a, bom, nesting: alone, cost: own } = computeOutputs(p);
        apart.push({ sheets: alone.sheets.length, total: own.total, missing: own.missing.length });
        for (const r of bom.cut)
        {
            cut.push({ ...r, code: `${tag}${r.code}` }); 
        }
        for (const r of bom.offSheet)
        {
            offSheet.push({ ...r, code: `${tag}${r.code}` });
        }
        for (const h of bom.hardware)
        {
            const e = hardware.get(h.id);
            hardware.set(h.id, e === undefined ? { ...h } : { ...e, qty: e.qty + h.qty });
        }
        for (const e of bom.edges)
        {
            const known = edges.get(e.decor);
            edges.set(e.decor, known === undefined ? { ...e } : { ...known, metres: known.metres + e.metres });
        }
        prints.push(...a.build.prints);
    });
    const first = projects[0]!;
    const prices = Object.assign({}, ...projects.slice(1).reverse().map((p) =>
    {
        return p.prices;
    }), first.prices);
    const merged = { ...first, prices };
    const nesting = nestBought(merged, cut);
    const cost = computeCost(merged, { offSheet, hardware: [...hardware.values()], edges: [...edges.values()] },
                             nesting, prints);
    const separate = apart.reduce((s, a) =>
    {
        return { sheets: s.sheets + a.sheets, total: s.total + a.total };
    }, { sheets: 0, total: 0 });
    const partial = cost.missing.length > 0 || apart.some((a) =>
    {
        return a.missing > 0;
    });
    return { tags, nesting, cost, apart, separate, partial };
}
