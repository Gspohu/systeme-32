// Writes the CAD data of the two pieces, the FreeCAD build then reads it : npm run cad

import { mkdirSync, writeFileSync } from "node:fs";
import { computeOutputs } from "../src/lib/core/outputs";
import { TEMPLATES } from "../src/lib/core/templates";
import { cadModel } from "../src/lib/core/io/cad_model";

const SENT = ["tv", "dresser"];
const out = process.argv[2] ?? "cad";
mkdirSync(out, { recursive: true });
for (const t of TEMPLATES)
{
    if (SENT.includes(t.id))
    {
        const p = t.make();
        // The assembly sequence of the TV wall only, the dresser still under review
        writeFileSync(`${out}/${t.id}.json`, JSON.stringify(cadModel(p, computeOutputs(p), t.id === "tv")));
        console.log(`${t.id} : ${out}/${t.id}.json`);
    }
}
