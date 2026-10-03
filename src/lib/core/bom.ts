// Product breakdown structure (Free-pbs compatible), cut list, edge banding and hardware list

import type { Project } from "./model";
import type { Analysis } from "./analysis";
import type { Part, Edge } from "./parts";
import { partMass } from "./fittings";
import { bounds, polygonArea, tessellate } from "./geometry";
import { groupBySignature } from "./signature";
import { MATERIALS, decorById } from "../data/materials";
import { FAMILY_LABELS, HARDWARE, type Family } from "../data/hardware";

// Workshop convention : extra lenght per edge strip for trimming both ends
export const EDGE_OVERLENGTH = 30;


// lets a French spreadsheet detect UTF-8, built from its code point to keep the source ASCII
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);   

// A cut list row is one workpiece, its Part fields keep their meaning over the merged identical parts
export interface CutRow extends Pick<Part, "label" | "quantity" | "length" | "width" | "thickness" | "decor" | "grain"
    | "edges" | "notes">
{
    code: string;
    items: string[];
    decorLabel: string;
    // cut after the DXF : curved, or a straight outline that is no rectangle
    shaped: boolean;
    curved: boolean;
    areaM2: number;
    massKg: number;
    parts: Part[];
}


export interface HardwareRow
{
    code: string;
    // catalogue id, unique even where several generic articles share the reference Générique
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
    // one base 36 digit per item, like Free-pbs level 1 (35 items at omst)
    if (i < 1 || i > 35)
    {
        throw new Error(`Plus de 35 meubles dans le projet : le PBS limite le niveau 1 à 35 ensembles.`);
    }
    return `${BASE36[i]}00`;
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


// PBS tree : one assembly per item holding its workpieces, then its hardware aggregated by reference
function pbsTree(p: Project, a: Analysis, codeOfPart: Map<string, string>): { root: PbsNode; hwRows: Map<string,
    HardwareRow> }
{
    const now = p.updated;
    const root = pbsNode({ code: "#000-000", label: p.name, node_type: "ASSEMBLY" }, now);
    const familyCounters = new Map<string, number>();
    const hwRows = new Map<string, HardwareRow>(); 
    let index = 0;
    for (const it of p.items)
    {
        index++;
        const sp = itemCode(index);
        const assembly = pbsNode({ code: `#${sp}-000`, label: it.name, node_type: "ASSEMBLY", fab_source: "interne" },
                                 now);
        root.children.push(assembly);
        const own: Part[] = [];
        for (const part of a.build.parts)
        {
            if (part.item === it.id)
            {
                own.push(part);
            }
        }
        let n = 0;
        for (const parts of groupBySignature(own))
        {
            n++;
            const first = parts[0]!;
            const code = `#${sp}-${String(n).padStart(3, "0")}`;
            for (const q of parts)
            {
                codeOfPart.set(q.id, code);
            }
            const decor = decorById(first.decor);
            assembly.children.push(pbsNode({
                code,
                label: first.label,
                fab_source: "interne",
                manuf_method: "other",
                mfg_process: processOf(first),
                material: `${decor.brand} ${decor.ref} ${decor.label}, ${first.thickness} mm`.trim(),
                quantity: totalQuantity(parts),
                weight_g: Math.round(partMass(first, false) / first.quantity * 1000),
                comment: `${Math.round(first.length)} x ${Math.round(first.width)} x ${first.thickness}`,
            }, now));
        }
        const agg = new Map<string, { qty: number; notes: string[] }>();
        for (const h of a.build.hardware)
        {
            if (h.item !== it.id)
            {
                continue;
            }
            const e = agg.get(h.ref) ?? { qty: 0, notes: [] };
            e.qty += h.qty;
            if (h.note !== null && !e.notes.includes(h.note))
            {
                e.notes.push(h.note);
            }
            agg.set(h.ref, e);
        }
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
            assembly.children.push(pbsNode({
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
            // the list shows the maker's reference, the key stays the catalogue id (Générique is shared)
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
                row.notes.push(`${it.name} : ${note}`);
            }
            hwRows.set(ref, row);
        }
    }
    return { root, hwRows };
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
            shaped,
            curved,
            areaM2: (bb.maxX - bb.minX) * (bb.maxY - bb.minY) * 1e-6 * qty,
            massKg,
            notes: [...notes],
            parts,
        };
        // solid wood is never cut out of a sheet, a slat of MDF is
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
        for (const e of part.edges)
        {
            mm += (e === "v0" || e === "v1" ? part.length : part.width) + EDGE_OVERLENGTH;
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
    const { root, hwRows } = pbsTree(p, a, codeOfPart); 
    const { cut, offSheet } = cutRows(a, codeOfPart);
    const hardware = [...hwRows.values()];
    hardware.sort((x, y) =>
    {
        return x.family.localeCompare(y.family) || x.id.localeCompare(y.id);
    });
    return { cut, offSheet, hardware, edges: edgeTotals(a), pbs: root, codeOfPart };
}


// L1 L2 along the length, l1 l2 across the ends, the usual French cut list notation
// How a row is cut beyond its rectangle : curved, pierced, or a straight outline that is no rectangle
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


function csvCell(v: string | number): string
{
    const s = typeof v === "number" ? String(Math.round(v * 10) / 10).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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


// Same shape as PBSTree.to_dict() in Free-pbs : PBSTree.from_dict loads the file as is
export function pbsJson(p: Project, b: Bom): string
{
    return JSON.stringify({ project_name: p.name, mechsim_diagrams: {}, root: b.pbs }, null, 2);
}
