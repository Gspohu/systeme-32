// Text helpers of the plans and file names, the drafting symbols living with the catalogues in data

export { CUBED, DIAM } from "../data/glyphs";


export function slug(t: string): string
{
    // decompose accents then drop the combining marks, file nmaes stay ASCII
    return t.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
}
