// The input of the finite element model of each template (scripts/fem_meuble.py) : one file, its fingerprint
// the one the software works out on the piece (fem_input.ts)

import { mkdirSync, writeFileSync } from "node:fs";
import { TEMPLATES } from "../src/lib/core/templates";
import { analyse } from "../src/lib/core/analysis";
import { femFingerprint, femInput, femText } from "../src/lib/core/fem_input";

const out = process.argv[2] ?? "fem";
mkdirSync(out, { recursive: true });
for (const template of TEMPLATES)
{
    const project = template.make();
    const job = template.id === "tv" ? "tv" : "dresser";
    const input = femInput(project, analyse(project).build);
    writeFileSync(`${out}/${job}_entree.json`, femText(input));
    console.log(`${template.id} : ${out}/${job}_entree.json, empreinte ${femFingerprint(input)}`);
}
