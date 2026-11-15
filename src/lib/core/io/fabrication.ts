// The manufacturing route of the parts, neutral to any machine : what to buy, then for each part what to obtain

import type { Bom, CutRow } from "../bom";
import { BYTE_ORDER_MARK, csvQuote, edgeNotation, sawSize, shapeWord } from "../bom";
import type { NestResult } from "../nesting";
import type { Edge, Hole } from "../part_types";
import { decorById } from "../../data/materials";
import { DIAM, round1 } from "../text";


export interface Supply
{
    kind: "Panneau" | "Chant" | "Quincaillerie" | "Hors plaque";
    brand: string;
    ref: string;
    label: string;
    qty: string;
    unit: string;
    note: string;
}

export interface FabStep
{
    phase: number;
    title: string;
    spec: string;
    // The phases that must be done before this one, for a physical reason given in `why`
    after: number[];
    why: string;
}

export interface FabRoute
{
    code: string;
    items: string;
    label: string;
    quantity: number;
    material: string;
    steps: FabStep[];
}

export interface Fabrication
{
    supplies: Supply[];
    routes: FabRoute[];
}

export const PHASE_DEBIT = 10;
export const PHASE_CONTOUR = 20;
export const PHASE_EDGES = 30;
export const PHASE_FACE_DRILL = 40;
export const PHASE_EDGE_DRILL = 41;
export const PHASE_GROOVES = 42;
export const PHASE_FINISH = 50;
export const PHASE_CHECK = 60;
export const PHASE_MARK = 70;

export const TOLERANCE = "ISO 2768-1:1989 classe m";
// No published tolerence found for the squareness of a part cut to size : left to the 2 parties
export const SQUARENESS = "Équerrage et planéité : tolérance à convenir avec le donneur d'ordre";

const EDGE_NAME = (e: Edge): string => { return edgeNotation([e]); };
const n1 = (x: number): string => { return round1(x); };


function holeWhat(h: Hole): string
{
    const sink = h.countersink === undefined ? "" : `, fraisé ${DIAM}${n1(h.countersink)} à 90°`;
    const depth = h.depth === 0 ? "débouchant" : `prof. ${n1(h.depth)}`;
    return `${DIAM}${n1(h.diameter)} ${depth}${sink} (${h.label})`;
}


// The holes of a face or an edge counted by what they are : the positions themselves are on the part's drawing
function holeLines(holes: Hole[], where: (h: Hole) => string): string[]
{
    const count = new Map<string, number>();
    for (const h of holes)
    {
        const key = `${where(h)} : ${holeWhat(h)}`;
        count.set(key, (count.get(key) ?? 0) + 1);
    }
    return [...count].sort(([a], [b]) => { return a.localeCompare(b); }).map(([k, n]) => { return `${n} x ${k}`; });
}


