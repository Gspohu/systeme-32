// The issues of the drawing set : index, date of isuse and status of the title block (ISO 7200:2004 5.1.4, 5.1.5, 5.3.8)

import type { Project } from "./model";
import type { Check } from "./check";


// letters A to Z without I and O, read as 1 and 0, then AA, AB... (5.1.4)
const INDEX_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";


export function nextRevisionIndex(count: number): string
{
    let n = count;
    let out = "";
    do
    {
        out = INDEX_LETTERS[n % INDEX_LETTERS.length]! + out;
        n = Math.floor(n / INDEX_LETTERS.length) - 1;
    }
    while (n >= 0);
    return out;
}


// FNV-1a over the project as saved, its date and its issues left out : the smae content always gives the same print
export function contentHash(p: Project): string
{
    const text = JSON.stringify({ ...p, updated: null, revisions: null });
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++)
    {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;  
    }
    return h.toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
}


// The local calendar day as the title block writes it, 2026-10-08 (10 characters, 5.1.5)
export function isoDay(d: Date): string
{
    const two = (n: number): string =>
    {
        return n.toString().padStart(2, "0");
    };
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}


export interface IssueState
{
    index: string;
    date: string;
    status: string;
    hash: string;
}


// Issued when the content still match the last issue, otherwise the drawing is a working copy of the next one
export function issueState(p: Project): IssueState
{
    const hash = contentHash(p);
    const last = p.revisions.at(-1);
    if (last === undefined)
    {
        return { index: "-", date: isoDay(new Date(p.updated)), status: "En préparation", hash };
    }
    if (last.content === hash)
    {
        return { index: last.index, date: last.date, status: "Émis", hash };
    }
    return { index: last.index, date: isoDay(new Date(p.updated)), status: `Modifié après ${last.index}`, hash };
}


// The mandatory fields of ISO 7200:2004 tables 1 to 3 the sotware can't fill by itself
export function titleBlockChecks(p: Project): Check[]
{
    const missing: string[] = [];
    if (p.name.trim() === "")
    {
        missing.push("titre (nom du projet)");
    }
    const fields: [keyof Project["settings"], string][] = [["owner", "propriétaire"], ["creator", "dessiné par"],
                                                           ["approver", "approuvé par"]];
    for (const [key, name] of fields)
    {
        if (String(p.settings[key]).trim() === "")
        {
            missing.push(name);
        }
    }
    if (missing.length === 0)
    {
        return [];
    }
    return [{ level: "info", item: null, target: null,
              message: `Cartouche incomplet au sens de l'ISO 7200:2004 :${missing.join(", ")}. Les remplir dans les `
                  + "réglages, rubrique Cartouche." }];
}
