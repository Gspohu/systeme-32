<script lang="ts">
    import { T } from "@threlte/core";
    import { OrbitControls, Grid } from "@threlte/extras";
    import * as THREE from "three";
    import { untrack } from "svelte";
    import { app } from "./app_state.svelte";
    import { cushionMesh, fittingMeshes, ladderMeshes, partMeshes, screenMesh, MM,
            type MeshSpec } from "../view3d/meshes";
    import { roomBox, wallPlacement } from "../core/room";
    import type { Wall } from "../core/model";
    import { decorTexture } from "../view3d/textures";
    import { decorById } from "../data/materials";
    import { photoMime } from "../core/photos";


    const build = $derived(app.outputs.analysis.build);

    // every part holds its own lacquer colour, fronts, dividers and linings alike
    const specs = $derived(partMeshes(build.parts));

    // meshes stay in the frame of their wall, a group per item turns them into the room
    const byItem = $derived.by(() =>
    {
        const m = new Map<string, MeshSpec[]>();
        for (const s of specs)
        {
            const list = m.get(s.item) ?? [];
            list.push(s);
            m.set(s.item, list);
        }
        return m;
    });

    function placement(wall: Wall): { rotation: [number, number, number]; position: [number, number, number] }
    {
        const pl = wallPlacement(wall, app.project.room);
        return { rotation: [0, pl.angle, 0], position: [pl.origin[0] * MM, pl.origin[1] * MM, pl.origin[2] * MM] };
    }

    // geometries of a previous build are freed as soon as a new one replces them
    $effect(() =>
    {
        const current = specs;
        return () =>
        {
            for (const s of current)
            {
                s.geometry.dispose();
            }
        };
    });

    // photos imported for a decor, decoded once per file and bytes, freed when replaced or dropped
    interface Photo
    {
        bytes: Uint8Array;
        tex: THREE.Texture;
        version: number;
    }
    let photos = $state.raw(new Map<string, Photo>());
    let loads = 0;
    const decoding = new Set<Uint8Array>();


    async function decode(file: string, bytes: Uint8Array): Promise<void>
    {
        if (decoding.has(bytes))
        {
            return;
        }
        decoding.add(bytes);
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: photoMime(file) }));
        try
        {
            const tex = await new THREE.TextureLoader().loadAsync(url);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            const next = new Map(photos);
            next.get(file)?.tex.dispose();
            loads++;
            next.set(file, { bytes, tex, version: loads });
            photos = next;
        }
        catch (e)
        {
            console.warn("systeme-32 : photo illisible", file, e);
            app.notify("Photo illisible par le navigateur. En importer une autre, en JPEG ou PNG.", "warning");
        }
        finally
        {
            URL.revokeObjectURL(url);
            decoding.delete(bytes);
        }
    }

    $effect(() =>
    {
        const wanted = new Set<string>();
        for (const t of Object.values(app.project.textures))
        {
            wanted.add(t.file);
            const bytes = app.textures.get(t.file);
            if (bytes !== undefined && untrack(() => { return photos.get(t.file)?.bytes; }) !== bytes)
            {
                void decode(t.file, bytes);
            }
        }
        const current = untrack(() => { return photos; });
        let dropped = false;
        const kept = new Map<string, Photo>();
        for (const [file, photo] of current)
        {
            if (wanted.has(file))
            {
                kept.set(file, photo);
            }
            else
            {
                photo.tex.dispose();
                dropped = true;
            }  
        }
        if (dropped)
        {
            photos = kept;
        }
    });


    const materials = new Map<string, THREE.MeshStandardMaterial>();


    function material(decor: string, colour: string | null): THREE.MeshStandardMaterial
    {
        const user = colour === null ? app.project.textures[decor] : undefined;
        const photo = user === undefined ? undefined : photos.get(user.file);
        const tag = user === undefined || photo === undefined ? "" : `${photo.version}@${user.tileMm}`;
        const key = `${decor}|${colour ?? ""}|${tag}`;
        const hit = materials.get(key);
        if (hit !== undefined)
        {
            return hit;
        }
        const d = decorById(decor);
        let map = colour === null ? decorTexture(d) : null;
        if (user !== undefined && photo !== undefined) 
        {
            // extrude UVs are in millimetres of the shape : one photo every tileMm, like the procedural tiles
            map = photo.tex;
            map.repeat.set(1 / user.tileMm, 1 / user.tileMm);
        }
        const m = new THREE.MeshStandardMaterial({
            color: map !== null ? 0xffffff : colour ?? new THREE.Color(d.rgb[0] / 255, d.rgb[1] / 255,
                                                                       d.rgb[2] / 255).convertSRGBToLinear(),
            map,
            roughness: 0.72,
            metalness: 0,
            side: THREE.DoubleSide,
        });
        materials.set(key, m);
        return m;
    }

    const screenGeo = $derived(app.project.screen === null ? null : screenMesh(app.project.screen));
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.3 });


    // the fabric is not chosen yet : a plain neutral cushion
    const cushions = $derived.by(() =>
    {
        const list: { key: string; wall: Wall; geometry: THREE.BufferGeometry }[] = [];
        for (const it of app.project.items)
        {
            const geometry = it.kind === "carcass" ? cushionMesh(it) : null;
            if (geometry !== null)
            {
                list.push({ key: it.id, wall: it.wall, geometry });
            }
        }
        return list;
    });
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 1 });

    // rails and LED profiles follow the layouts of the analysis
    const fittings = $derived.by(() =>
    {
        const list: { key: string; wall: Wall; light: boolean; geometry: THREE.BufferGeometry }[] = [];
        for (const it of app.project.items)
        {
            const lay = it.kind === "carcass" ? build.layouts.get(it.id) : undefined;
            if (it.kind === "carcass" && lay !== undefined)
            {
                for (const f of fittingMeshes(it, lay))
                {
                    list.push({ ...f, wall: it.wall });
                }
            }
            if (it.kind === "ladder")
            {
                ladderMeshes(it).forEach((geometry, k) =>
                {
                    list.push({ key: `${it.id}/${k}`, wall: it.wall, light: false, geometry });
                });
            }
        }
        return list;
    });
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.8, roughness: 0.3 });
    // a plain warm white, not a rendering of the colour temperature chosen
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xfff4e0, emissiveIntensity: 0.8 });
    $effect(() =>
    {
        const current = fittings;
        return () =>
        {
            for (const f of current)
            {
                f.geometry.dispose();
            }
        };
    });
    $effect(() =>
    {
        const current = cushions;
        return () =>
        {
            for (const c of current)
            {
                c.geometry.dispose();
            }
        };
    });


    // frame the composition when a project opens, never on every edit
    const frame = $derived.by(() =>
    {
        void app.project.id;
        return untrack(computeFrame);
    });


    // grid colours follow the design system tokens of the current theme
    const css = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    const gridCell = css?.getPropertyValue("--colour-border").trim() || "#46372c";
    const gridSection = css?.getPropertyValue("--colour-text-secondary").trim() || "#a5988a";

    function computeFrame(): { target: [number, number, number]; camera: [number, number, number] }  
    {
        const box = new THREE.Box3();
        for (const it of app.project.items)
        {
            const b = roomBox(it, app.project.room);
            box.union(new THREE.Box3(new THREE.Vector3(...b.min).multiplyScalar(MM),
                                     new THREE.Vector3(...b.max).multiplyScalar(MM)));
        }
        if (box.isEmpty())
        {
            box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 0.5));
        }
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.y) * 1.6 + 1;
        return { target: [c.x, c.y, c.z], camera: [c.x + dist * 0.35, c.y + dist * 0.2, c.z + dist] };
    }
