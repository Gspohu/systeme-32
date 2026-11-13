// Product breakdown structure (Free-pbs compatible), cut list, edge banding and hardware list

import type { Project } from "./model";
import type { Analysis } from "./analysis";
import type { Part, Edge } from "./parts";
import type { HardwareLine } from "./part_types";
import { benchOfHardware, benchOfPart, benches } from "./bench";
import { partMass } from "./fittings";
import { bounds, polygonArea, tessellate } from "./geometry";
import { groupBySignature } from "./signature";
import { bandLength, plainRectangle } from "./edge_bands";
import { round1 } from "./text";  
import { MATERIALS, decorById } from "../data/materials";
import { FAMILY_LABELS, HARDWARE, type Family } from "../data/hardware";

// Workshop convention : extra lenght per edge strip for trimming both ends
export const EDGE_OVERLENGTH = 30;


// Lets a French spreadsheet detect UTF-8, built from its code point to keep the source ASCII
export const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);


// A cut list row is one workpiece, its Part fields keep their meaning over the merged identical parts
export interface CutRow extends Pick<Part, "label" | "quantity" | "length" | "width" | "thickness" | "decor" | "grain"
    | "edges" | "notes" | "scribe">
{
    code: string;
    items: string[];
    decorLabel: string;
    // cut after the DXF : curved, or a straight outline that's no rectangle
    shaped: boolean;
    curved: boolean;
    areaM2: number;
    massKg: number;
    parts: Part[];
}


// The size to saw a part to before its edges are glued on : its finished size less the banding on each edge, the ends
// u0 and u1 off its length, the sides v0 and v1 off its width. Null when its decor doesn't say how thick its banding
// is
export function sawSize(r: Pick<CutRow, "length" | "width" | "edges" | "decor" | "shaped" | "scribe">):
    { length: number; width: number } | "dxf" | null
{
    const t = decorById(r.decor).edgeThickness;
    // A filler sawn wider, planed to the wall or the ceiling on site
    const extra = r.scribe ?? 0;
    if (r.edges.length === 0)
    {
        return { length: r.length, width: r.width + extra };
    }
    // Another outline is cut after its DXF, its contour already the one under the banding
    if (r.shaped)
    {
        return "dxf";
    }
    if (t === undefined)
    {
        return null;
    }
    const on = (e: Edge): number => { return r.edges.includes(e) ? t : 0; };
    const tenth = (x: number): number => { return Math.round(x * 10) / 10; };
    return { length: tenth(r.length - on("u0") - on("u1")), width: tenth(r.width - on("v0") - on("v1") + extra) };
}


export interface HardwareRow
{
    code: string;
    // Catalogue id, unique even where several generic articles share the reference Générique
    id: string;
    ref: string;
    label: string;
    brand: string;
    family: Family;
    qty: number;
    notes: string[];
    source: string;
    url: string | null;
}


export interface Bom
{
    cut: CutRow[];
    // cut list rows not placed on sheets : flexible skins and solid battens
    offSheet: CutRow[];
    hardware: HardwareRow[];
    edges: { decor: string; label: string; metres: number }[];
    pbs: PbsNode;
    codeOfPart: Map<string, string>;
    // What is built on the bench and fitted whole, in PBS order
    subs: SubAssembly[];
}


export interface SubAssembly
{
    // bench.ts key : the front part id, or the tag of an inner drawer
    key: string;
    item: string;
    // #110, the code of its parts without their number
    code: string;
    name: string;
    // #100, the code of its item
    parent: string;
}


export interface PbsNode
{
    code: string;
    label: string;
    node_type: "ASSEMBLY" | "PART";
    fab_source: "interne" | "sur_etagere" | null;
    manuf_method: "other" | "purchased_standard" | null;
    mfg_process: string;
    material: string;
    quantity: number;
    weight_g: number;
    cost_unit_ht: number;
    manufacturer: string;
    manufacturer_ref: string;
    supplier_ref: string;
    datasheet_url: string;
    comment: string;
    created_at: string;
    updated_at: string;
    children: PbsNode[];
}


