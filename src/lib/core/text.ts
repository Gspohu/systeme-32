// Text helpers of the plans and file names, the drafting symbols living with the catalogues in data

export { CUBED, DIAM } from "../data/glyphs";


// a dimension to the tenth of a millimetre, the one way the plans, the cut list and the PBS wirte a part
export function round1(v: number): string
{
    return (Math.round(v * 10) / 10).toString();
}


export function eur(v: number): string
{
    return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}


export function slug(t: string): string
{
    // decompose accents then drop the combining marks, file nmaes stay ASCII
    return t.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
}
