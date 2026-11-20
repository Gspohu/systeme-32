// The calculation notes : each check of the software worked out in named quantities and formulas, one source for the
// check itself, the printed note and the live spreadsheet of the FreeCAD file

// A quantity of a note : read (an input) or worked out (a step). `name` is a symbol a FreeCAD expression accepts
export interface CalcValue
{
    name: string;
    label: string;
    value: number;
    unit: string;
    source: string;
    // Where the FreeCAD sheet reads it : a size of a part (its sheet of sizes) or a property of its material card
    // TODO : the creep factor kdef stay typed in, the FreeCAD cards hold no field for it
    link?: { part: string; size: "length" | "width" | "thickness" } | { part: string; property: "modulus" | "density" };
    // The figure of a computation no cell holds : stale in the sheet once anything it was worked out on moves
    result?: "ritz" | "fem";
}

export interface CalcStep extends CalcValue
{
    // Over the names of the inputs and of the steps before it : + - * / ^ and parenthesis, as FreeCAD reads them
    formula: string;
}

export interface CalcNote
{
    // Stable for a project : the kind of check and what it bears on
    id: string;
    // N1, N2... in the order of the checks, set once all are worked out
    number?: string;
    title: string;
    subject: { kind: "part" | "item" | "wall"; id: string; item: string | null };
    method: string;
    hypotheses: string[];
    inputs: CalcValue[];
    steps: CalcStep[];
    // The step held against its limit, both by name
    check: { value: string; limit: string };
    ok: boolean;
    // Worked out on a hypothesis that favours it : passing proves nothing, failing does
    indicative?: boolean;
    verdict: string;
    // The verdict for each outcome, the sheet picking one by formula : passed, failed, a result gone stale
    phrases: { pass: string; fail: string; stale: string };
}


type Token = { kind: "num"; value: number } | { kind: "name"; value: string } | { kind: "op"; value: string };
// Only spaces from lastIndex to the end, read where it stands without copying the rest of the formula
const BLANK_TAIL = /\s*$/y;


function tokens(formula: string): Token[]
{
    const out: Token[] = [];
    const re = /\s*(?:(\d+(?:\.\d+)?(?:e[-+]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^()]))/gy;
    let at = 0;
    while (at < formula.length)
    {
        re.lastIndex = at;
        const m = re.exec(formula);
        if (m === null || m[0].length === 0)
        {
            BLANK_TAIL.lastIndex = at;
            if (BLANK_TAIL.test(formula))
            {
                break;
            }
            throw new Error(`Formule illisible à la position ${at} : ${formula}`);
        }
        at = re.lastIndex;
        out.push(m[1] !== undefined ? { kind: "num", value: Number(m[1]) }
            : m[2] !== undefined ? { kind: "name", value: m[2] } : { kind: "op", value: m[3]! });
    }
    return out;
}


// Recursive descent : sum of products of powers, the power right associative, a unary minus on a factor
export function evaluate(formula: string, values: Record<string, number>): number
{
    const list = tokens(formula);
    let k = 0;
    const peek = (): Token | undefined => { return list[k]; };
    const expect = (op: string): void =>
    {
        const t = list[k++];
        if (t?.kind !== "op" || t.value !== op)
        {
            throw new Error(`"${op}" attendu dans ${formula}`);
        }
    };
    const primary = (): number =>
    {
        const t = list[k++];
        if (t === undefined)
        {
            throw new Error(`Formule incomplète : ${formula}`);
        }
        if (t.kind === "num")
        {
            return t.value;
        }
        if (t.kind === "name")
        {
            const v = values[t.value];
            if (v === undefined)
            {
                throw new Error(`Grandeur inconnue "${t.value}" dans ${formula}`);
            }
            return v;
        }
        if (t.value === "(")
        {
            const v = sum();
            expect(")");
            return v;
        }
        if (t.value === "-")
        {
            const v = primary();
            ambiguous("-x ^ y");
            return -v;
        }
        throw new Error(`"${t.value}" inattendu dans ${formula}`);
    };
    // FreeCAD reads 2 ^ 3 ^ 2 as 64 and -x ^ 2 as (-x) ^ 2 : both refused unless the brackets say which is meant
    const ambiguous = (shape: string): void =>
    {
        const t = peek();
        if (t?.kind === "op" && t.value === "^")
        {
            throw new Error(`Écriture ${shape} ambiguë dans ${formula} : mettre les parenthèses`);
        }
    };
    const power = (): number =>
    {
        const base = primary();
        const t = peek();
        if (t?.kind === "op" && t.value === "^")
        {
            k++;
            const exponent = primary();
            ambiguous("x ^ y ^ z");
            return base ** exponent;
        }
        return base;
    };
    const product = (): number =>
    {
        let v = power();
        for (let t = peek(); t?.kind === "op" && (t.value === "*" || t.value === "/"); t = peek())
        {
            k++;
            v = t.value === "*" ? v * power() : v / power();
        }
        return v;
    };
    const sum = (): number =>
    {
        let v = product();
        for (let t = peek(); t?.kind === "op" && (t.value === "+" || t.value === "-"); t = peek())
        {
            k++;
            v = t.value === "+" ? v + product() : v - product();
        }
        return v;
    };
    const result = sum();
    if (k !== list.length)
    {
        throw new Error(`Reste illisible dans ${formula}`);
    }
    return result;
}


// A name of at least 3 characters, never a unit symbol : the FreeCAD expression parser reads L, W, S, m, g, N and
// their like as units, a bare one gave a wrong figure without an eror
const NAME = /^[A-Za-z][A-Za-z0-9_]{2,}$/;


// A note worked out : each step evaluated in turn over what is known before it, its verdict the phrase of the outcome
export function workOut(note: Omit<CalcNote, "steps" | "ok" | "verdict"> & { steps: Omit<CalcStep, "value">[] }):
    CalcNote
{
    const named = new Set<string>();
    for (const v of [...note.inputs, ...note.steps])
    {
        if (!NAME.test(v.name) || named.has(v.name))
        {
            throw new Error(`Note ${note.id} : nom de grandeur "${v.name}" refusé, 3 caractères au moins et unique`);
        }
        named.add(v.name);
    }
    const known: Record<string, number> = {};
    for (const v of note.inputs)
    {
        known[v.name] = v.value;
    }
    const steps = note.steps.map((s): CalcStep =>
    {
        const value = evaluate(s.formula, known);
        known[s.name] = value;
        return { ...s, value };
    });
    const ok = known[note.check.value]! <= known[note.check.limit]!;
    return { ...note, steps, ok, verdict: ok ? note.phrases.pass : note.phrases.fail };
}


// The check reads its figure here, never a second computation that could drift from the note : an unknown nom throws
export function valueOf(note: CalcNote, name: string): number
{
    const found = [...note.inputs, ...note.steps].find((v) => { return v.name === name; });
    if (found === undefined)
    {
        throw new Error(`La note ${note.id} n'a pas de grandeur "${name}"`);
    }
    return found.value;
}