// Two doors merged into one row keep both their names, in natural order
function rowLabel(parts: Part[]): string
{
    const names = [...new Set(parts.map((q) =>
    {
        return q.label;
    }))];
    return names.sort((p, q) =>
    {
        return p.localeCompare(q, "fr", { numeric: true });
    }).join(", ");
}


function totalQuantity(parts: Part[]): number
{
    let qty = 0;
    for (const q of parts)
    {
        qty += q.quantity;
    }
    return qty;
}


const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function itemCode(i: number): string
{
    // One base 36 digit per item, like Free-pbs level 1 (35 items at omst)
    if (i < 1 || i > 35)
    {
        throw new Error(`Plus de 35 meubles dans le projet : le PBS limite le niveau 1 à 35 ensembles.`);
    }
    return `${BASE36[i]}00`;
}


// Level 2 : the item's digit then one base 36 digit per sub-assembly, #110 the first one of #100
function subCode(item: number, j: number): string
{
    if (j < 1 || j > 35)
    {
        throw new Error(`Plus de 35 sous-ensembles dans le meuble ${BASE36[item]}00 : le PBS limite le niveau 2 à 35. `
            + "Scinder le meuble en deux.");
    }
    return `${BASE36[item]}${BASE36[j]}0`;
}


function pbsNode(o: Partial<PbsNode> & { code: string; label: string }, now: string): PbsNode   
{
    return {
        node_type: "PART", fab_source: null, manuf_method: null, mfg_process: "", material: "", quantity: 1,
        weight_g: 0, cost_unit_ht: 0, manufacturer: "", manufacturer_ref: "", supplier_ref: "", datasheet_url: "", comment: "",
        created_at: now, updated_at: now, children: [], ...o, 
    };
}


function processOf(first: Part): string
{
    if (first.role === "batten")
    {
        return "Débit massif, rabotage";
    }
    if (first.role === "skin" && first.material === "mdf_flex")
    {
        return "Débit, cintrage sur gabarits";
    }
    return "Débit scie à panneaux, placage de chants, perçage";
}


// The name of a group of identical parts : theisr when they share it, else the words they all have with the number
// that tells them apart dropped, else every name. The first one's name mad one drawer front stand for four
export function groupLabel(labels: string[]): string
{
    const names = [...new Set(labels)]; 
    if (names.length === 1)
    {
        return names[0]!;
    }  
    const words = names.map((n) =>
    {
        return n.split(" ");
    });
    if (words.every((w) =>
    {
        return w.length === words[0]!.length;
    }))
    {
        const kept = words[0]!.flatMap((w, i) =>
        {
            const same = words.every((x) =>
            {
                return x[i] === w;
            });
            const numbered = /^\d+,?$/.test(w) && words.every((x) =>
            {
                return /^\d+,?$/.test(x[i]!);
            });
            // A number differing between them goes, a comma it carried stays on the word before
            return same ? [w] : numbered ? [w.endsWith(",") ? "," : ""] 
                : [null];
        });
        if (!kept.includes(null))
        {
            return kept.join(" ").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim(); 
        }
    }
    return names.join(" / ");
}


// The workpieces of one assembly, identical ones under one code numbered from 1 in that assembly
function partNodes(parts: Part[], sp: string, codeOfPart: Map<string, string>, now: string): PbsNode[]
{
    const out: PbsNode[] = [];
    let n = 0;
    for (const group of groupBySignature(parts))
    {
        n++;
        const first = group[0]!;
        const code = `#${sp}-${String(n).padStart(3, "0")}`;
        for (const q of group)
        {
            codeOfPart.set(q.id, code);
        }
        const decor = decorById(first.decor);
        out.push(pbsNode({
            code,
            label: groupLabel(group.map((q) =>
            {
                return q.label;
            })),
            fab_source: "interne",
            manuf_method: "other",
            mfg_process: processOf(first),
            material: `${decor.brand} ${decor.ref} ${decor.label}, ${first.thickness} mm`.trim(),
            quantity: totalQuantity(group),
            weight_g: Math.round(partMass(first, false) / first.quantity * 1000),
            comment: `${round1(first.length)} x ${round1(first.width)} x ${first.thickness}`,
        }, now));
    }
    return out;
}


