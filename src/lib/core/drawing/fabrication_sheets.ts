// The sheets of the manufacturing route : what to buy, then the phases of each part without naming a machine

import type { Fabrication } from "../io/fabrication";
import { SQUARENESS, TOLERANCE } from "../io/fabrication";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H } from "./display";
import { heading, pageSuffix, paginateTable, table, type Draft } from "./draft";


const TOP = MARGIN + 22;
const BOTTOM = A3.h - MARGIN - TITLE_BLOCK_H - 6;


function paged(title: string, intro: string[], header: string[], cols: number[], rows: string[][]): Draft[]
{
    const pages = paginateTable(rows, cols, 2.2, 4, BOTTOM - TOP);
    return pages.map((chunk, i) =>
    {
        const canvas = new Canvas();
        heading(canvas, `${title}${pageSuffix(i, pages.length)}`);
        intro.forEach((line, k) => { canvas.text(MARGIN + 5, MARGIN + 14 + 4 * k, line, 2.3); });
        table(canvas, MARGIN + 5, TOP, cols, header, chunk);
        return { title, scale: "-", canvas };
    });
}


export function fabricationSheets(f: Fabrication): Draft[]
{
    const supplies = f.supplies.map((s) => { return [s.kind, s.brand, s.ref, s.label, s.qty, s.unit, s.note]; });
    const buy = paged("Approvisionnement", [
        "Matière et articles du commerce à commander avant fabrication. Plaques : nombre estimé par notre calepinage "
            + "(trait de scie et affranchissement de la conception), à revoir selon vos moyens.",
    ], ["Type", "Marque", "Référence", "Désignation", "Qté", "Unité", "Remarque"], [26, 30, 34, 150, 14, 16,
        118], supplies);
    const rows: string[][] = [];
    for (const r of f.routes)
    {
        r.steps.forEach((s, k) =>
        {
            const first = k === 0;
            rows.push([first ? r.code : "", first ? r.label : "", first ? String(r.quantity) : "",
                       first ? r.material : "",
                       String(s.phase), s.title, s.spec, s.after.length === 0 ? "-" : s.after.join(", ")]);
        });
    }
    const route = paged("Gamme de fabrication", [
        "Résultat à obtenir par pièce, quels que soient les moyens. Seule contrainte d'ordre : la colonne Après, "
            + "antériorités physiques. Positions des usinages : plan de chaque pièce et DXF.",
        `Tolérances générales ${TOLERANCE}. ${SQUARENESS}. `
            + "Diamètre \"-\" au plan : position de vis sans avant-trou, non usinée.",
    ], ["Code", "Pièce", "Qté", "Matière", "Ph.", "Opération", "Spécification", "Après"],
        [20, 48, 10, 46, 10, 28, 210, 16], rows);
    return [...buy, ...route];
}
