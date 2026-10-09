<script lang="ts">
    import { T } from "@threlte/core";
    import { OrbitControls, Grid, interactivity, type IntersectionEvent } from "@threlte/extras";
    import { REST, movers, openPose, type Pose } from "../view3d/motions";
    import * as THREE from "three";
    import { untrack } from "svelte";
    import { MediaQuery } from "svelte/reactivity";
    import { app } from "./app_state.svelte";
    import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
    import { armMesh, armZoneMesh, cushionMesh, deviceMeshes, fittedMeshes, fittingMeshes, ladderMeshes, partMeshes,
             screenMesh, MM, type DeviceSkin, type FittingMesh, type MeshSpec } from "../view3d/meshes";
    import { spotClashes, spotFor } from "../core/tv_arm";
    import { kelvinColour } from "../view3d/kelvin";
    import { roomBox, sideWallDepth, wallPlacement } from "../core/room";
    import type { Wall } from "../core/model";
    import type { Purpose } from "../core/part_types";
    import { decorTexture } from "../view3d/textures";
    import { decorById } from "../data/materials";
    import { photoMime } from "../core/photos";


    const build = $derived(app.outputs.analysis.build);

    // every part holds its own lacquer colour, fronts, dividers and linings alike
    const specs = $derived(partMeshes(build.parts));

    // what each part and each fixed piece of hardware moves with : all the motions to know what a click opens
    // the open ones to pose the meshes
    const anyMotion = $derived(movers(build.motions, build.fitted, () =>
    {
        return true;
    }));
    const openMotion = $derived(movers(build.motions, build.fitted, (m) =>
    {
        return app.isOpen(m.front);
    }));
    function poseOf(key: string | null): Pose
    {
        const m = key === null ? undefined : openMotion.get(key);
        return m === undefined ? REST : openPose(m);
    }
    interactivity();

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
        // the decor photos and the pictures printed on cell backs, decoded the same way
        const files = [...Object.values(app.project.textures).map((t) => { return t.file; }),
                       ...build.prints.map((x) => { return x.file; })];
        for (const file of files)
        {
            wanted.add(file);
            const bytes = app.textures.get(file);
            if (bytes !== undefined && untrack(() => { return photos.get(file)?.bytes; }) !== bytes)
            {
                void decode(file, bytes);
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
        // boards turn see-through while the hardware inside is shown
        const see = app.showHardware;
        const key = `${decor}|${colour ?? ""}|${tag}|${see}`;
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
            transparent: see,
            opacity: see ? 0.22 : 1,
            depthWrite: !see,
        });
        materials.set(key, m);
        return m;
    }

    // the screen where the arm slider puts it, the arm from its plate, and the ring the arm can reach
    const pose = $derived(app.project.screen === null ? null : spotFor(app.project.screen, app.armSpot));
    // the set turns red as long as it is in something, the names are given in the toggles
    const clashing = $derived(pose !== null && spotClashes(app.project, pose).length > 0);
    const screenGeo = $derived(app.project.screen === null || pose === null ? null
        : screenMesh(app.project.screen, pose));
    const armGeo = $derived(app.project.screen === null || pose === null ? null : armMesh(app.project.screen, pose));
    const zoneGeo = $derived(app.project.screen === null || !app.showArmZone ? null : armZoneMesh(app.project.screen));
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.3 });
    // --colour-danger of the design system, the set in something
    const clashMat = new THREE.MeshStandardMaterial({ color: 0xc84555, roughness: 0.3 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.6, roughness: 0.4 });
    const zoneMat = new THREE.MeshBasicMaterial({ color: 0x1f6fd1, transparent: true, opacity: 0.18,
                                                  side: THREE.DoubleSide, depthWrite: false });
    $effect(() =>
    {
        const current = [armGeo, zoneGeo];
        return () =>
        {
            for (const g of current)
            {
                g?.dispose();
            }
        };
    });
    // the colours of the appliances themselves : a block in the black of the screen, an amplifier in black tolex
    // with its grille cloth and brass plate
    const deviceMats: Record<DeviceSkin, Record<"block" | "amplifier", THREE.MeshStandardMaterial>> = {
        body: { block: screenMat, amplifier: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.85 }) },
        grille: { block: screenMat, amplifier: new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 1 }) },
        brass: { block: screenMat, amplifier: new THREE.MeshStandardMaterial({ color: 0xb08d3e, metalness: 0.7,
                                                                              roughness: 0.35 }) },
    };
    const devices = $derived(app.project.items.flatMap((it) =>
    {
        if (it.kind !== "device")
        {
            return [];
        }
        return deviceMeshes(it).map((m, k) =>
        {
            return { key: `${it.id}/${k}`, wall: it.wall, geometry: m.geometry,
                     material: deviceMats[m.skin][it.look ?? "block"] };
        });
    }));
    $effect(() =>
    {
        const current = devices;
        return () =>
        {
            for (const d of current)
            {
                d.geometry.dispose();
            }
        };
    });
    $effect(() =>
    {
        const current = screenGeo;
        return () =>
        {
            current?.dispose();
        };
    });


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

    // hardware of the build : the feet always, what hides inside the carcasses once asked for
    const hardware = $derived.by(() =>
    {
        const walls = new Map(app.project.items.map((it) =>
        {
            return [it.id, it.wall];
        }));
        const list: { key: string; wall: Wall; hidden: boolean; purpose: Purpose | null;
                      geometry: THREE.BufferGeometry }[] = [];
        const purposes = new Map(build.fitted.map((f) =>
        {
            return [f.key, f.purpose];
        }));
        for (const m of fittedMeshes(build.fitted))
        {
            list.push({ ...m, wall: walls.get(m.item) ?? "back", purpose: purposes.get(m.key) ?? null });
        }
        return list;
    });
    // AXILO feet in the black plastic Häfele sells, runner spaces in the accent colour as a reserved volume
    const footMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const spaceMat = new THREE.MeshStandardMaterial({ color: 0x1c7aaf, transparent: true, opacity: 0.35,
                                                      depthWrite: false });
    function hardwareMat(purpose: Purpose | null): THREE.MeshStandardMaterial
    {
        if (purpose === "foot" || purpose === "foot-pad" || purpose === "foot-mount")
        {
            return footMat;
        }
        return purpose === "runner" ? spaceMat : tubeMat;
    }
    $effect(() =>
    {
        const current = hardware;
        return () =>
        {
            for (const f of current)
            {
                f.geometry.dispose();
            }
        };
    });

    // rails and LED profiles follow the layouts of the analysis
    const fittings = $derived.by(() =>
    {
        const list: (FittingMesh & { wall: Wall })[] = [];
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
                    list.push({ key: `${it.id}/${k}`, wall: it.wall, light: false, kelvin: null, geometry });
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

    // with the LEDs on, each strip or spot casts its light down from its own face, at its colour temperature
    RectAreaLightUniformsLib.init();
    const ledLights = $derived.by(() =>
    {
        const list: { key: string; wall: Wall; centre: [number, number, number]; w: number; d: number;
                      colour: THREE.Color }[] = [];
        for (const f of fittings)
        {
            if (!f.light || f.kelvin === null)
            {
                continue;
            }
            f.geometry.computeBoundingBox();
            const box = f.geometry.boundingBox!;
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const [r, g, bl] = kelvinColour(f.kelvin);
            list.push({ key: f.key, wall: f.wall, centre: [c.x, box.min.y - 0.001, c.z], w: size.x, d: size.z,
                        colour: new THREE.Color(r, g, bl) });
        }
        return list;
    });
    // a printed picture : a sheet stretched once over the back of its cell, a hair in front of it, lit like a board
    const prints = $derived.by(() =>
    {
        const walls = new Map(app.project.items.map((it) =>
        {
            return [it.id, it.wall];
        }));
        return build.prints.map((x) =>
        {
            const geometry = new THREE.PlaneGeometry(x.w * MM, x.h * MM);
            geometry.translate((x.x + x.w / 2) * MM, (x.y + x.h / 2) * MM, (x.z + 0.3) * MM);
            return { key: `${x.item}/${x.cell}`, wall: walls.get(x.item) ?? "back", file: x.file, geometry };
        });
    });
    $effect(() =>
    {
        const current = prints;
        return () =>
        {
            for (const x of current)   
            {
                x.geometry.dispose();
            }
        };
    });
    const printMats = new Map<string, THREE.MeshStandardMaterial>();


    function printMaterial(file: string): THREE.MeshStandardMaterial | null
    {
        const photo = photos.get(file);   
        if (photo === undefined)
        {
            return null;
        }
        const key = `${file}@${photo.version}`;
        let m = printMats.get(key); 
        if (m === undefined)
        {
            // its own copy of the texture : a decor photo repeats per millimetre, a print shows oce
            const map = photo.tex.clone();
            map.repeat.set(1, 1);
            map.needsUpdate = true;
            m = new THREE.MeshStandardMaterial({ map, roughness: 0.6 });
            printMats.set(key, m);
        }
        return m;  
    }

    // the room dimmed to a fifth, the way a lit niche is looked at in the evening
    const dim = $derived(app.ledsOn ? 0.2 : 1);
    // a rendering exposure set by eye against the lights of this scene, which are not photometric either : a real
    // strip of 1400 lm/m behind 18 mm of diffuser is near 25 000 cd/m2 and would only burn the picture white
    const LED_NITS = 14;
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


    // grid colours follow the design system tokens, read again when the system theme flips
    const dark = new MediaQuery("prefers-color-scheme: dark");
    const grid = $derived.by(() =>
    {
        void dark.current;
        const css = getComputedStyle(document.documentElement);
        return { cell: css.getPropertyValue("--colour-border").trim() || "#46372c",
                 section: css.getPropertyValue("--colour-text-secondary").trim() || "#a5988a" };
    });

    // the walls and the ceiling only show the room : one face each, towards the inside, gone once the camera is out
    const sideWalls = $derived(new Set(app.project.items.map((it) =>
    {
        return it.wall;
    })));
    const roomTint = $derived.by(() =>
    {
        void dark.current;
        const css = getComputedStyle(document.documentElement);
        return { wall: css.getPropertyValue("--colour-bg-surface-raised").trim() || "#372b24",
                 ceiling: css.getPropertyValue("--colour-bg-surface-hover").trim() || "#2d231d" };
    });

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

<T.HemisphereLight args={[0xffffff, 0x444444, 0.9]} intensity={0.9 * dim} />
<T.DirectionalLight position={[3, 5, 4]} intensity={1.6 * dim} />
<T.DirectionalLight position={[-4, 3, 2]} intensity={0.5 * dim} />
{#if app.ledsOn}
    {#each ledLights as l (l.key)}
        {@const pl = placement(l.wall)}
        <T.Group rotation={pl.rotation} position={pl.position}>
            <!-- a rect area light faces its local -z : turned a quarter about x it shines down -->
            <T.RectAreaLight position={l.centre} rotation={[-Math.PI / 2, 0, 0]} width={l.w} height={l.d}
                color={l.colour} intensity={LED_NITS} />
        </T.Group>
    {/each}
{/if}

<Grid plane="xz" cellSize={100 * MM} sectionSize={1000 * MM} gridSize={[12, 12]} fadeDistance={14}
    cellColor={grid.cell} sectionColor={grid.section} />

{#if app.showRoom}
    {@const r = app.project.room}
    <T.Mesh position={[r.width / 2 * MM, r.height / 2 * MM, 0]}>
        <T.PlaneGeometry args={[r.width * MM, r.height * MM]} />
        <T.MeshStandardMaterial color={roomTint.wall} side={THREE.FrontSide} />
    </T.Mesh>
    <T.Mesh position={[r.width / 2 * MM, r.height * MM, r.depth / 2 * MM]} rotation={[Math.PI / 2, 0, 0]}>
        <T.PlaneGeometry args={[r.width * MM, r.depth * MM]} />
        <!-- facing down it gets none of the light from above : a flat colour, it only marks the room -->
        <T.MeshBasicMaterial color={roomTint.ceiling} side={THREE.FrontSide} />
    </T.Mesh>
    <!-- the returns of an alcove frame it whatever stands against them -->
    {#if sideWalls.has("left") || r.returns !== undefined}
        {@const d = sideWallDepth(r, "left")}
        <T.Mesh position={[0, r.height / 2 * MM, d / 2 * MM]} rotation={[0, Math.PI / 2, 0]}>
            <T.PlaneGeometry args={[d * MM, r.height * MM]} />
            <T.MeshStandardMaterial color={roomTint.wall} side={THREE.FrontSide} />
        </T.Mesh>
    {/if}
    {#if sideWalls.has("right") || r.returns !== undefined}
        {@const d = sideWallDepth(r, "right")}
        <T.Mesh position={[r.width * MM, r.height / 2 * MM, d / 2 * MM]} rotation={[0, -Math.PI / 2, 0]}>
            <T.PlaneGeometry args={[d * MM, r.height * MM]} />
            <T.MeshStandardMaterial color={roomTint.wall} side={THREE.FrontSide} />
        </T.Mesh>
    {/if}
{/if}

{#each app.project.items as it (it.id)}
    {@const pl = placement(it.wall)}
    <T.Group rotation={pl.rotation} position={pl.position}>
        {#each byItem.get(it.id) ?? [] as s (s.key)}
            {@const pose = poseOf(s.part)}
            {@const mover = s.part === null ? undefined : anyMotion.get(s.part)}
            <T.Group quaternion={pose.quaternion} position={pose.position}>
                <T.Mesh geometry={s.geometry} material={material(s.decor, s.colour)}
                    onclick={(e: IntersectionEvent<MouseEvent>) =>
                    {
                        if (mover !== undefined)
                        {
                            e.stopPropagation();
                            app.flipFront(mover.front);
                        }
                    }} />
            </T.Group>
        {/each}
    </T.Group>
{/each}

{#each prints as x (x.key)}
    {@const m = printMaterial(x.file)}
    {#if m !== null}
        {@const pl = placement(x.wall)}
        <T.Mesh geometry={x.geometry} material={m} rotation={pl.rotation} position={pl.position} />
    {/if}   
{/each}


{#each cushions as c (c.key)}
    {@const pl = placement(c.wall)}
    <T.Mesh geometry={c.geometry} material={cushionMat} rotation={pl.rotation} position={pl.position} />
{/each}
{#each hardware as f (f.key)}
    {#if !f.hidden || app.showHardware}
        {@const pl = placement(f.wall)}
        {@const pose = poseOf(f.key)}
        <T.Group rotation={pl.rotation} position={pl.position}>
            <T.Group quaternion={pose.quaternion} position={pose.position}>
                <T.Mesh geometry={f.geometry} material={hardwareMat(f.purpose)} />
            </T.Group>
        </T.Group>
    {/if}
{/each}
{#each fittings as f (f.key)}
    {@const pl = placement(f.wall)}
    <T.Mesh geometry={f.geometry} material={f.light ? ledMat : tubeMat} rotation={pl.rotation} position={pl.position} />
{/each}

{#if screenGeo !== null}
    <T.Mesh geometry={screenGeo} material={clashing ? clashMat : screenMat} />
{/if}
{#if armGeo !== null}
    <T.Mesh geometry={armGeo} material={armMat} />
{/if}
{#if zoneGeo !== null}
    <T.Mesh geometry={zoneGeo} material={zoneMat} />
{/if}
{#each devices as d (d.key)}
    {@const pl = placement(d.wall)}
    <T.Mesh geometry={d.geometry} material={d.material} rotation={pl.rotation} position={pl.position} />
{/each}
