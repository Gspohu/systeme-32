// Photos of decor samples imported by the user : format read from the bytes, size ceiling, archive names

import type { Project } from "./model";

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
// a photo taken of a whole door covers about this much, the user corrects it for a small sample
export const PHOTO_DEFAULT_TILE = 600;
// archiv names are made here, a loaded flie naming anything else is refused
export const PHOTO_FILE_RE = /^[A-Za-z0-9_-]{1,64}\.(?:png|jpg|webp)$/;


export type PhotoKind = "png" | "jpg" | "webp";


export class PhotoError extends Error   
{
}


function startsWith(b: Uint8Array, sig: number[], at = 0): boolean
{
    let k = 0;
    while (k < sig.length)
    {
        if (b[at + k] !== sig[k])
        {
            return false;
        }
        k++;
    }
    return true;
}


// The signature in the first bytes, never the extension the file claims
export function photoKind(b: Uint8Array): PhotoKind | null
{
    if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    {
        return "png";
    }
    if (startsWith(b, [0xff, 0xd8, 0xff]))
    {
        return "jpg";
    }
    // RIFF, four bytes of size, then WEBP
    if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8))
    {
        return "webp";
    }
    return null;
}


export function checkPhoto(b: Uint8Array): PhotoKind
{
    if (b.length > PHOTO_MAX_BYTES)
    {
        const mb = (b.length / 1024 / 1024).toFixed(1).replace(".", ",");
        throw new PhotoError(`Photo de ${mb} Mo, 8 Mo maxi. La réduire avant de l'importer.`);
    }
    const kind = photoKind(b);
    if (kind === null)
    {
        throw new PhotoError("Image non reconnue. Importer une photo PNG, JPEG ou WebP.");
    }
    return kind;
}


export function photoFile(decor: string, kind: PhotoKind): string
{
    return `${decor.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64)}.${kind}`;
}


export function photoMime(file: string): string
{
    if (file.endsWith(".png"))
    {
        return "image/png";
    }
    return file.endsWith(".webp") ? "image/webp" : "image/jpeg";
}


// Only the photos a decor still points at leave with the project, a removed one is not carried along
export function usedPhotos(p: Project, all: Map<string, Uint8Array>): Map<string, Uint8Array>
{
    const kept = new Map<string, Uint8Array>();
    for (const t of Object.values(p.textures))
    {
        const bytes = all.get(t.file);
        if (bytes !== undefined)
        {
            kept.set(t.file, bytes);
        }
    }
    return kept;
}
