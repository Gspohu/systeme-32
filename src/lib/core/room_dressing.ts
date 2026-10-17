// What dresses the room to judge a piece in it : side walls, a sofa, lamps. Seen in 3D, never made nor priced

import type { Lamp, Project, Sofa, UserTexture, Wall, WallPicture } from "./model";
import { photoFile, type PhotoKind } from "./photos";
import { sideWallDepth } from "./room";
import { newId } from "./factory";
import { CommandError, edit } from "./edit";

// Starting values of a sofa until it is measured, its seat at the usual 450 of a dining chair as well
// TODO a catalogue of the sofas they own would replace these, only the 1880 of the TV room's one is known
export const SOFA_START = { width: 2000, depth: 900, height: 800, seat: 450 };
// The 806 lm a lamp must give to claim a 60 W equivalent (Regulation EC 244/2009), as EPREL sheets still list it
export const LAMP_START = { lumens: 806, kelvin: 2700 };


// The side walls standing : those things lean on, the returns of an alcove, and those the user ask for
export function shownSideWalls(p: Project): Set<"left" | "right">
{
    const out = new Set<"left" | "right">(p.room.walls ?? []);
    for (const it of p.items)
    {
        if (it.wall !== "back")
        {
            out.add(it.wall);
        }
    }
    if (p.room.returns !== undefined)
    {
        out.add("left");
        out.add("right");
    }
    return out;
}


export function setSideWall(p: Project, side: "left" | "right", shown: boolean): Project
{
    return edit(p, (q) =>
    {
        const kept = (q.room.walls ?? []).filter((w) =>
        {
            return w !== side;
        });
        q.room.walls = shown ? [...kept, side] : kept;
    });
}


// The archive name of the walls' photo, apart from the decor ones
export const WALL_PHOTO = "room_walls";


// A photo laid over the walls, or none : its width on the wall from 10 mm to 10 m
export function setWallPhoto(p: Project, photo: UserTexture | null): Project
{
    if (photo !== null && (!Number.isFinite(photo.tileMm) || photo.tileMm < 10 || photo.tileMm > 10000))
    {
        throw new CommandError(`Motif de ${photo.tileMm} mm de large : saisir la largeur de mur que montre la photo, `
            + "de 10 à 10 000 mm.");
    }
    return edit(p, (q) =>
    {
        if (photo === null)
        {
            delete q.room.wallPhoto;
        }
        else
        {
            q.room.wallPhoto = { ...photo };
        }
    });
}


// A name of its own in the archive for each photo hung, the bytes of two never mixed up
export function pictureFile(kind: PhotoKind): string
{
    return photoFile(newId("picture"), kind);
}


function checkPicture(x: WallPicture): void
{
    if (!Number.isFinite(x.width) || x.width < 10)
    {
        throw new CommandError(`Photo murale de ${x.width} mm de large : saisir sa largeur sur le mur, 10 mm au moins.`);
    }
    if (!Number.isFinite(x.x) || !Number.isFinite(x.y) || x.y < 0)
    {
        throw new CommandError("Position de la photo murale invalide : X le long du mur et hauteur du bas positive, en mm.");
    }
}


// The photo just imported, 600 wide, centred along its wall with its bottom 1200 up
export function addPicture(p: Project, file: string, wall: Wall): Project
{
    return edit(p, (q) =>
    {
        const length = wall === "back" ? q.room.width : sideWallDepth(q.room, wall);
        const x: WallPicture = { id: newId("pic"), name: `Photo ${q.room.pictures.length + 1}`, file, wall,
                                 x: (length - 600) / 2, y: 1200, width: 600 };
        checkPicture(x);
        q.room.pictures.push(x);
    });
}


export function updatePicture(p: Project, id: string, patch: Partial<WallPicture>): Project
{
    return edit(p, (q) =>
    {
        const i = q.room.pictures.findIndex((x) =>
        {
            return x.id === id;
        });
        if (i < 0)
        {
            throw new CommandError("Photo murale introuvable.");
        }
        const next = { ...q.room.pictures[i]!, ...patch };
        checkPicture(next);
        q.room.pictures[i] = next;
    });
}


