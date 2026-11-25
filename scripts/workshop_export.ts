// Writes the workshop package of the 2 pieces to disk, the zip of the site unpacked : npm run atelier -- <folder>

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { unzipSync } from "fflate";
import { computeOutputs } from "../src/lib/core/outputs";
import { TEMPLATES } from "../src/lib/core/templates";
import { workshopArchive } from "../src/lib/core/io/workshop";
import { fabrication } from "../src/lib/core/io/fabrication";
import { costCsv } from "../src/lib/core/costing";
import { slug } from "../src/lib/core/text";

const SENT = ["tv", "dresser"];
const out = process.argv[2];
if (out === undefined)
{
    console.error("Dossier de sortie manquant : npm run atelier -- <dossier>");
    process.exit(2);
}

// Records of a semicolon CSV, a quoted cell may hold a line break
function csvRecords(text: string): number
{
    let n = 0;
    let quoted = false;
    let any = false;
    for (let i = 0; i < text.length; i++)
    {
        const c = text[i]!;
        if (c === '"')
        {
            quoted = !quoted;
        }
        else if (!quoted && (c === "\n"))
        {
            n++;
            any = false;
            continue;
        }
        any = true;
    }
    return any ? n + 1 : n;
}

const failures: string[] = [];
const fail = (what: string): void =>
{
    failures.push(what);
};

for (const id of SENT)
{
    const t = TEMPLATES.find((x) => { return x.id === id; });
    if (t === undefined)
    {
        fail(`${id} : modèle introuvable dans TEMPLATES`);
        continue;
    }
    const p = t.make();
    const o = computeOutputs(p);
    const base = slug(p.name) || "projet";
    const files: Record<string, Uint8Array> = unzipSync(workshopArchive(p, o));
    files[`${base}_chiffrage.csv`] = new TextEncoder().encode(costCsv(o.cost));

    const dir = `${out}/${id}`;
    for (const [name, bytes] of Object.entries(files))
    {
        const path = `${dir}/${name}`;
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
    }

    // Each table and the records its CSV must hold, header and the blank and total rows of the costing included
    const rows = [...o.bom.cut, ...o.bom.offSheet];
    const fab = fabrication(o.bom, o.nesting);
    const steps = fab.routes.reduce((s, r) => { return s + r.steps.length; }, 0);
    const expected: Record<string, number> = {
        [`${base}_fiche_de_debit.csv`]: 1 + rows.length,
        [`${base}_quincaillerie.csv`]: 1 + o.bom.hardware.length,
        [`${base}_approvisionnement.csv`]: 1 + fab.supplies.length,
        [`${base}_gamme_de_fabrication.csv`]: 1 + steps,
        [`${base}_chiffrage.csv`]: 1 + o.cost.lines.length + 3 + o.cost.notes.length,
    };
    const others = [`${base}_plans.pdf`, `${base}_pbs_free-pbs.json`];
    for (const name of [...Object.keys(expected), ...others])
    {
        const path = `${dir}/${name}`;
        let size = 0;
        try
        {
            size = statSync(path).size;
        }
        catch
        {
            fail(`${path} : absent`);
            continue;
        }
        if (size === 0)
        {
            fail(`${path} : vide`);
        }
    }
    for (const [name, want] of Object.entries(expected))
    {
        const got = csvRecords(readFileSync(`${dir}/${name}`, "utf8"));
        console.log(`${id} : ${name} ${got} lignes, table ${want}`);
        if (got !== want)
        {
            fail(`${dir}/${name} : ${got} lignes pour ${want} attendues`);
        }
    }

    const pdf = readFileSync(`${dir}/${base}_plans.pdf`, "latin1");
    if (!pdf.startsWith("%PDF") || !pdf.trimEnd().endsWith("%%EOF"))
    {
        fail(`${dir}/${base}_plans.pdf : en-tête %PDF ou fin %%EOF absents`);
    }
    JSON.parse(readFileSync(`${dir}/${base}_pbs_free-pbs.json`, "utf8"));

    const dxfs = Object.keys(files).filter((k) => { return k.startsWith("dxf/"); });
    console.log(`${id} : ${dxfs.length} DXF, ${rows.length} lignes de débit (${o.bom.cut.length} + ${o.bom.offSheet.length})`);
    if (dxfs.length !== rows.length)
    {
        fail(`${id} : ${dxfs.length} DXF pour ${rows.length} lignes de débit, deux pièces partagent un nom de fichier ?`);
    }
    let sound = 0;
    for (const name of dxfs)
    {
        const path = `${dir}/${name}`;
        const lines = readFileSync(path, "latin1").split(/\r?\n/).map((l) => { return l.trim(); });
        const missing = ["SECTION", "ENTITIES", "EOF"].filter((w) => { return !lines.includes(w); });
        if (statSync(path).size === 0 || missing.length > 0)
        {
            fail(`${path} : vide ou sans ${missing.join(", ")}`);
        }
        else
        {
            sound++;
        }
    }
    console.log(`${id} : ${sound}/${dxfs.length} DXF avec SECTION, ENTITIES et EOF`);
}

if (failures.length > 0)
{
    console.error(`Export atelier en échec (${failures.length}) :\n${failures.join("\n")}`);
    process.exit(1);
}
console.log(`Export atelier : ${out}`);
