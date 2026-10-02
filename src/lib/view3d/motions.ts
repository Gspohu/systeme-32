// Where an open front stands in 3D : a group turned about its hinge line, or pushed along its runners

import * as THREE from "three";
import type { Fitted, Motion } from "../core/parts";
import { MM } from "./meshes";

export interface Pose
{
    quaternion: [number, number, number, number];
    position: [number, number, number];
}

export const REST: Pose = { quaternion: [0, 0, 0, 1], position: [0, 0, 0] };


// The pose of a group in the frame of the wall that brings its meshes from closed to fully open
export function openPose(m: Motion): Pose
{
    const axis = new THREE.Vector3(...m.axis).normalize();
    if (m.kind === "slide")
    {
        const d = axis.multiplyScalar(m.amount * MM);
        return { quaternion: [0, 0, 0, 1], position: [d.x, d.y, d.z] };
    }
    const q = new THREE.Quaternion().setFromAxisAngle(axis, m.amount * Math.PI / 180);
    const p = new THREE.Vector3(...m.pivot).multiplyScalar(MM);
    // a turn about a line through p maps x to q (x - p) + p : the group stands at p - q p
    const at = p.clone().sub(p.clone().applyQuaternion(q));
    return { quaternion: [q.x, q.y, q.z, q.w], position: [at.x, at.y, at.z] };
}


// The motion moving each part, and each piece of hardware with the part it is fixed in
export function movers(motions: Motion[], fitted: Fitted[], open: (m: Motion) => boolean): Map<string, Motion>
{
    const by = new Map<string, Motion>();
    for (const m of motions)
    {
        if (!open(m))
        {
            continue;
        }
        for (const id of m.parts)
        {
            by.set(id, m);
        }
    }
    for (const f of fitted)
    {
        const m = f.host === null ? undefined : by.get(f.host);
        if (m !== undefined)
        {
            by.set(f.key, m);
        }
    }
    return by;
}
