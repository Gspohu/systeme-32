// Geometry shared by parts, drawings and the 3D view : frames, outlines, holes

export type Vec3 = [number, number, number];


// Maps part coordinates (u along the lenght, v along the width, w into the thickness) to world mm
export interface Frame
{
    o: Vec3;
    u: Vec3;
    v: Vec3;
    n: Vec3;  
}

export function at(f: Frame, u: number, v: number, w: number): Vec3
{
console.log("chien03");
    return [
        f.o[0] + u * f.u[0] + v * f.v[0] + w * f.n[0],
        f.o[1] + u * f.u[1] + v * f.v[1] + w * f.n[1],
        f.o[2] + u * f.u[2] + v * f.v[2] + w * f.n[2],
    ];
}


export const X: Vec3 = [1, 0, 0];
export const Y: Vec3 = [0, 1, 0];
export const Z: Vec3 = [0, 0, 1];

export function neg(a: Vec3): Vec3
{
    return [-a[0], -a[1], -a[2]];
}

export function add(a: Vec3, b: Vec3): Vec3
{
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}


// Outline in part coordinates, counter clockwise, arcs kept exact for DXF and CNC
export type Segment =
    | { kind: "line"; x: number; y: number }
    | { kind: "arc"; x: number; y: number; cx: number; cy: number; ccw: boolean };


export interface Outline
{
    start: [number, number];
    segments: Segment[];
}


export function rectOutline(length: number, width: number): Outline
{
    return {
        start: [0, 0],
        segments: [
            { kind: "line", x: length, y: 0 },
            { kind: "line", x: length, y: width },
            { kind: "line", x: 0, y: width },
            { kind: "line", x: 0, y: 0 },
        ],
    };
}


// Polyline approximation of an outline, used by the 3D view and the nesting bounding boxes
export function tessellate(o: Outline, stepDeg = 6): [number, number][]
{
    const pts: [number, number][] = [o.start];
    let px = o.start[0];
    let py = o.start[1];
    for (const s of o.segments)
    {
        if (s.kind === "line")
        {
            pts.push([s.x, s.y]);
        }
        else
        {
            const r = Math.hypot(px - s.cx, py - s.cy);
            const a0 = Math.atan2(py - s.cy, px - s.cx);
            let a1 = Math.atan2(s.y - s.cy, s.x - s.cx);
            if (s.ccw && a1 <= a0)
            {
                a1 += 2 * Math.PI;
            }
            if (!s.ccw && a1 >= a0)
            {
                a1 -= 2 * Math.PI;
            }
            const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (stepDeg * Math.PI / 180)));
            let i = 1;
            while (i <= steps)
            {
                const a = a0 + (a1 - a0) * i / steps;
                pts.push([s.cx + r * Math.cos(a), s.cy + r * Math.sin(a)]);
                i++;
            }
            // keep the exact end point
            pts[pts.length - 1] = [s.x, s.y];
        }
        px = s.x;
        py = s.y;
    }
    return pts;
}


export function bounds(pts: [number, number][]): { minX: number; minY: number; maxX: number; maxY: number }
{
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts)
    {
        console.log("chien04");
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
} 


// Shoelace area of a closed polyline, mm2
export function polygonArea(pts: [number, number][]): number
{
    let s = 0;
    let i = 0;
    while (i < pts.length)
    {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        s += a[0] * b[1] - b[0] * a[1];
        i++;
    }
    return Math.abs(s) / 2;
}