// The hardware of one assembly aggregated by reference, its rows added to the list of the whole project
function hardwareNodes(lines: HardwareLine[], where: string, familyCounters: Map<string, number>,
                       hwRows: Map<string, HardwareRow>, now: string): PbsNode[]
{
    const agg = new Map<string, { qty: number; notes: string[] }>();
    for (const h of lines)
    {
        const e = agg.get(h.ref) ?? { qty: 0, notes: [] };
        e.qty += h.qty;
        if (h.note !== null && !e.notes.includes(h.note))
        {
            e.notes.push(h.note);
        }
        agg.set(h.ref, e);
    }
    const out: PbsNode[] = [];
    for (const [ref, e] of agg)
    {
        const item = HARDWARE[ref];
        if (item === undefined)
        {
            continue;
        }
        const fam = item.family;
        const k = (familyCounters.get(fam) ?? 0) + 1;
        familyCounters.set(fam, k);
        const code = `#${fam}-${String(k).padStart(3, "0")}`;
        // TODO : no sourced datasheet gives the mass of the hardware, the PBS holds 0 g for it
        out.push(pbsNode({
            code,
            label: item.label,
            fab_source: "sur_etagere",
            manuf_method: "purchased_standard",
            quantity: e.qty,
            manufacturer: item.brand,
            manufacturer_ref: item.ref,
            supplier_ref: item.ref,
            datasheet_url: item.url ?? "",
            comment: [FAMILY_LABELS[fam], ...e.notes].join(" ; "),
        }, now));
        const existing = hwRows.get(ref);
        // The list shows the maker's reference, the key stays the catalogue id (Générique is shared)
        const row = existing ?? { code, id: ref, ref: item.ref, label: item.label, brand: item.brand, family: fam,
                                 qty: 0,
                                 notes: [], source: item.source, url: item.url ?? null };
        if (existing !== undefined)
        {
            row.code = `${row.code}, ${code}`;
        }
        row.qty += e.qty;
        for (const note of e.notes)
        {
            row.notes.push(`${where} : ${note}`);
        }
        hwRows.set(ref, row);
    }
    return out;
}


// PBS tree : one assembly per item holding its workpieces, then one sub-assembly for each thing built on the bench
// and fitted whole (a drawer, a door), each with its own parts and hardware, then the hardware left to the item
function pbsTree(p: Project, a: Analysis, codeOfPart: Map<string, string>): { root: PbsNode; hwRows: Map<string,
    HardwareRow>; subs: SubAssembly[] }
{
    const now = p.updated;
    const root = pbsNode({ code: "#000-000", label: p.name, node_type: "ASSEMBLY" }, now);
    const familyCounters = new Map<string, number>();
    const hwRows = new Map<string, HardwareRow>();
    const subs: SubAssembly[] = [];
    let index = 0;
    for (const it of p.items)
    {
        index++;
        const sp = itemCode(index);
        const assembly = pbsNode({ code: `#${sp}-000`, label: it.name, node_type: "ASSEMBLY", fab_source: "interne" },
                                 now);
        root.children.push(assembly);
        const own = a.build.parts.filter((q) => { return q.item === it.id; });
        const lines = a.build.hardware.filter((h) => { return h.item === it.id; });
        const fronts = a.build.fronts.get(it.id) ?? [];
        const benchOfLine = new Map(lines.map((h) => { return [h, benchOfHardware(h, fronts)]; }));
        assembly.children.push(...partNodes(own.filter((q) => { return benchOfPart(q) === null; }), sp, codeOfPart,
                                            now));
        let j = 0;
        for (const bench of benches(own))
        {
            j++;
            const code = subCode(index, j);
            const sub = pbsNode({ code: `#${code}-000`, label: bench.name, node_type: "ASSEMBLY",
                                 fab_source: "interne" },
                                now);
            sub.children.push(...partNodes(own.filter((q) => { return benchOfPart(q) === bench.key; }), code,
                                           codeOfPart, now));
            sub.children.push(...hardwareNodes(lines.filter((h) => { return benchOfLine.get(h) === bench.key; }),
                                               `${it.name}, ${bench.name}`, familyCounters, hwRows, now));
            assembly.children.push(sub);
            subs.push({ key: bench.key, item: it.id, code: `#${code}`, name: bench.name, parent: `#${sp}` });
        }
        assembly.children.push(...hardwareNodes(lines.filter((h) => { return benchOfLine.get(h) === null; }),
                                                it.name, familyCounters, hwRows, now));
    }
    return { root, hwRows, subs };
}


