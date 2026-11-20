// The screw caps : discs punched out of the edge banding of the board, glued on every countersunk head seen once a
// door is open. The texture of the decor, no cap bought

import type { Project } from "./model";
import type { Build, Fitted, Part } from "./part_types";
import type { Vec3 } from "./geometry";
import { decorById } from "../data/materials";
import { screwPlaces } from "./io/cad_model";
import { HEAD_SINK } from "./screw_heads";
import { X, Y, at } from "./geometry";
import { DIAM } from "./text";

// A punch of 14 : over the countersink of a 5 x 50 (10.8) with 1.6 to spare, out of a banding of 23
export const SCREW_CAP = { diameter: 14, ref: "EDGE_CAP" };
// A punch of 20 over the Ø15 of a Minifix 15 housing (Häfele 262.26.535), 2.5 to spare a side, out of the same 23
export const HOUSING_CAP = { diameter: 20 };
// Looked at this far in front of a head : inside its carcass and in no board, it's seen
const LOOK = 5;
// The screws meant to come out, to move a piece or take it apart : their cap on double sided tape, lifted and put
// back. The others glued for good
export const UNSCREWED = new Set(["link-screw", "wall-fixing", "lining-screw", "back-screw", "plinth-screw"]);


function inside(q: Part, p: Vec3): boolean
{
    const f = q.frame!;
    const d: Vec3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
    const along = (a: Vec3): number => { return d[0] * a[0] + d[1] * a[1] + d[2] * a[2]; };
    const [u, v, n] = [along(f.u), along(f.v), along(f.n)];
    return u > 0 && u < q.length && v > 0 && v < q.width && n > 0 && n < q.thickness;
}


// Within the box or the cylinder of a fitted article
export function inFitted(f: Fitted, p: Vec3): boolean
{
    const d: Vec3 = [p[0] - f.centre[0], p[1] - f.centre[1], p[2] - f.centre[2]];
    const [a, b, c] = f.axes.map((x) => { return d[0] * x[0] + d[1] * x[1] + d[2] * x[2]; }) as [number, number, number];
    if (f.shape === "cylinder")
    {
        return Math.hypot(a, b) < f.half[0] && Math.abs(c) < f.half[2];
    }
    return Math.abs(a) < f.half[0] && Math.abs(b) < f.half[1] && Math.abs(c) < f.half[2];
}


function cross(a: Vec3, b: Vec3): Vec3
{
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}


