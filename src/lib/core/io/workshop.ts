// Workshop package : PDF drawing set, cut lis and hardware CSV, Free-pbs JSON and one DXF per workpiece

import { strToU8, zipSync } from "fflate";
import type { Project } from "../model";
import { cutListCsv, hardwareCsv, pbsJson } from "../bom";
import type { Outputs } from "../outputs";
import { slug } from "../text";
import { buildSheets } from "../drawing/sheets";
import { pagesToPdf } from "../drawing/pdf";
import { dxfBytes, partToDxf } from "../drawing/dxf";
import type { Page } from "../drawing/display";


export function drawingSet(p: Project, o: Outputs): Page[]
{
    return buildSheets(p, o.analysis, o.bom, o.nesting);
}


export function workshopArchive(p: Project, o: Outputs): Uint8Array
{
    const base = slug(p.name) || "projet";
    const pages = drawingSet(p, o);
    const files: Record<string, Uint8Array> = {
        [`${base}_plans.pdf`]: pagesToPdf(pages, p.name),
        [`${base}_fiche_de_debit.csv`]: strToU8(cutListCsv(o.bom)),
        [`${base}_quincaillerie.csv`]: strToU8(hardwareCsv(o.bom)),
        [`${base}_pbs_free-pbs.json`]: strToU8(pbsJson(p, o.bom)),  
    };
    for (const row of [...o.bom.cut, ...o.bom.offSheet])
    {
        const first = row.parts[0]!;
        const code = row.code.split(",")[0]!.replace("#", "");
        files[`dxf/${code}_${slug(row.label)}.dxf`] = dxfBytes(partToDxf(first, row.code.split(",")[0]!));
    }
    return zipSync(files, { level: 6 });
}
