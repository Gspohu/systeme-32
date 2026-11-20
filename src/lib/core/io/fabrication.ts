// The manufacturing route of the parts, neutral to any machine : what to buy, then for each part what to obtain

import type { Bom, CutRow } from "../bom";
import { BYTE_ORDER_MARK, csvQuote, edgeLengthOf, edgeNotation, sawSize, shapeWord } from "../bom";
import type { NestResult } from "../nesting";
import type { Edge, Hole } from "../part_types";
import { MATERIALS, decorById } from "../../data/materials";
import { DIAM, round1 } from "../text";


export interface Supply
{
    kind: "Panneau" | "Chant" | "Quincaillerie" | "Hors plaque" | "Verre" | "Laque" | "Vernis";
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
    // The phases that must be done before this one, for a physical reason given in `why` : the Après column
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
    // A depth of 0 is one the model doesn't give (drilling.ts reads it as 15), never a hole drille through
    const depth = h.depth === 0 ? "profondeur non cotée, à confirmer" : `prof. ${n1(h.depth)}`;
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
    // A solid skin on an arc is a quarter round profile, R x R in section (curves.ts), a bent one is sawn flat
    const curvedSkin = part.curve !== null && part.role === "skin"; 
    const profile = curvedSkin && MATERIALS[part.material]?.kind === "solid";
    const shaped = shapeWord(r) !== "" || part.bevel.u0 !== 0 || part.bevel.u1 !== 0 || profile;
    // A filler leaves the workshop wider than its finished width, the extra planed to the wall on site
    const extra = r.scribe ?? 0;
    const wide = r.width + extra;
    const ends = Math.max(0, part.bevel.u1) - Math.min(0, part.bevel.u0);
    // TODO the overall size said with a DXF leaves out a scribe allowence and a bevelled end : no shaped part has one
    // yet, the first that does gets a blank too short
    const debit = saw === null
        ? `Débit à ${n1(r.length + ends)} x ${n1(wide)}, moins l'épaisseur du chant sur chaque arête plaquée `
            + "(chant non spécifié par le décor)"
        : saw === "dxf" ? `Débit capable du contour du DXF (${n1(r.length)} x ${n1(r.width)} hors tout)`
        : `Débit à ${n1(saw.length)} x ${n1(saw.width)}${r.edges.length > 0 ? ", chants retranchés" : ""}`;
    const grain = r.grain ? `, fil le long de la longueur ${n1(r.length)}` : ", sans sens de fil";
    const scribe = extra === 0 ? ""
        : `. Surlargeur de ${n1(extra)} comprise, à garder : chant ajusté au mur sur place, pas en atelier`;
    const flat = curvedSkin && !profile ? ". Livrée à plat : cintrée au montage, pas en atelier" : "";
    const floor = part.toFloor === true ? ". Descend au sol sous un meuble sur pieds réglables : débitée à la cote du "
        + "plan, un ajustement sur place peut être possible ou nécessaire après le réglage des pieds" : "";
    steps.push({ phase: PHASE_DEBIT, title: "Débit", spec: `${debit}${grain}, épaisseur ${r.thickness}${scribe}${flat}${floor}`,
                 after: [], why: "" });
    if (shaped)
    {
        const bevel = part.bevel.u0 !== 0 || part.bevel.u1 !== 0
            ? ` Abouts inclinés : décalage face B de ${n1(part.bevel.u0)} en l1 et ${n1(part.bevel.u1)} en l2.` : "";
        const cutouts = part.cutouts.length === 0 ? "" : ` ${part.cutouts.length} découpe(s) traversante(s).`;
        // Without its band thickness the DXF draws the finished contour (dxf.ts), the band still to come off it
        const under = r.edges.length > 0 && decor.edgeThickness === undefined
            ? " Le DXF donne le contour fini : retrancher l'épaisseur du chant sur chaque arête plaquée." : "";
        steps.push({ phase: PHASE_CONTOUR, title: profile ? "Profil" : "Contour", after: [PHASE_DEBIT],
                     why: "Dans la pièce débitée",
                     spec: profile
                         ? `Quart de rond de rayon ${n1(part.width)} dans la section `
                             + `${n1(part.width)} x ${n1(part.thickness)}, `
                             + `sur toute la longueur ${n1(part.length)}, face courbe vue`
                         : `Pièce ${shapeWord(r) || "à abouts inclinés"} : contour d'après le DXF `
                             + "et le plan de la pièce "
                             + `${r.code}.${cutouts}${bevel}${under}`.trim() });
    }
    const shapedDone = shaped ? [PHASE_CONTOUR] : [PHASE_DEBIT];
    if (r.edges.length > 0)
    {
        const t = decor.edgeThickness === undefined ? "épaisseur non spécifiée" : `ép. ${n1(decor.edgeThickness)}`;
        steps.push({ phase: PHASE_EDGES, title: "Chants", after: shapedDone, why: "Sur le contour définitif",
                     spec: `${decor.edge ?? `Chant assorti ${decor.label}`}, ${t}, sur ${edgeNotation(r.edges)}. Arasé `
                         + `au nu des faces, ${n1(r.length)} x ${n1(wide)} atteint chant compris` });
    }
    const drilled = part.holes.filter((h) => { return h.diameter > 0; });
    const onFaces = drilled.filter((h) => { return h.face === "A" || h.face === "B"; });
    const banded = (e: Edge): boolean => { return r.edges.includes(e); };
    if (onFaces.length > 0)
    {
        // A bore running out over an edge, a flap hinge 10.5 off it, cuts into the band : drilled once it's on
        const runsOut = onFaces.some((h) =>
        {
            const rad = h.diameter / 2;
            return (h.u - rad < 0 && banded("u0")) || (h.u + rad > part.length && banded("u1"))
                || (h.v - rad < 0 && banded("v0")) || (h.v + rad > part.width && banded("v1"));
        });
        steps.push({ phase: PHASE_FACE_DRILL, title: "Perçages de face",
                     after: runsOut ? [...shapedDone, PHASE_EDGES] : shapedDone,
                     why: runsOut ? "Débouchent dans un chant plaqué" : "Cotés depuis le contour",
                     spec: holeLines(onFaces, (h) => { return `face ${h.face}`; }).join(" ; ") });
    }
    const onEdges = drilled.filter((h) => { return h.face !== "A" && h.face !== "B"; });
    if (onEdges.length > 0)
    {
        const throughBand = onEdges.some((h) => { return banded(h.face as Edge); });
        steps.push({ phase: PHASE_EDGE_DRILL, title: "Perçages de chant",
                     after: throughBand && r.edges.length > 0 ? [...shapedDone, PHASE_EDGES] : shapedDone,
                     why: throughBand ? "Traversent le chant plaqué" : "Cotés depuis le contour",
                     spec: holeLines(onEdges, (h) =>
                     {
                         const across = h.w === undefined ? "" : ` à ${n1(h.w)} de la face A`;
                         return `chant ${EDGE_NAME(h.face as Edge)}${across}`;
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
                // u runs along the lenght from l1, v across it from L1, as on the part's drawing
                const where = g.along === "u"   
                    ? `parallèle à la longueur, axe à ${n1(g.at)} de L1, de ${n1(g.from)} à ${n1(g.to)} depuis l1`
                    : `parallèle à la largeur, axe à ${n1(g.at)} de l1, de ${n1(g.from)} à ${n1(g.to)} depuis L1`;
                return `Rainure ${n1(g.width)} x ${n1(g.depth)} face ${g.face}, ${where} (${g.label})`; 
            }),
            ...pockets.map((k) =>
            {
                return `Poche ${n1(k.length)} x ${n1(k.across)} prof. ${n1(k.depth)} `
                    + `dans le chant ${EDGE_NAME(k.edge)}, `
                    + `centrée à ${n1(k.at)} et à ${n1(k.w)} de la face A (${k.label})`;
            }),
        ];
        steps.push({ phase: PHASE_GROOVES, title: "Rainures et poches",
                     after: cuts && r.edges.length > 0 ? [...shapedDone, PHASE_EDGES] : shapedDone,
                     why: cuts ? "Débouchent dans un chant plaqué" : "Cotés depuis le contour",
                     spec: spec.join(" ; ") });
    }
    const machined = steps.filter((s) => { return s.phase > PHASE_DEBIT; }).map((s) => { return s.phase; });
    if (r.decor === "MDF_LAQUE")
    {
        const tint = part.colour === null ? "teinte à définir avec le donneur d'ordre avant fabrication"
            : `teinte ${part.colour}`;
        steps.push({ phase: PHASE_FINISH, title: "Finition", after: machined.length > 0 ? machined : [PHASE_DEBIT],
                     why: "Couvre les usinages", spec: `Laque ${tint}, faces et chants vus` });
    }
    else if (MATERIALS[part.material]?.veneer === true)
    {
        // A real wood veneer leaves the mill raw : varnished after its banding and its machining
        steps.push({ phase: PHASE_FINISH, title: "Finition", after: machined.length > 0 ? machined : [PHASE_DEBIT],
                     why: "Couvre le placage, ses chants et ses usinages",
                     spec: "Vernis incolore mat, deux couches, faces et chants vus, produit au choix de l'atelier" });
    }
    const all = steps.map((s) => { return s.phase; });
    steps.push({ phase: PHASE_CHECK, title: "Contrôle", after: all, why: "Sur la pièce finie",
                 spec: `Cotes ${n1(r.length)} x ${n1(wide)}`
                     + `${extra === 0 ? "" : ` (surlargeur de ${n1(extra)} comprise)`} et `
                     + `positions des usinages : ${TOLERANCE}. ${SQUARENESS}. Aucun éclat de surface`
                     + (r.edges.length > 0 ? " ni décollement de chant" : "") });
    steps.push({ phase: PHASE_MARK, title: "Marquage", after: [PHASE_CHECK], why: "Pièce acceptée",
                 spec: `Étiquette ${r.code} ${r.label} sur un chant non vu ou la face cachée, face A repérée, `
                     + "décor protégé pour le transport" });
    return { code: r.code, items: r.items.join(", "), label: r.label, quantity: r.quantity,
             material: `${r.decorLabel}, ép. ${r.thickness}`, steps };
}


const comma = (x: number, digits: number): string => { return x.toFixed(digits).replace(".", ","); };


// The sheets the nesting ass, counted by board and format
function sheetsToBuy(nesting: NestResult): Supply[]
{
    const counted = new Map<string, { sheet: NestResult["sheets"][number]; count: number }>();
    for (const sheet of nesting.sheets)
    {
        const key = `${sheet.decor}|${sheet.thickness}|${sheet.length}|${sheet.width}`;
        counted.set(key, { sheet, count: (counted.get(key)?.count ?? 0) + 1 });
    }
    const out = [...counted.values()].map(({ sheet, count }): Supply =>
    {
        const decor = decorById(sheet.decor);
        return { kind: "Panneau", brand: decor.brand, ref: decor.ref,
                 label: `${sheet.decorLabel}, ${sheet.length} x ${sheet.width} x ${sheet.thickness}`, qty: String(count),
                 unit: "plaque", note: decor.grain ? "Décor à fil" : "" };
    });
    // What the nesting left out still needs a board, one line a workpiece
    const left = new Map<string, { label: string; reason: string; count: number }>();
    for (const miss of nesting.unplaced)
    {
        left.set(miss.code, { label: miss.label, reason: miss.reason, count: (left.get(miss.code)?.count ?? 0) + 1 });
    }
    for (const [code, miss] of left)
    {
        out.push({ kind: "Panneau", brand: "", ref: "", label: `${code} ${miss.label}`, qty: String(miss.count),
                   unit: "pièce", note: `Hors calepinage, plaque à prévoir : ${miss.reason}` });
    }
    return out;
}


// Bought by the piece : soldi stock and flexible skins, and the glass the glazier cuts, no route of its own
function piecesToBuy(bom: Bom): Supply[]
{
    const line = (row: CutRow, kind: Supply["kind"], note: string): Supply =>
    {
        const decor = decorById(row.decor);
        return { kind, brand: decor.brand, ref: decor.ref,
                 label: `${row.label} : ${row.decorLabel}, ${n1(row.length)} x ${n1(row.width)} x ${row.thickness}`,
                 qty: String(row.quantity), unit: "pièce", note };
    };  
    return [...bom.offSheet.map((row) => { return line(row, "Hors plaque", `Pour ${row.code}`); }),
            ...bom.cut.filter(isGlass).map((row) => { return line(row, "Verre", [`Pour ${row.code}`,
                ...row.notes].join(". ")); })];
}


// The banding by decor and board thickness : a band have to be wider than the board it covers
function bandsToBuy(bom: Bom): Supply[]
{
    const bands = new Map<string, { decor: string; board: number; mm: number }>();
    for (const part of [...bom.cut, ...bom.offSheet].flatMap((row) => { return row.parts; }))
    {
        const key = `${part.decor}|${part.thickness}`;
        const was = bands.get(key) ?? { decor: part.decor, board: part.thickness, mm: 0 };
        bands.set(key, { ...was, mm: was.mm + edgeLengthOf(part) * part.quantity });
    }
    return [...bands.values()].filter((band) => { return band.mm > 0; }).map((band): Supply =>
    {
        const decor = decorById(band.decor);
        const thick = decor.edgeThickness === undefined ? "épaisseur à confirmer" : `ép. ${n1(decor.edgeThickness)}`;
        // The decor gives no maker nor reference of its own banding, its label says it all : the board's would lie
        return { kind: "Chant", brand: "", ref: "",
                 label: `${decor.edge ?? `Chant assorti ${decor.label}`}, pour panneau de ${band.board}`,
                 qty: comma(band.mm / 1000, 1), unit: "m",
                 note: `Largeur supérieure à ${band.board}, ${thick}, surlongueur comprise` };
    });
}


// The lacquer by colour, with the board it covers : one face of each part, its second face and edges on top
function lacquerToBuy(bom: Bom): Supply[]
{
    const byTint = new Map<string, number>();
    for (const part of [...bom.cut, ...bom.offSheet].flatMap((row) => { return row.parts; }))
    {
        if (part.decor !== "MDF_LAQUE")
        {
            continue;
        }
        const tint = part.colour ?? "teinte à définir";
        byTint.set(tint, (byTint.get(tint) ?? 0) + part.length * part.width * 1e-6 * part.quantity);
    }
    return [...byTint].map(([tint, area]): Supply =>
    {
        return { kind: "Laque", brand: "", ref: "", label: `Laque pour MDF, ${tint}`, qty: comma(area, 2),
                 unit: "m² de panneau", note: "Surface d'une face : seconde face et chants vus en plus" };
    });
}


// What is bought ready-made, the hardware cut in the workshop left out
function suppliesOf(bom: Bom, nesting: NestResult): Supply[]
{
    const hardware = bom.hardware.filter((item) => { return !item.made; }).map((item): Supply =>
    {
        return { kind: "Quincaillerie", brand: item.brand, ref: item.ref, label: item.label, qty: String(item.qty),
                 unit: item.unit, note: item.code };
    });
    return [...sheetsToBuy(nesting), ...piecesToBuy(bom), ...bandsToBuy(bom), ...hardware, ...lacquerToBuy(bom),
            ...varnishToBuy(bom)];
}


// The varnish the route of a veneered part prescribes, by the area it covers : the product is the workshop's choice
function varnishToBuy(bom: Bom): Supply[]
{
    let area = 0;
    for (const part of [...bom.cut, ...bom.offSheet].flatMap((row) => { return row.parts; }))
    {
        if (MATERIALS[part.material]?.veneer === true)
        {
            area += part.length * part.width * 1e-6 * part.quantity;
        }
    }
    return area === 0 ? [] : [{ kind: "Vernis", brand: "", ref: "",
                               label: "Vernis incolore mat, produit au choix de l'atelier",
                                qty: comma(area, 2), unit: "m² de panneau",
                                note: "Surface d'une face, deux couches : seconde face et chants vus en plus" }];
}


function isGlass(r: CutRow): boolean
{
    return MATERIALS[decorById(r.decor).material]?.kind === "glass";
}


export function fabrication(bom: Bom, nesting: NestResult): Fabrication
{
    const made = [...bom.cut, ...bom.offSheet].filter((r) => { return !isGlass(r); });
    return { supplies: suppliesOf(bom, nesting), routes: made.map(routeOf) };
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
