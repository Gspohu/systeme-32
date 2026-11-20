// Sheets of the set Martial reads the figures from : each note with its inputs, its formulas and its verdict, the
// very ones the checks worked out, one tableau with the check

import type { CalcNote } from "../calc_notes";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H } from "./display";
import { heading, pageSuffix, paginateTable, table, type Draft } from "./draft";

const TABLE_TOP = MARGIN + 18;
const TABLE_BOTTOM = A3.h - MARGIN - TITLE_BLOCK_H - 6;
const COLUMNS = [14, 26, 74, 112, 26, 18, 122];
const HEADER = ["Note", "Symbole", "Grandeur", "Formule", "Valeur", "Unité", "Source"];


// 4 significant figures, a decimal comma, a power of ten past what a cell reads at a glance
export function figure(value: number): string
{
    if (!Number.isFinite(value))
    {
        return "-";
    }
    if (value === 0)
    {
        return "0";
    }
    const power = Math.floor(Math.log10(Math.abs(value)));
    if (power >= 6 || power <= -4)
    {
        const mantissa = value / 10 ** power;
        return `${mantissa.toFixed(3).replace(".", ",")}e${power}`;
    }
    return Number(value.toPrecision(4)).toString().replace(".", ",");
}


export function calcNoteSheets(notes: CalcNote[]): Draft[]
{
    if (notes.length === 0)
    {
        return [];
    }
    const rows: string[][] = [];
    for (const note of notes)
    {
        rows.push([note.number ?? "", "", note.title, note.method, "", "", ""]);
        rows.push(["", "", "Hypothèses", note.hypotheses.join(". "), "", "", ""]);
        for (const v of note.inputs)
        {
            rows.push(["", v.name, v.label, "donnée", figure(v.value), v.unit, v.source]);
        }
        for (const s of note.steps)
        {
            rows.push(["", s.name, s.label, s.formula, figure(s.value), s.unit, s.source]);
        }
        rows.push(["", "", "Verdict", `${note.check.value} <= ${note.check.limit}`,
                   note.ok ? (note.indicative === true ? "oui, indicatif" : "oui") : "non", "",
                   note.verdict]);
    }
    const pages = paginateTable(rows, COLUMNS, 2.2, 4, TABLE_BOTTOM - TABLE_TOP);
    return pages.map((chunk, i): Draft =>
    {
        const canvas = new Canvas();
        heading(canvas, `Notes de calcul${pageSuffix(i, pages.length)}`);
        table(canvas, MARGIN + 5, TABLE_TOP, COLUMNS, HEADER, chunk);
        return { title: "Notes de calcul", scale: "-", canvas };
    });
}
