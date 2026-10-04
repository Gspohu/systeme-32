// Project archive : project.json plus the user textures, zipped, with schema checks and migrations

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { DEFAULT_ROOM, DEFAULT_SETTINGS, SCHEMA_VERSION, type Project } from "../model";
import { PHOTO_DEFAULT_TILE, PHOTO_FILE_RE, photoKind, usedPhotos } from "../photos";


export interface ProjectArchive
{
    project: Project;
    textures: Map<string, Uint8Array>;
}

export class ProjectFileError extends Error
{
}


function need(cond: boolean, msg: string): void
{
    if (!cond)  
    {
        throw new ProjectFileError(`Fichier projet invalide : ${msg}. Ouvrir un fichier enregistré par systeme-32.`);
    }
}


// Version 2 gives every divider its own finish and version 5 its own thickness, an older tree has none
function givePerDivider(node: unknown, key: "finishes" | "thicknesses"): void
{
    const n = node as { kind?: unknown; cuts?: unknown[]; children?: unknown[] } & Record<string, unknown>;
    if (typeof node !== "object" || node === null || n.kind !== "split")
    {
        return;
    }
    if (!Array.isArray(n[key]))
    {
        n[key] = new Array((n.cuts ?? []).length).fill(null);
    }
    for (const child of n.children ?? [])
    {
        givePerDivider(child, key);
    }
}


// Upgrades older schemas step by step, version 1 is the first published one
export function migrate(raw: Record<string, unknown>): Record<string, unknown>
{
    const version = typeof raw.schema === "number" ? raw.schema : 0;
    need(version >= 1, "numéro de schéma absent");
    need(version <= SCHEMA_VERSION,
         `schéma ${version} plus récent que ce logiciel (${SCHEMA_VERSION}), mettre systeme-32 à jour`);
    if (version < 2)
    {
        toVersion2(raw);
    }
    if (version < 4)
    {
        toVersion4(raw);
    }
    if (version < 5)
    {
        toVersion5(raw);
    }
    if (version < 6)
    {
        // socket and cable holes came with version 6
        emptyListOnCarcasses(raw, "outlets");
    }
    if (version < 7)
    {
        // pictures printed on the back of a cell acme with version 7
        emptyListOnCarcasses(raw, "prints");
    }
    raw.schema = SCHEMA_VERSION;
    return raw;
}


function toVersion2(raw: Record<string, unknown>): void
{
    if (typeof raw.settings === "object" && raw.settings !== null)
    {
        // versin 2 added the wall type : a setting the file lacks takes its default
        raw.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
    }
    if (typeof raw.textures === "object" && raw.textures !== null)
    {
        // version 1 kept a bare file name per decor, version 2 adds the width the photo covers
        const moved: Record<string, unknown> = {};
        for (const [decor, t] of Object.entries(raw.textures))
        {
            moved[decor] = typeof t === "string" ? { file: t, tileMm: PHOTO_DEFAULT_TILE } : t;
        }
        raw.textures = moved;
    }
    if (!Array.isArray(raw.items))
    {
        return;
    }
    // version 1 carried an unused clearance on hung carcasses, their y position already says it
    for (const it of raw.items as { kind?: unknown; seat?: unknown; base?: { type?: unknown; clearance?: unknown } }[])
    {
        if (it.base?.type === "wall")
        {
            delete it.base.clearance;
        }
        // version 2 also knows seats, a version 1 carcass never was one
        if (it.kind === "carcass" && it.seat === undefined)
        {
            it.seat = null;
        }
        if (it.kind === "carcass" && (it as { slope?: unknown }).slope === undefined)
        {
            (it as { slope?: unknown }).slope = null;
        }
        if (it.kind === "carcass")
        {
            const k = it as { rails?: unknown; lights?: unknown };
            k.rails = k.rails ?? [];
            k.lights = k.lights ?? [];
            givePerDivider((it as { root?: unknown }).root, "finishes");
            for (const l of ((it as { linings?: { colour?: unknown }[] }).linings ?? []))
            {
                l.colour = l.colour ?? null;
            }
        }
    }
}