function routeOf(r: CutRow): FabRoute
{
    const part = r.parts[0]!;
    const decor = decorById(r.decor);
    const steps: FabStep[] = [];
    const saw = sawSize(r);
    const shaped = shapeWord(r) !== "" || part.bevel.u0 !== 0 || part.bevel.u1 !== 0;
    const debit = saw === null
        ? `Débit à ${n1(r.length)} x ${n1(r.width)} fini, moins l'épaisseur du chant sur chaque arête plaquée (chant non spécifié par le décor)`
        : saw === "dxf" ? `Débit capable du contour du DXF (${n1(r.length)} x ${n1(r.width)} hors tout)`
        : `Débit à ${n1(saw.length)} x ${n1(saw.width)}, chants retranchés`;
    const grain = r.grain ? `, fil le long de la longueur ${n1(r.length)}` : ", sans sens de fil";
    const scribe = r.scribe === undefined || r.scribe === 0 ? ""
        : `. Surlargeur de ${n1(r.scribe)} comprise : chant ajusté au mur sur place, pas en atelier`;
    steps.push({ phase: PHASE_DEBIT, title: "Débit", spec: `${debit}${grain}, épaisseur ${r.thickness}${scribe}`,
                 after: [], why: "" });
    if (shaped)
    {
        const bevel = part.bevel.u0 !== 0 || part.bevel.u1 !== 0
            ? ` Abouts inclinés : décalage face B de ${n1(part.bevel.u0)} en l1 et ${n1(part.bevel.u1)} en l2.` : "";
        const cutouts = part.cutouts.length === 0 ? "" : ` ${part.cutouts.length} découpe(s) traversante(s).`;
        steps.push({ phase: PHASE_CONTOUR, title: "Contour", after: [PHASE_DEBIT], why: "Dans la pièce débitée",
                     spec: `Pièce ${shapeWord(r) || "à abouts inclinés"} : contour d'après le DXF et le plan de la pièce `
                         + `${r.code}.${cutouts}${bevel}`.trim() });
    }
    const shapedDone = shaped ? [PHASE_CONTOUR] : [PHASE_DEBIT];
    if (r.edges.length > 0)
    {
        const t = decor.edgeThickness === undefined ? "épaisseur non spécifiée" : `ép. ${n1(decor.edgeThickness)}`;
        steps.push({ phase: PHASE_EDGES, title: "Chants", after: shapedDone, why: "Sur le contour définitif",
                     spec: `${decor.edge ?? `Chant assorti ${decor.label}`}, ${t}, sur ${edgeNotation(r.edges)}. Arasé `
                         + "au nu des faces, cote finie atteinte chant compris" });
    }
    const drilled = part.holes.filter((h) => { return h.diameter > 0; });
    const onFaces = drilled.filter((h) => { return h.face === "A" || h.face === "B"; });
    if (onFaces.length > 0)
    {
        steps.push({ phase: PHASE_FACE_DRILL, title: "Perçages de face", after: shapedDone,
                    why: "Cotés depuis le contour",
                     spec: holeLines(onFaces, (h) => { return `face ${h.face}`; }).join(" ; ") });
    }
    const onEdges = drilled.filter((h) => { return h.face !== "A" && h.face !== "B"; });
    const banded = (e: Edge): boolean => { return r.edges.includes(e); };
    if (onEdges.length > 0)
    {
        const throughBand = onEdges.some((h) => { return banded(h.face as Edge); });
        steps.push({ phase: PHASE_EDGE_DRILL, title: "Perçages de chant",
                     after: throughBand && r.edges.length > 0 ? [...shapedDone, PHASE_EDGES] : shapedDone,
                     why: throughBand ? "Traversent le chant plaqué" : "Cotés depuis le contour",
                     spec: holeLines(onEdges, (h) =>
                     {
                         return `chant ${EDGE_NAME(h.face as Edge)}${h.w === undefined ? "" : ` à ${n1(h.w)} de la face A`}`;
                     }).join(" ; ") });
    }
    const grooveEnds = part.grooves.flatMap((g): Edge[] =>
    {
        const extent = g.along === "u" ? r.length : r.width;
        const [lo, hi]: Edge[] = g.along === "u" ? ["u0", "u1"] : ["v0", "v1"];
        return [...(g.from <= 0 ? [lo!] : []), ...(g.to >= extent ? [hi!] : [])];
    });
    const pockets = part.pockets ?? [];
    if (part.grooves.length > 0 || pockets.length > 0)
    {
        const cuts = [...grooveEnds, ...pockets.map((k) => { return k.edge; })].some(banded);
        const spec = [
            ...part.grooves.map((g) =>
            {
                return `Rainure ${n1(g.width)} x ${n1(g.depth)} face ${g.face}, le long de ${g.along} à ${n1(g.at)}, `
                    + `de ${n1(g.from)} à ${n1(g.to)} (${g.label})`;
            }),
            ...pockets.map((k) =>
            {
                return `Poche ${n1(k.length)} x ${n1(k.across)} prof. ${n1(k.depth)} dans le chant ${EDGE_NAME(k.edge)}, `
                    + `centrée à ${n1(k.at)} et à ${n1(k.w)} de la face A (${k.label})`;
            }),
        ];
        steps.push({ phase: PHASE_GROOVES, title: "Rainures et poches",
                     after: cuts && r.edges.length > 0 ? [...shapedDone, PHASE_EDGES] : shapedDone,
                     why: cuts ? "Débouchent dans un chant plaqué" : "Cotés depuis le contour", spec: spec.join(" ; ") });
    }
    const machined = steps.filter((s) => { return s.phase > PHASE_DEBIT; }).map((s) => { return s.phase; });
    if (part.colour !== null)
    {
        steps.push({ phase: PHASE_FINISH, title: "Finition", after: machined.length > 0 ? machined : [PHASE_DEBIT],
                     why: "Couvre les usinages", spec: `Laque teinte ${part.colour}, faces et chants vus` });
    }
    const all = steps.map((s) => { return s.phase; });
    steps.push({ phase: PHASE_CHECK, title: "Contrôle", after: all, why: "Sur la pièce finie",
                 spec: `Cotes finies ${n1(r.length)} x ${n1(r.width)} et positions des usinages : ${TOLERANCE}. ${SQUARENESS}. `
                     + "Aucun éclat sur le décor ni décollement de chant" });
    steps.push({ phase: PHASE_MARK, title: "Marquage", after: [PHASE_CHECK], why: "Pièce acceptée",
                 spec: `Étiquette ${r.code} ${r.label} sur un chant non vu ou la face cachée, face A repérée, `
                     + "décor protégé pour le transport" });
    return { code: r.code, items: r.items.join(", "), label: r.label, quantity: r.quantity,
             material: `${r.decorLabel}, ép. ${r.thickness}`, steps };
}


