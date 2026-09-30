// Procedural decor textures drawn on a canvas, grain along x, seeded per decor so they never flicker

import * as THREE from "three";
import type { Decor } from "../data/materials";


const SIZE = 512;
// one texture tile covers this may millimetres of panel
export const TILE_MM = 600;

const cache = new Map<string, THREE.Texture>();

function rng(seed: number): () => number
{
    let s = seed >>> 0;
    return () =>
    {
        // mulberry32
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}


function hash(t: string): number
{
    let h = 2166136261;
    for (const ch of t)
    {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}


function rgb(c: [number, number, number], a = 1): string
{
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}


export function decorTexture(d: Decor): THREE.Texture | null
{
    if (!d.grain || d.rgbDark === undefined || d.rgbLight === undefined)
    {
        return null;
    }
    const hit = cache.get(d.id);
    if (hit !== undefined)
    {
        return hit;
    }
    if (typeof document === "undefined")
    {
        return null;
    }
    const cv = document.createElement("canvas");
    cv.width = SIZE;
    cv.height = SIZE;
    const pen = cv.getContext("2d")!;
    const rand = rng(hash(d.id));
    pen.fillStyle = rgb(d.rgb);
    pen.fillRect(0, 0, SIZE, SIZE);
    // long streaks of lighter and darker fibre, wavy along x
    let k = 0;
    while (k < 220)
    {
        const y = rand() * SIZE;
        const amp = 1 + rand() * 5;
        const freq = 0.004 + rand() * 0.01;
        const w = 0.5 + rand() * 2.5;
        pen.strokeStyle = rand() < 0.5 ? rgb(d.rgbDark, 0.18 + rand() * 0.25) : rgb(d.rgbLight, 0.15 + rand() * 0.25);
        pen.lineWidth = w;
        pen.beginPath();
        let x = 0;
        while (x <= SIZE)
        {
            const yy = y + Math.sin((x * freq) + k) * amp;
            if (x === 0)
            {
                pen.moveTo(x, yy);
            }
            else
            {
                pen.lineTo(x, yy);
            }
            x += 8;  
        }
        pen.stroke();
        k++;
    }
    // a few dark checks, the look of the Halifax sample
    let n = 0;
    while (n < 3)
    {
        const y = rand() * SIZE;
        const x0 = rand() * SIZE * 0.5;
        const len = SIZE * (0.3 + rand() * 0.5);
        pen.strokeStyle = rgb([70, 55, 40], 0.55);
        pen.lineWidth = 1 + rand() * 1.5;
        pen.beginPath();
        pen.moveTo(x0, y);
        pen.bezierCurveTo(x0 + len / 3, y + (rand() - 0.5) * 6, x0 + 2 * len / 3, y + (rand() - 0.5) * 6,
                          x0 + len, y + (rand() - 0.5) * 4);
        pen.stroke();
        n++;
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    // extrude UVs are in millimetres of the sahpe, one tile every TILE_MM
    tex.repeat.set(1 / TILE_MM, 1 / TILE_MM);
    tex.anisotropy = 4;
    cache.set(d.id, tex);
    return tex;
}
