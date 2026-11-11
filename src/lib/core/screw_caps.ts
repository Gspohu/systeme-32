// The screw caps : discs punched out of the edge banding of the board, glued on every countersunk head seen once a
// door is open. The texture of the decor, no cap bought

import type { Project } from "./model";
import type { Build, Fitted, Part } from "./part_types";
import type { Vec3 } from "./geometry";
import { decorById } from "../data/materials";
import { screwPlaces } from "./io/cad_model";
import { HEAD_SINK } from "./screw_heads";
import { X, Y } from "./geometry";
import { DIAM } from "./text";

// A punch of 14 : over the countersink of a 5 x 50 (10.8) with 1.6 to spare, out of a banding of 23
export const SCREW_CAP = { diameter: 14, ref: "EDGE_CAP" };
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
    const perBoard = new Map<Part, { tape: number; glue: number }>();
    screwPlaces(boards).forEach((s, k) =>
    {
        const c = p.items.find((it) => { return it.id === s.item; });
        // Under what it hold, a runner, an adapter plate, a foot mount : no cap, the article cover its head
        if (s.kind !== "countersunk" || c?.kind !== "carcass" || s.holds !== undefined)
        {
            return;
        }
        const ahead: Vec3 = [s.point[0] + s.out[0] * LOOK, s.point[1] + s.out[1] * LOOK, s.point[2] + s.out[2] * LOOK];
        const within = ahead[0] > c.x && ahead[0] < c.x + c.width && ahead[1] > c.y && ahead[1] < c.y + c.height
            && ahead[2] > c.z && ahead[2] < c.z + c.depth;
        if (!within || boards.some((q) => { return inside(q, ahead); }))
        {
            return;
        }
        const board = boards.find((q) => { return q.item === s.item && q.label === s.part; });
        const decor = board === undefined ? c.decor : board.decor;
        const t = decorById(decor).edgeThickness;
        if (t === undefined)
        {
            return;
        }
        // On the face the head is flush with, a disc of the banding
        const face: Vec3 = [s.point[0] + s.out[0] * HEAD_SINK, s.point[1] + s.out[1] * HEAD_SINK,
                            s.point[2] + s.out[2] * HEAD_SINK];
        const side = Math.abs(s.out[1]) < 0.9 ? Y : X;
        const x = cross(side, s.out);
        const r = SCREW_CAP.diameter / 2;
        // Under an article it doesn't hold, the spacer of a runner screwed on with the runner over it : no room for a
        // cap (essai25, 79 mm3 into the runners of the pull-out)
        const y = cross(s.out, x);
        const mid: Vec3 = [face[0] + s.out[0] * t / 2, face[1] + s.out[1] * t / 2, face[2] + s.out[2] * t / 2];
        const disc = [mid, ...[x, y].flatMap((a) =>
        {
            return [1, -1].map((k): Vec3 => { return [mid[0] + a[0] * r * k, mid[1] + a[1] *
                                                      r * k, mid[2] + a[2] * r * k]; });
        })];
        if (b.fitted.some((f) => { return f.purpose !== "screw-cap" && disc.some((q) => { return inFitted(f, q); }); }))
        {
            return;
        }
        // The purpose of the screw in its key : the assembly sequence lays the cap once that screw is in
        b.fitted.push({ key: `${s.item}/cap/${s.purpose ?? "screw"}/${k}`, item: s.item, ref: SCREW_CAP.ref,
                       label: `${s.part} : cache-vis`,
                        purpose: "screw-cap", shape: "cylinder",
                        centre: [face[0] + s.out[0] * t / 2, face[1] + s.out[1] * t / 2, face[2] + s.out[2] * t / 2],
                        axes: [x, cross(s.out, x), s.out], half: [r, r, t / 2], host: null, hidden: false });
        const tape = UNSCREWED.has(s.purpose ?? "");
        const key = `${s.item}|${decor}|${tape ? "tape" : "glue"}`;
        const was = counts.get(key);
        counts.set(key, { item: s.item, itemName: c.name, n: (was?.n ?? 0) + 1 });
        if (board !== undefined)
        {
            const per = perBoard.get(board) ?? { tape: 0, glue: 0 };
            per[tape ? "tape" : "glue"] += 1;
            perBoard.set(board, per);
        }
    });
    // On the plan of each board : how many caps, cut out of what, laid how
    for (const [board, { tape, glue }] of perBoard)
    {
        const said = [tape > 0 ? `${tape} au double face sur les vis à démonter` : "",
                      glue > 0 ? `${glue} collés à la cyanoacrylate sur les vis définitives` : ""].filter((x) => { return x !== ""; });
        board.notes.push(`Cache-vis ${DIAM}${SCREW_CAP.diameter} taillés à l'emporte-pièce dans le chant du décor, fil orienté `
            + `comme le panneau, posés une fois tout vissé : ${said.join(", ")}`);
    }
    for (const [key, { item, itemName, n }] of counts)
    {
        const [, decor, how] = key.split("|") as [string, string, string];
        const laid = how === "tape" ? "posées au double face sur les vis à démonter" : "collées à la cyanoacrylate sur les vis définitives";
        b.hardware.push({ ref: SCREW_CAP.ref, qty: n, item, itemName, target: null,
                          note: `pastilles ${DIAM}${SCREW_CAP.diameter} découpées dans le chant ${decorById(decor).edge ?? decor}, ${laid}`,
                          purpose: "screw-cap" });
    }
}
