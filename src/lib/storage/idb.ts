// Autosave in IndexedDB : one record per project with its textures, plus the id of the last one opened

import { openDB, type IDBPDatabase } from "idb";
import type { Project } from "../core/model";
import { validateProject } from "../core/io/project_file";
import { usedPhotos } from "../core/photos";


interface Stored
{
    id: string;
    name: string;
    saved: string;
    project: Project;
    textures: [string, Uint8Array][];
}

const DB = "systeme-32";
const VERSION = 1;
let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase>
{
    if (dbPromise === null)
    {
        dbPromise = openDB(DB, VERSION, {
            upgrade(d)
            {
                d.createObjectStore("projects", { keyPath: "id" });
                d.createObjectStore("meta");
            },
        });
    }
    return dbPromise;
}


// Private browsing or blocked storage : reoprted to the caller, the app keeps runing on files
export async function storageAvailable(): Promise<boolean>
{
    try
    {
        await db();
        return true;
    }
    catch (e)
    {
        console.warn("systeme-32 : stockage du navigateur indisponible", e);
        return false;
    }
}


export async function saveLocal(p: Project, textures: Map<string, Uint8Array>): Promise<void>
{
    const d = await db();
    const rec: Stored = { id: p.id, name: p.name, saved: new Date().toISOString(), project: p,
                         textures: [...usedPhotos(p, textures).entries()] };
    await d.put("projects", rec);
    await d.put("meta", p.id, "last");
}


export async function loadLast(): Promise<{ project: Project; textures: Map<string, Uint8Array> } | null>
{
    const d = await db();
    const id = await d.get("meta", "last") as string | undefined;
    if (id === undefined)
    {
        return null;
    }
    return loadLocal(id);
}


export async function loadLocal(id: string): Promise<{ project: Project; textures: Map<string, Uint8Array> } | null>
{
    const d = await db();
    const rec = await d.get("projects", id) as Stored | undefined;
    // a record saved by an older version goes through the same checks and migrations as a file
    return rec === undefined ? null : { project: validateProject(rec.project), textures: new Map(rec.textures) };
}


export async function listLocal(): Promise<{ id: string; name: string; saved: string }[]>
{
    const d = await db();
    const all = await d.getAll("projects") as Stored[];
    const found: { id: string; name: string; saved: string }[] = [];
    for (const r of all)
    {
        found.push({ id: r.id, name: r.name, saved: r.saved });
    }
    found.sort((a, b) =>
    {
        return b.saved.localeCompare(a.saved);
    });
    return found;
}


export async function deleteLocal(id: string): Promise<void>
{
    const d = await db();
    await d.delete("projects", id);
}
