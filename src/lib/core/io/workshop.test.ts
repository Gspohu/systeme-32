import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { writeFileSync, mkdirSync } from "node:fs";
import { workshopArchive } from "./workshop";
import { computeOutputs } from "../outputs";
import { dresser, tvWall } from "../templates";


// every xref entry must piont at the "n 0 obj" line it announces, byte for byte
function checkXref(pdf: Uint8Array): void
{
    const text = strFromU8(pdf, true);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const rows = text.slice(start).split("\n").slice(3);
    let n = 1;
    for (const row of rows)
    {
        const m = /^(\d{10}) 00000 n $/.exec(row);
        if (m === null)
        {
            break;
        }
        const off = Number(m[1]);
        expect(text.slice(off, off + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
        n++;
    }
    expect(n).toBeGreaterThan(5);
}

function entry(names: string[], suffix: string): string
{
    for (const n of names)
    {
        if (n.endsWith(suffix))
        {
            return n;
        }
    }
    throw new Error(`Aucun fichier en ${suffix} dans le dossier d'atelier`);
}


describe("workshop archive", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`builds a consistent package for ${make.name}`, () =>
        {
            const p = make();
            const o = computeOutputs(p);
            const zip = unzipSync(workshopArchive(p, o)); 
            const names = Object.keys(zip);
            const pdf = zip[entry(names, "_plans.pdf")]!;
            expect(strFromU8(pdf.slice(0, 8), true)).toBe("%PDF-1.4");
            checkXref(pdf);
            const dxfs: string[] = [];
            for (const n of names)
            {
                if (n.startsWith("dxf/"))
                {
                    dxfs.push(n);
                }
            }
            expect(dxfs.length).toBe(o.bom.cut.length + o.bom.offSheet.length);
            for (const d of dxfs)
            {
                const t = strFromU8(zip[d]!, true);
                expect(t.startsWith("0\nSECTION")).toBe(true);
                expect(t.trimEnd().endsWith("0\nEOF")).toBe(true);
            }
            // TextDecoder drops a leading byte order mark : the raw UTF-8 bytes are wat holds it
            const csv = zip[entry(names, "_fiche_de_debit.csv")]!;
            expect([...csv.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
            const pbs = JSON.parse(strFromU8(zip[entry(names, ".json")]!));
            expect(pbs.root.code).toBe("#000-000");
            if (process.env.S32_DUMP !== undefined)
            {
                mkdirSync(process.env.S32_DUMP, { recursive: true });
                writeFileSync(`${process.env.S32_DUMP}/${make.name}.pdf`, pdf);
                writeFileSync(`${process.env.S32_DUMP}/${make.name}_${dxfs[0]!.slice(4)}`, zip[dxfs[0]!]!);
            }
        });
    }
});