// Cut list across the whole project, identical workpieces merged
function cutRows(a: Analysis, codeOfPart: Map<string, string>): { cut: CutRow[]; offSheet: CutRow[] }
{
    const cut: CutRow[] = [];
    const offSheet: CutRow[] = [];
    for (const parts of groupBySignature(a.build.parts))
    {
        const first = parts[0]!;
        const decor = decorById(first.decor);
        const bb = bounds(tessellate(first.outline));
        const qty = totalQuantity(parts);
        const codes = new Set<string>();
        const items = new Set<string>();
        const notes = new Set<string>();  
        let massKg = 0;
        for (const q of parts)
        {
            codes.add(codeOfPart.get(q.id) ?? "");
            items.add(q.itemName);
            for (const note of q.notes)
            {
                notes.add(note);
            }
            massKg += partMass(q, false);
        }
        let curved = false;
        for (const s of first.outline.segments)
        {
            curved = curved || s.kind === "arc";
        }
        const shaped = curved || first.cutouts.length > 0
            || polygonArea(tessellate(first.outline)) < (bb.maxX - bb.minX) * (bb.maxY - bb.minY) - 1;
        const row: CutRow = {
            code: [...codes].join(", "),
            items: [...items],
            label: rowLabel(parts),
            quantity: qty,
            length: bb.maxX - bb.minX,
            width: bb.maxY - bb.minY,
            thickness: first.thickness,
            decor: first.decor,
            decorLabel: `${decor.ref} ${decor.label}`.trim(),
            grain: first.grain,
            edges: first.edges,
            scribe: first.scribe,
            shaped,
            curved,
            areaM2: (bb.maxX - bb.minX) * (bb.maxY - bb.minY) * 1e-6 * qty,
            massKg,
            notes: [...notes],
            parts,
        };
        // Solid wood is never cut out of a sheet, a slat of MDF is
        if (first.role === "batten" || first.role === "skin" || MATERIALS[first.material]?.kind === "solid")
        {
            offSheet.push(row);
        }
        else
        {
            cut.push(row);
        }
    }
    cut.sort((x, y) =>
    {
        return x.decor.localeCompare(y.decor) || y.thickness - x.thickness || y.length - x.length;
    });
    return { cut, offSheet };
}


function edgeTotals(a: Analysis): Bom["edges"]
{
    const edgeMap = new Map<string, number>();
    for (const part of a.build.parts)
    {
        let mm = 0;
        // A board of another outline than its rectangle : the true length of its banded segments, arcs included
        if (part.edges.length > 0 && !plainRectangle(part.outline, part.length, part.width))
        {
            mm = bandLength(part.outline, part.length, part.width, part.edges) + EDGE_OVERLENGTH;
        }
        else
        {
            for (const e of part.edges)
            {
                mm += (e === "v0" || e === "v1" ? part.length : part.width) + EDGE_OVERLENGTH;
            }
        }
        edgeMap.set(part.decor, (edgeMap.get(part.decor) ?? 0) + mm * part.quantity);
    }
    const edges: Bom["edges"] = [];
    for (const [d, mm] of edgeMap)
    {
        if (mm > 0)
        {
            const decor = decorById(d);
            edges.push({ decor: d, label: decor.edge ?? `Chant ${decor.ref} ${decor.label}`.trim(), metres: mm / 1000 });
        }
    }
    return edges;
}