// versions 3 and 4 grew on the same day and a file saved in between lacks part of it : one step
// filling only the missing defaults serves both
function toVersion4(raw: Record<string, unknown>): void
{
    if (typeof raw.settings !== "object" || raw.settings === null)
    {
        return;
    }
    // round spots came next to the LED profile, every older light was a profile
    raw.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
    // it also knows the side walls and the room, every older item stood against the back wall
    raw.room = raw.room ?? { ...DEFAULT_ROOM };
    for (const it of (Array.isArray(raw.items) ? raw.items : []) as { kind?: unknown; lights?: unknown;
        wall?: unknown; ceilingFiller?: unknown; purpose?: unknown; corners?: unknown }[])
    {
        it.wall = it.wall ?? "back";
        if (it.kind === "carcass")
        {
            it.ceilingFiller = it.ceilingFiller ?? false;
            const k = it as { shoeRacks?: unknown };
            k.shoeRacks = k.shoeRacks ?? [];
            for (const r of (Array.isArray((it as { rails?: unknown }).rails)
                ? (it as { rails: { kind?: unknown }[] }).rails : []))
            {
                r.kind = r.kind ?? "fixed";
            }
        }
        if (it.kind === "wallShelf")
        {
            it.purpose = it.purpose ?? "shelf";
            it.corners = it.corners ?? { left: 0, right: 0 };
        }
        for (const l of (it.kind === "carcass" && Array.isArray(it.lights) ? it.lights : []) as
            { kind?: unknown; spots?: unknown }[])
        {
            l.kind = l.kind ?? "strip";
            l.spots = l.spots ?? 0;
        }
    }
}


// shelves took the thickness of the sides until version 5, and no cell was drilled for later shelves
function toVersion5(raw: Record<string, unknown>): void
{
    for (const it of (Array.isArray(raw.items) ? raw.items : []) as { kind?: unknown; shelfThickness?: unknown;
        root?: unknown; modularCells?: unknown }[])
    {
        if (it.kind === "carcass")
        {
            it.shelfThickness = it.shelfThickness ?? null;
            it.modularCells = it.modularCells ?? [];
            givePerDivider(it.root, "thicknesses");
        }
    }
}


function emptyListOnCarcasses(raw: Record<string, unknown>, key: "outlets" | "prints"): void
{
    for (const it of (Array.isArray(raw.items) ? raw.items : []) as ({ kind?: unknown } & Record<string, unknown>)[])
    {
        if (it.kind === "carcass")
        {
            it[key] = it[key] ?? [];
        }
    }
}


