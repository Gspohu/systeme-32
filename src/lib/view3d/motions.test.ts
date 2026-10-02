import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { movers, openPose, REST } from "./motions";
import type { Fitted, Motion } from "../core/parts";
import { X, Y, Z, neg, type Vec3 } from "../core/geometry";
import { MM } from "./meshes";


function motion(o: Partial<Motion>): Motion
{
    return { item: "k", front: "f", label: "Porte", kind: "turn", pivot: [0, 0, 0], axis: neg(Y), amount: 90,
             parts: ["k/front/f"], fitted: [], rides: [], source: "", remedy: "", ...o };
}


// where a point of a closed front lands once the group of its pose is applied, in mm
function moved(m: Motion, at: Vec3): number[]
{
    const pose = openPose(m);
    const v = new THREE.Vector3(...at).multiplyScalar(MM).applyQuaternion(new THREE.Quaternion(...pose.quaternion));
    return [v.x, v.y, v.z].map((x, k) =>
    {
        return Math.round((x + pose.position[k]!) / MM * 10) / 10;
    });
}


describe("fronts opened in 3D", () =>
{
    it("swings a left hinged door out about its hinge line, its free edge ending in front of it", () =>
    {
        // hinge line at x 100, z 400 : the far edge of a 600 door ocmes 600 out at a right angle
        const door = motion({ pivot: [100, 0, 400], amount: 90 });
        expect(moved(door, [700, 300, 400])).toEqual([100, 300, 1000]);
        expect(moved(door, [100, 50, 400])).toEqual([100, 50, 400]);
    });


    it("raises a flap 107 deg about its top edge, its bottom edge FH x sin 17 deg over it", () =>
    {
        const flap = motion({ pivot: [0, 1900, 350], axis: neg(X), amount: 107 });
        const [, y, z] = moved(flap, [0, 1500, 350]);
        expect(y).toBeCloseTo(1900 + 400 * Math.sin(17 * Math.PI / 180), 0);
        expect(z).toBeCloseTo(350 + 400 * Math.cos(17 * Math.PI / 180), 0);
    });


    it("pulls a drawer straight out by the runner length, and leaves a closed front at rest", () =>
    {
        expect(moved(motion({ kind: "slide", axis: Z, amount: 450 }), [10, 20, 30])).toEqual([10, 20, 480]);
        expect(openPose(motion({ kind: "slide", axis: X, amount: 0 }))).toEqual(REST);
    });


    it("moves the handle and the hinge cups with their door, not the plates on the side", () =>
    {
        const fitted = (key: string, host: string | null): Fitted =>
        {
            return { key, item: "k", ref: "", label: "", shape: "box", centre: [0, 0, 0], axes: [X, Y, Z],
                     half: [1, 1, 1], host, hidden: false };
        };
        const door = motion({});
        const all = [fitted("k/handle/f/barre", "k/front/f"), fitted("k/plate", "k/side/L")];
        const open = movers([door], all, () =>
        {
            return true;
        });
        expect([...open.keys()].sort()).toEqual(["k/front/f", "k/handle/f/barre"]);
        expect(movers([door], all, () =>
        {
            return false;
        }).size).toBe(0);
    });
});