export function fitScrewCaps(p: Project, b: Build): void
{
    const boards = b.parts.filter((q) => { return q.frame !== null && q.curve === null; });
    const counts = new Map<string, { item: string; itemName: string; n: number }>();
    const perBoard = new Map<Part, { tape: number; glue: number; housings: number }>();
    // A disc of the banding flush on `face`, looking along `out`, when that spot is seen once a door is open
    const lay = (item: string, part: string, face: Vec3, out: Vec3, purpose: string, diameter: number,
                 n: number): void =>
    {
        const c = p.items.find((it) => { return it.id === item; });
        if (c?.kind !== "carcass")
        {
            return;
        }
        const ahead: Vec3 = [face[0] + out[0] * LOOK, face[1] + out[1] * LOOK, face[2] + out[2] * LOOK];
        const within = ahead[0] > c.x && ahead[0] < c.x + c.width && ahead[1] > c.y && ahead[1] < c.y + c.height
            && ahead[2] > c.z && ahead[2] < c.z + c.depth;
        if (!within || boards.some((q) => { return inside(q, ahead); }))
        {
            return;
        }
        const board = boards.find((q) => { return q.item === item && q.label === part; });
        const decor = board === undefined ? c.decor : board.decor;
        const t = decorById(decor).edgeThickness;
        if (t === undefined)
        {
            return;
        }
        const side = Math.abs(out[1]) < 0.9 ? Y : X;
        const x = cross(side, out);
        const r = diameter / 2;
        // Under an article it doesn't hold, the spacer of a runner screwed on with the runner over it : no room for a
        // cap (essai25, 79 mm3 into the runners of the pull-out)
        const y = cross(out, x);
        const mid: Vec3 = [face[0] + out[0] * t / 2, face[1] + out[1] * t / 2, face[2] + out[2] * t / 2];
        const disc = [mid, ...[x, y].flatMap((a) =>
        {
            return [1, -1].map((k): Vec3 => { return [mid[0] + a[0] * r * k, mid[1] + a[1] *
                                                      r * k, mid[2] + a[2] * r * k]; });
        })];
        if (b.fitted.some((f) => { return f.purpose !== "screw-cap" && disc.some((q) => { return inFitted(f, q); }); }))
        {
            return;
        }
        // The purpose of what it covers in its key : the assembly sequence lays the cap once that's in
        b.fitted.push({ key: `${item}/cap/${purpose}/${n}`, item, ref: SCREW_CAP.ref, label: `${part} : cache-vis`,
                        purpose: "screw-cap", shape: "cylinder", centre: mid,
                        axes: [x, y, out], half: [r, r, t / 2], host: null, hidden: false });
        const housing = purpose === "minifix-housing";
        const tape = housing || UNSCREWED.has(purpose);
        const key = `${item}|${decor}|${tape ? "tape" : "glue"}|${diameter}|${housing ? "housing" : "screw"}`;
        const was = counts.get(key);
        counts.set(key, { item, itemName: c.name, n: (was?.n ?? 0) + 1 });
        if (board !== undefined)
        {
            const per = perBoard.get(board) ?? { tape: 0, glue: 0, housings: 0 };
            per[housing ? "housings" : tape ? "tape" : "glue"] += 1;
            perBoard.set(board, per);
        }
    };
    screwPlaces(boards).forEach((s, k) =>
    {
        // Under what it hold, a runner, an adapter plate, a foot mount : no cap, the article cover its head
        if (s.kind !== "countersunk" || s.holds !== undefined)
        {
            return;
        }
        // On the face the head is flush with
        const face: Vec3 = [s.point[0] + s.out[0] * HEAD_SINK, s.point[1] + s.out[1] * HEAD_SINK,
                            s.point[2] + s.out[2] * HEAD_SINK];
        lay(s.item, s.part, face, s.out, s.purpose ?? "screw", SCREW_CAP.diameter, k);
    });
    // A Minifix housing seen inside its carcass, flush with the face it's bored in : its cam turned again to take the
    // carcass apart, its disc on tape
    let n = 0;
    for (const q of boards)
    {
        for (const h of q.holes.filter((x) => { return x.purpose === "minifix-housing" && (x.face === "A" ||
            x.face === "B"); }))
        {
            const f = q.frame!;
            const face = at(f, h.u, h.v, h.face === "A" ? 0 : q.thickness);
            const out: Vec3 = h.face === "A" ? [-f.n[0], -f.n[1], -f.n[2]] : f.n;
            lay(q.item, q.label, face, out, "minifix-housing", HOUSING_CAP.diameter, n++);
        }
    }
    // On the plan of each board : how many caps, cut out of what, laid how
    for (const [board, { tape, glue, housings }] of perBoard)
    {
        const said = [tape > 0 ? `${tape} au double face sur les vis à démonter` : "",
                      glue > 0 ? `${glue} collés à la cyanoacrylate sur les vis définitives` : "",
                      housings > 0 ? `${housings} de ${DIAM}${HOUSING_CAP.diameter} au double face sur les boîtiers Minifix`
                          : ""].filter((x) => { return x !== ""; });
        board.notes.push(`Cache-vis taillés à l'emporte-pièce dans le chant du décor, ${DIAM}${SCREW_CAP.diameter} sauf `
            + `mention, fil orienté comme le panneau, posés une fois tout vissé : ${said.join(", ")}`);
    }
    for (const [key, { item, itemName, n: qty }] of counts)
    {
        const [, decor, how, diameter, what] = key.split("|") as [string, string, string, string, string];
        const on = what === "housing" ? "les boîtiers Minifix" : how === "tape" ? "les vis à démonter" : "les vis définitives";
        const laid = how === "tape" ? `posées au double face sur ${on}` : `collées à la cyanoacrylate sur ${on}`;
        b.hardware.push({ ref: SCREW_CAP.ref, qty, item, itemName, target: null,
                          note: `pastilles ${DIAM}${diameter} découpées dans le chant ${decorById(decor).edge ?? decor}, ${laid}`,
                          purpose: "screw-cap" });
        // What lays them : one tube or one roll for the project (perProject in data/hardware.ts)
        b.hardware.push({ ref: how === "tape" ? "TAPE_DOUBLE" : "GLUE_CYANO", qty: 1, item, itemName, target: null,
                          note: laid, purpose: "screw-cap" });
    }
}