// TODO only the top of each item is checked, a damaged layout tree inside a carcass passes until the analysis meets it
export function validateProject(raw: unknown): Project
{
    need(typeof raw === "object" && raw !== null, "contenu JSON attendu");
    const migrated = migrate(raw as Record<string, unknown>);
    need(typeof migrated.id === "string" && typeof migrated.name === "string", "identifiant ou nom manquant");
    need(typeof migrated.settings === "object" && migrated.settings !== null, "réglages manquants");
    need(Array.isArray(migrated.items), "liste des meubles manquante");
    need(typeof migrated.textures === "object" && migrated.textures !== null, "liste des photos manquante");
    const room = migrated.room as Record<string, unknown> | null;
    for (const k of ["width", "depth", "height"])
    {
        need(typeof room === "object" && room !== null && typeof room[k] === "number" && Number.isFinite(room[k])
             && (room[k] as number) > 0, `pièce avec ${k} absent ou non positif`);
    }
    const returns = room?.returns as Record<string, unknown> | undefined;
    need(returns === undefined || (typeof returns === "object" && returns !== null && ["left", "right"].every((k) =>
    {
        return typeof returns[k] === "number" && Number.isFinite(returns[k]) && (returns[k] as number) > 0;
    })), "retours de la niche mal décrits");
    for (const t of Object.values(migrated.textures as Record<string, unknown>))
    {
        const photo = t as { file?: unknown; tileMm?: unknown };
        need(typeof photo === "object" && photo !== null && typeof photo.file === "string"
             && PHOTO_FILE_RE.test(photo.file) && typeof photo.tileMm === "number"
             && Number.isFinite(photo.tileMm) && photo.tileMm > 0, "photo de décor mal décrite");
    }
    for (const it of migrated.items as unknown[])
    {
        need(typeof it === "object" && it !== null && typeof (it as { kind?: unknown }).kind === "string",
             "meuble sans type");
        const kind = (it as { kind: string }).kind;
        need(["carcass", "corner", "wallShelf", "box", "slats", "ladder", "device"].includes(kind),
             `type de meuble inconnu : ${kind}`);
        if (kind === "device")
        {
            const d = it as Record<string, unknown>;
            for (const k of ["width", "height", "depth", "massKg", "x", "y", "z"])
            {
                need(typeof d[k] === "number" && Number.isFinite(d[k] as number), `appareil avec ${k} non numérique`);
            }
            need((d.width as number) > 0 && (d.height as number) > 0 && (d.depth as number) > 0
                 && (d.massKg as number) >= 0, "appareil de taille ou de masse impossible");
            need(typeof d.source === "string", "appareil sans provenance de ses cotes");
            need(d.look === undefined || d.look === "amplifier", `aspect d'appareil inconnu : ${String(d.look)}`);
        }
        const wall = (it as { wall?: unknown }).wall;
        need(wall === "back" || wall === "left" || wall === "right", `mur inconnu : ${String(wall)}`);
        if (kind === "carcass")
        {
            const c = it as Record<string, unknown>;
            need(typeof c.root === "object" && c.root !== null, "caisson sans compartimentage");
            need(Array.isArray(c.fronts) && Array.isArray(c.linings), "caisson sans liste de façades ou d'habillages");
            need(Array.isArray(c.rails) && Array.isArray(c.lights), "caisson sans liste de penderies ou d'éclairages");
            need(Array.isArray(c.shoeRacks), "caisson sans liste de range-chaussures");
            const fillers = c.sideFillers as Record<string, unknown> | undefined;
            need(fillers === undefined || (typeof fillers === "object" && fillers !== null && ["left",
                "right"].every((k) =>
            {
                return typeof fillers[k] === "number" && Number.isFinite(fillers[k]) && (fillers[k] as number) >= 0;
            })), "fileurs latéraux mal décrits");
            need(Array.isArray(c.prints) && (c.prints as { file?: unknown }[]).every((x) =>  
            {
                return typeof x?.file === "string" && PHOTO_FILE_RE.test(x.file);
            }), "impression de fond mal décrite"); 
            for (const k of ["width", "height", "depth", "thickness", "x", "y", "z"])
            {
                need(typeof c[k] === "number" && Number.isFinite(c[k] as number), `caisson avec ${k} non numérique`);
            }
        }
    }
    return migrated as unknown as Project;
}


export function packProject(p: Project, textures: Map<string, Uint8Array>): Uint8Array
{
    const files: Record<string, Uint8Array> = { "project.json": strToU8(JSON.stringify(p, null, 2)) };
    for (const [name, data] of usedPhotos(p, textures))
    {
        files[`textures/${name}`] = data;
    }
    return zipSync(files, { level: 6 });
}


export function unpackProject(bytes: Uint8Array): ProjectArchive
{
    let files: Record<string, Uint8Array>;
    try
    {
        files = unzipSync(bytes);
    }
    catch
    {
        // a bare project.json is accepted too
        return { project: parseJson(strFromU8(bytes)), textures: new Map() };
    }
    const json = files["project.json"];
    need(json !== undefined, "project.json absent de l'archive");
    const textures = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(files))
    {
        // a file of another name, or bytes that are no image, never reach the 3D view
        const file = name.startsWith("textures/") ? name.slice("textures/".length) : "";
        if (PHOTO_FILE_RE.test(file) && photoKind(data) !== null)
        {
            textures.set(file, data);
        }
    }
    return { project: parseJson(strFromU8(json!)), textures };
}


function parseJson(text: string): Project
{
    let raw: unknown;
    try
    {
        raw = JSON.parse(text);
    }
    catch (e)
    {
        if (!(e instanceof SyntaxError))
        {
            throw e;
        } 
        throw new ProjectFileError(`Fichier projet illisible : ${e.message}. ` 
            + "Vérifier qu'il s'agit bien d'un .zip ou .json de systeme-32.");
    }
    return validateProject(raw);
}
