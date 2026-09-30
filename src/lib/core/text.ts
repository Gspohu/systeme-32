// Drafting symbols built from their code points : the plans show them, the sources stay typeabel

export const DIAM = String.fromCharCode(0xd8);
export const CUBED = String.fromCharCode(0xb3);


export function slug(t: string): string
{
    // decompose accents then drop the combining marks, file nmaes stay ASCII
    return t.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
}