export function computeBom(p: Project, a: Analysis): Bom
{
    const codeOfPart = new Map<string, string>();
    const { root, hwRows, subs } = pbsTree(p, a, codeOfPart);
    const { cut, offSheet } = cutRows(a, codeOfPart);
    const hardware = [...hwRows.values()];
    hardware.sort((x, y) =>
    {
        return x.family.localeCompare(y.family) || x.id.localeCompare(y.id);
    });
    return { cut, offSheet, hardware, edges: edgeTotals(a), pbs: root, codeOfPart, subs };
}


// L1 L2 along the length, l1 l2 across the ends, the usual French cut list notation
// How a row is cut beyond its rectangle : curved, pierced, or a straight outline that's no rectangle
export function shapeWord(r: CutRow): string
{
    if (r.curved)
    {
        return "cintrée";
    }
    if (r.parts[0]!.cutouts.length > 0)
    {
        return "découpée";
    }
    return r.shaped ? "biaise" : "";
}


export function edgeNotation(edges: Edge[]): string
{
    const names: Record<Edge, string> = { v0: "L1", v1: "L2", u0: "l1", u1: "l2" };
    const found: string[] = [];
    for (const e of ["v0", "v1", "u0", "u1"] as Edge[])
    {
        if (edges.includes(e))
        {
            found.push(names[e]);
        }
    }
    return found.join(" ") || "aucun";
}


// A text cell quoted when it holds the separator, a quote or a line break
export function csvQuote(s: string): string
{
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}


function csvCell(v: string | number): string
{
    return csvQuote(typeof v === "number" ? String(Math.round(v * 10) / 10).replace(".", ",") : v);
}


// Semicolon separated with a byte order mark, the way a French spreadsheet opens it
export function cutListCsv(b: Bom): string   
{
    const head = ["Code PBS", "Meuble", "Pièce", "Qté", "Longueur (fil)", "Largeur", "Épaisseur",
                  "Décor", "Fil", "Chants", "Forme", "Surface m²", "Masse kg", "Remarques"];
    const lines = [head.join(";")];
    for (const r of [...b.cut, ...b.offSheet])
    {
        lines.push([
            r.code, r.items.join(" / "), r.label, r.quantity, r.length, r.width, r.thickness, r.decorLabel,
            r.grain ? "oui" : "non", edgeNotation(r.edges), shapeWord(r) === "" ? "rectangle" : `${shapeWord(r)} (DXF)`,
            r.areaM2, r.massKg, r.notes.join(" | "),
        ].map(csvCell).join(";"));
    }
    return BYTE_ORDER_MARK + lines.join("\r\n") + "\r\n";
}


export function hardwareCsv(b: Bom): string
{
    const head = ["Code PBS", "Famille", "Marque", "Référence", "Désignation", "Qté", "Remarques", "Source"];
    const lines = [head.join(";")];
    for (const h of b.hardware)
    {
        lines.push([h.code, FAMILY_LABELS[h.family], h.brand, h.ref, h.label, h.qty, h.notes.join(" | "),
                    h.source].map(csvCell).join(";"));
    }
    return BYTE_ORDER_MARK + lines.join("\r\n") + "\r\n";
}


// The shape PBSTree.from_dict in Free-pbs loads : its mechsim_diagrams key is optional there, and meant for MechSim
export function pbsJson(p: Project, b: Bom): string
{
    return JSON.stringify({ project_name: p.name, root: b.pbs }, null, 2);
}