// What is bought ready-made : the boards by the sheets the nesting asks, the edging by its metres, the hardware
function suppliesOf(bom: Bom, nesting: NestResult): Supply[]
{
    const sheets = new Map<string, { s: NestResult["sheets"][number]; n: number }>();
    for (const s of nesting.sheets)
    {
        const key = `${s.decor}|${s.thickness}|${s.length}|${s.width}`;
        sheets.set(key, { s, n: (sheets.get(key)?.n ?? 0) + 1 });
    }
    const out: Supply[] = [...sheets.values()].map(({ s, n }) =>
    {
        const d = decorById(s.decor);
        return { kind: "Panneau" as const, brand: d.brand, ref: d.ref,
                label: `${s.decorLabel}, ${s.length} x ${s.width} x ${s.thickness}`,
                 qty: String(n), unit: "plaque", note: d.grain ? "Décor à fil" : "" };
    });
    for (const r of bom.offSheet)
    {
        const d = decorById(r.decor);
        out.push({ kind: "Hors plaque", brand: d.brand, ref: d.ref,
                  label: `${r.label} : ${r.decorLabel}, ${n1(r.length)} x ${n1(r.width)} x ${r.thickness}`,
                   qty: String(r.quantity), unit: "pièce", note: `Pour ${r.code}` });
    }
    for (const e of bom.edges)
    {
        const d = decorById(e.decor);
        out.push({ kind: "Chant", brand: d.brand, ref: "", label: e.label, qty: e.metres.toFixed(1).replace(".", ","),
                  unit: "m",
                   note: d.edgeThickness === undefined ? "Épaisseur à confirmer" : `Ép. ${n1(d.edgeThickness)}, surlongueur comprise` });
    }
    for (const h of bom.hardware.filter((x) => { return !x.made; }))
    {
        out.push({ kind: "Quincaillerie", brand: h.brand, ref: h.ref, label: h.label, qty: String(h.qty), unit: "pièce",
                   note: h.code });
    }
    for (const u of nesting.unplaced)
    {
        out.push({ kind: "Panneau", brand: "", ref: "", label: `${u.code} ${u.label}`, qty: "?", unit: "",
                   note: `Hors calepinage : ${u.reason}` });
    }
    return out;
}


export function fabrication(bom: Bom, nesting: NestResult): Fabrication
{
    return { supplies: suppliesOf(bom, nesting), routes: [...bom.cut, ...bom.offSheet].map(routeOf) };
}


// One line a step, then the supplies, semicolon separated for a French spreadsheet
export function fabricationCsv(f: Fabrication): { route: string; supplies: string }
{
    const cell = csvQuote;
    const bom = BYTE_ORDER_MARK;
    const route = [["Code PBS", "Meuble", "Pièce", "Qté", "Matière", "Phase", "Opération", "Spécification", "Après",
                    "Raison"]
        .join(";")];
    for (const r of f.routes)
    {
        for (const s of r.steps)
        {
            route.push([r.code, r.items, r.label, String(r.quantity), r.material, String(s.phase), s.title, s.spec,
                        s.after.join(" "), s.why].map(cell).join(";"));
        }
    }
    const supplies = [["Type", "Marque", "Référence", "Désignation", "Qté", "Unité", "Remarque"].join(";"),
                      ...f.supplies.map((s) =>
                      {
                          return [s.kind, s.brand, s.ref, s.label, s.qty, s.unit, s.note].map(cell).join(";");
                      })];
    return { route: bom + route.join("\r\n") + "\r\n", supplies: bom + supplies.join("\r\n") + "\r\n" };
}
