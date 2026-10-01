// Hardware as volumes in the frame of the wall : what sits in a drilled hole, and the boxes and cylinders the
// builders lay out themselves (feet, the space a runner reserves)

import { at, X, Y, Z, type Vec3 } from "./geometry";
import type { Fitted, Part } from "./parts";

// a hinge cup fit its 35 boring, a Minifix housign its 15 one : the volume is the hole itself
const LET_IN: { prefix: string; ref: string; label: string }[] = [
    { prefix: "Cuvette", ref: "CLIP top", label: "cuvette de charnière" },
    { prefix: "Boîtier Minifix", ref: "262.25.035", label: "boîtier Minifix" },
];


export function box(key: string, item: string, ref: string, label: string, min: Vec3, max: Vec3,
                    hidden: boolean): Fitted
{
    return {
        key, item, ref, label, shape: "box", host: null, hidden,
        centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
        axes: [X, Y, Z],
        half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
    };
}


// an upright cylinder standing on `bottom`
export function post(key: string, item: string, ref: string, label: string, x: number, z: number, bottom: number,
                     height: number, diameter: number, hidden: boolean): Fitted
{
    return {
        key, item, ref, label, shape: "cylinder", host: null, hidden,
        centre: [x, bottom + height / 2, z],
        axes: [X, Z, Y],
        half: [diameter / 2, diameter / 2, height / 2],
    };
}


// the box around a piece of hardware in the frame of its wall, what the drawings project
export function fittedExtent(f: Fitted): { min: Vec3; max: Vec3 }
{
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const s0 of [-1, 1])
    {
        for (const s1 of [-1, 1])
        {
            for (const s2 of [-1, 1])
            {
                let k = 0;
                while (k < 3)
                {
                    const v = f.centre[k]! + s0 * f.half[0] * f.axes[0][k]! + s1 * f.half[1] * f.axes[1][k]!
                        + s2 * f.half[2] * f.axes[2][k]!;
                    min[k] = Math.min(min[k]!, v);
                    max[k] = Math.max(max[k]!, v);
                    k++;
                }
            }
        }
    }
    return { min, max };
}


export function letInFittings(parts: Part[]): Fitted[]
{
    const out: Fitted[] = [];
    for (const p of parts)
    {
        if (p.frame === null)
        {
            continue;
        }
        let n = 0;
        for (const h of p.holes)
        {
            const kind = LET_IN.find((k) =>
            {
                return h.label.startsWith(k.prefix);
            });
            if (kind === undefined || h.diameter <= 0 || h.depth <= 0 || (h.face !== "A" && h.face !== "B"))
            {
                continue;
            }
            const w = h.face === "A" ? h.depth / 2 : p.thickness - h.depth / 2;
            out.push({
                key: `${p.id}/${kind.label}${n}`, item: p.item, ref: kind.ref, label: `${p.label}, ${kind.label}`,
                shape: "cylinder", centre: at(p.frame, h.u, h.v, w), axes: [p.frame.u, p.frame.v, p.frame.n],
                half: [h.diameter / 2, h.diameter / 2, h.depth / 2], host: p.id, hidden: true,
            });
            n++;
        }
    }
    return out;
}