export function removePicture(p: Project, id: string): Project
{
    return edit(p, (q) =>
    {
        q.room.pictures = q.room.pictures.filter((x) =>
        {
            return x.id !== id;
        });
    });
}


function checkSofa(s: Sofa): void
{
    for (const [k, label] of [["width", "Longueur"], ["depth", "Profondeur"], ["height", "Hauteur"],
                              ["seat", "Assise"]] as const)
    {
        if (!Number.isFinite(s[k]) || s[k] <= 0)
        {
            throw new CommandError(`${label} du canapé invalide (${s[k]}). Saisir une cote positive en mm.`);
        }
    }
    if (s.seat >= s.height)
    {
        throw new CommandError(`Assise à ${s.seat} mm pour un dossier de ${s.height} : l'assise doit rester sous le `
            + "haut du dossier.");
    }
    if (!Number.isFinite(s.distance) || s.distance < s.depth)
    {
        throw new CommandError(`Canapé à ${s.distance} mm du mur du fond pour ${s.depth} de profondeur : il entrerait `
            + "dans le mur. L'éloigner.");
    }
}


// Its back against the wall facing the back one, centred on the back wall, the premier place anyone puts it
export function addSofa(p: Project): Project
{
    return edit(p, (q) =>
    {
        const s: Sofa = { id: newId("sofa"), name: "Canapé", ...SOFA_START, x: (q.room.width - SOFA_START.width) / 2,
                          distance: q.room.depth };
        checkSofa(s);
        q.room.sofas.push(s);
    });
}


export function updateSofa(p: Project, id: string, patch: Partial<Sofa>): Project
{
    return edit(p, (q) =>
    {
        const i = q.room.sofas.findIndex((s) =>
        {
            return s.id === id;
        });
        if (i < 0)
        {
            throw new CommandError("Canapé introuvable.");
        }
        const next = { ...q.room.sofas[i]!, ...patch };
        checkSofa(next);
        q.room.sofas[i] = next;
    });
}


export function removeSofa(p: Project, id: string): Project
{
    return edit(p, (q) =>
    {
        q.room.sofas = q.room.sofas.filter((s) =>
        {
            return s.id !== id;
        });
    });
}


function checkLamp(l: Lamp): void
{
    if (![l.x, l.y, l.z].every(Number.isFinite) || l.y < 0 || l.z < 0)
    {
        throw new CommandError("Position de lampe invalide : hauteur et distance au mur du fond positives, en mm.");
    }
    if (!Number.isFinite(l.lumens) || l.lumens <= 0)
    {
        throw new CommandError(`Flux de ${l.lumens} lm invalide. Saisir le flux de l'ampoule, ${LAMP_START.lumens} lm `
            + "pour l'équivalent d'une 60 W.");
    }
    if (!Number.isFinite(l.kelvin) || l.kelvin < 1800 || l.kelvin > 6500)
    {
        throw new CommandError(`Teinte de ${l.kelvin} K hors des ampoules courantes : saisir entre 1800 et 6500 K.`);
    }
}


// A bulb in the midle of the room, 1500 up and 1500 out from the back wall
export function addLamp(p: Project): Project
{
    return edit(p, (q) =>
    {
        const l: Lamp = { id: newId("lamp"), name: `Lampe ${q.room.lamps.length + 1}`, x: q.room.width / 2, y: 1500,
                          z: Math.min(1500, q.room.depth / 2), ...LAMP_START };
        q.room.lamps.push(l);
    });
}


export function updateLamp(p: Project, id: string, patch: Partial<Lamp>): Project
{
    return edit(p, (q) =>
    {
        const i = q.room.lamps.findIndex((l) =>
        {
            return l.id === id;
        });
        if (i < 0)
        {
            throw new CommandError("Lampe introuvable.");
        }
        const next = { ...q.room.lamps[i]!, ...patch };
        checkLamp(next);
        q.room.lamps[i] = next;
    });
}


export function removeLamp(p: Project, id: string): Project
{
    return edit(p, (q) =>
    {
        q.room.lamps = q.room.lamps.filter((l) =>
        {
            return l.id !== id;
        });
    });
}