</script>

<T.PerspectiveCamera makeDefault position={frame.camera} fov={40} near={0.05} far={100}>
    <OrbitControls target={frame.target} enableDamping maxPolarAngle={Math.PI * 0.49} />
</T.PerspectiveCamera>

<T.HemisphereLight args={[0xffffff, 0x444444, 0.9]} />
<T.DirectionalLight position={[3, 5, 4]} intensity={1.6} />
<T.DirectionalLight position={[-4, 3, 2]} intensity={0.5} />

<Grid plane="xz" cellSize={100 * MM} sectionSize={1000 * MM} gridSize={[12, 12]} fadeDistance={14}
    cellColor={gridCell} sectionColor={gridSection} />

{#each app.project.items as it (it.id)}
    {@const pl = placement(it.wall)}
    <T.Group rotation={pl.rotation} position={pl.position}>
        {#each byItem.get(it.id) ?? [] as s (s.key)}
            <T.Mesh geometry={s.geometry} material={material(s.decor, s.colour)} />
        {/each}
    </T.Group>
{/each}

{#each cushions as c (c.key)}
    {@const pl = placement(c.wall)}
    <T.Mesh geometry={c.geometry} material={cushionMat} rotation={pl.rotation} position={pl.position} />
{/each}
{#each fittings as f (f.key)}
    {@const pl = placement(f.wall)}
    <T.Mesh geometry={f.geometry} material={f.light ? ledMat : tubeMat} rotation={pl.rotation} position={pl.position} />
{/each}

{#if screenGeo !== null}
    <T.Mesh geometry={screenGeo} material={screenMat} />
{/if}
