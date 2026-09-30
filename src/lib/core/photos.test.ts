import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { PHOTO_MAX_BYTES, PhotoError, checkPhoto, photoFile, photoKind } from "./photos";
import { setTexture, CommandError } from "./commands";
import { newProject } from "./factory";
import { packProject, unpackProject, validateProject } from "./io/project_file";


const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]); 
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const WEBP = strToU8("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");


describe("decor photos", () =>
{
    it("reads the format from the bytes, not from what the file claims", () =>
    {
        expect(photoKind(PNG)).toBe("png");
        expect(photoKind(JPG)).toBe("jpg");
        expect(photoKind(WEBP)).toBe("webp");
        expect(photoKind(strToU8("<svg onload=alert(1)>"))).toBeNull();
        expect(() =>
        {
            checkPhoto(strToU8("GIF89a"));
        }).toThrow(PhotoError);
        const huge = new Uint8Array(PHOTO_MAX_BYTES + 1);
        huge.set(PNG);
        expect(() =>
        {
            checkPhoto(huge);
        }).toThrow(/8 Mo maxi/);
    });

    it("names the archive file after the decor, with nothing a path could hide in", () =>
    {
        expect(photoFile("H1180_ST37", "jpg")).toBe("H1180_ST37.jpg");
        expect(photoFile("../../etc", "png")).toBe("______etc.png");
    });   


    it("assigns, rescales and removes a photo, and refuses a width that shows nothing", () =>
    {
        const p = newProject("essai");
        const q = setTexture(p, "H1180_ST37", { file: "H1180_ST37.jpg", tileMm: 150 });
        expect(q.textures["H1180_ST37"]).toEqual({ file: "H1180_ST37.jpg", tileMm: 150 });
        expect(p.textures).toEqual({});
        expect(setTexture(q, "H1180_ST37", null).textures).toEqual({});
        expect(() =>
        {
            setTexture(p, "H1180_ST37", { file: "H1180_ST37.jpg", tileMm: 0 });
        }).toThrow(CommandError);
        expect(() =>
        {
            setTexture(p, "H1180_ST37", { file: "../x.jpg", tileMm: 150 });
        }).toThrow(CommandError);
    });


    it("packs only the photos still in use and keeps them through a save and an open", () =>
    {
        const p = setTexture(newProject("essai"), "U604_ST9", { file: "U604_ST9.png", tileMm: 300 });
        const all = new Map([["U604_ST9.png", PNG], ["W1000_ST9.jpg", JPG]]);
        const zip = packProject(p, all);
        expect(Object.keys(unzipSync(zip)).sort()).toEqual(["project.json", "textures/U604_ST9.png"]);
        const back = unpackProject(zip);
        expect(back.project.textures["U604_ST9"]!.tileMm).toBe(300);
        expect([...back.textures.keys()]).toEqual(["U604_ST9.png"]);
    });

    it("drops what a crafted archive slips in : a path, bytes that are no image", () =>
    {
        const p = newProject("essai");
        const zip = zipSync({
            "project.json": strToU8(JSON.stringify(p)),
            "textures/../evil.png": PNG,
            "textures/fake.png": strToU8("not an image"),
            "textures/good.webp": WEBP,
        });
        expect([...unpackProject(zip).textures.keys()]).toEqual(["good.webp"]);
        const bad = { ...p, textures: { H1180_ST37: { file: "../evil.png", tileMm: 600 } } };
        expect(() =>
        {
            validateProject(JSON.parse(JSON.stringify(bad)));
        }).toThrow(/photo de décor/);
    });

    it("gives a version 1 photo entry the default width", () =>
    {
        const old = { ...newProject("essai"), schema: 1, textures: { H1180_ST37: "H1180_ST37.jpg" } };
        const back = validateProject(JSON.parse(JSON.stringify(old)));
        expect(back.textures["H1180_ST37"]).toEqual({ file: "H1180_ST37.jpg", tileMm: 600 });
    });
});
