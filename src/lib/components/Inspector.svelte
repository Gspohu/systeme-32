<script lang="ts">
    import { app } from "./app_state.svelte";
    import { checked, num, str } from "./events";
    import PhotoPicker from "./PhotoPicker.svelte";
    import PrintPicker from "./PrintPicker.svelte";  
    import { slatLayout } from "../core/slats";
    import {
        removeItem, duplicateItem, updateItem, setFront, removeFront, updateFront, mergeFronts, splitFront, splitCell,
        removeDivider,
        moveDivider, setDividerKind, setDividerFinish, setDividerThickness, distributeEvenly, setCellSize, setLining,
        setRail, setLight, setEnd,
        setShoeRack, setModularCell, addOutlet, updateOutlet, removeOutlet, toSliding, toDoor,
    } from "../core/commands";
    import { byId } from "../core/edit";
    import { MIN_CELL, findNode, findParent } from "../core/layout";
    import { topAngle } from "../core/slope";
    import { DIAM } from "../core/text";
    import { BOARD_THICKNESSES, DECORS, MATERIALS, decorById } from "../data/materials";
    import { HARDWARE, SHELF_SUPPORTS } from "../data/hardware";
    import { DEFAULT_BATTENS } from "../core/factory";
    import { PANEL_MARGIN } from "../core/cutouts";
    import type { Base, BackMount, Carcass, CurveTechnique, End, Front, FrontSpec, Item, Wall } from "../core/model";


    function frontOn(c: Carcass, node: string): Front | null
    {
        for (const f of c.fronts)
        {
            if (f.node === node)
            {
                return f;
            }
        }
        return null;
    }


    const sel = $derived(app.selection);
    const item = $derived(sel === null ? null : byId(app.project.items, sel.item) ?? null);
    const carcass = $derived(item !== null && item.kind === "carcass" ? item : null);
    const layout = $derived(carcass === null ? undefined : app.outputs.analysis.build.layouts.get(carcass.id));   


    function patch(p: Partial<Item>): void
    {
        if (item !== null)
        {
            app.apply(updateItem<Item>, item.id, p);
        }
    } 


    const front = $derived(sel !== null && sel.kind === "front" && carcass !== null
        ? byId(carcass.fronts, sel.front) ?? null : null);
    const nodeId = $derived(sel === null ? null : sel.kind === "node" ? sel.node : sel.kind === "front" &&
                            front !== null ? front.node : null);
    const nodeBox = $derived(nodeId === null || layout === undefined ? null : layout.nodes.get(nodeId) ?? null);
    const nodeFront = $derived(carcass === null || nodeId === null ? null : frontOn(carcass, nodeId));
    const parentId = $derived(carcass === null || nodeId === null ? null : findParent(carcass.root, nodeId)?.id ?? null);
    const lining = $derived.by(() =>
    {
        if (carcass === null || nodeId === null)
        {
            return null;
        }
        for (const l of carcass.linings)
        {
            if (l.cell === nodeId)
            {
                return l;
            }
        }
        return null;
    });

    // hardware chosen for the panels of the selected front
    const frontHardware = $derived.by(() =>
    {
        const build = app.outputs.analysis.build;
        const found: typeof build.hardware = [];
        if (front === null || carcass === null)
        {
            return found;
        }
        const panelIds = new Set<string>();
        for (const p of build.fronts.get(carcass.id) ?? [])
        {
            if (p.front === front.id)
            {
                panelIds.add(p.id);
            }
        }
        for (const h of build.hardware)
        {
            if (h.item === carcass.id && (h.target === front.id || (h.target !== null && panelIds.has(h.target))))
            {
                found.push(h);
            }
        }
        return found;
    });

    type FrontKind = "none" | "door" | "doubleDoor" | "drawers" | "sliding" | "lift" | "panel";
    const FRONT_KINDS: [FrontKind, string][] = [["none", "Aucune"], ["door", "Porte"], ["doubleDoor", "Double"],
                                                ["drawers", "Tiroirs"], ["sliding", "Coulissant"],
                                                ["lift", "Abattant"], ["panel", "Fixe"]];

    function specFor(kind: FrontKind, hingeHint: "left" | "right"): FrontSpec | null
    {
        if (kind === "door")
        {
            return { type: "door", hinge: hingeHint };
        }
        if (kind === "doubleDoor")
        {
            return { type: "doubleDoor" };
        }  
        if (kind === "drawers")
        {
            return { type: "drawers", count: 3, loadKg: 10 };
        }
        if (kind === "lift")
        {
            return { type: "lift", handleKg: 0 };
        }
        if (kind === "panel")
        {
            return { type: "panel", cutout: "none", margin: PANEL_MARGIN };
        }
        if (kind === "sliding" && nodeBox !== null && carcass !== null)  
        {
            return { type: "sliding", leaves: 1, leafWidth: Math.round((nodeBox.w + 2 * carcass.thickness) / 2),
                     damped: true };
        }
        return null;
    }

    function setKind(kind: FrontKind): void
    {
        if (carcass === null || nodeId === null)
        {
            return;
        }
        const existing = nodeFront;
        if (kind === "none")
        {
            if (existing !== null)
            {
                app.apply(removeFront, carcass.id, existing.id);
            }
            return;
        }
        if (existing !== null && kind === "sliding" && existing.spec.type === "door")
        {
            app.apply(toSliding, carcass.id, existing.id);
            return;
        }
        if (existing !== null && kind === "door" && existing.spec.type === "sliding")
        {
            app.apply(toDoor, carcass.id, existing.id);
            return;
        }
        const spec = specFor(kind, "left");
        if (spec !== null)
        {
            // the derived node reads null once the command has replaced the selected front
            const node = nodeId;
            const cid = carcass.id;
            const keep = existing === null ? {} : { decor: existing.decor, colour: existing.colour,
                                                   colourName: existing.colourName, opening: existing.opening,
                                                   mount: kind === "lift" ? "overlay" as const : existing.mount };
            if (app.apply(setFront, cid, node, spec, keep))
            {
                const f = frontOn(byId(app.project.items, cid) as Carcass, node);
                if (f !== null)
                {
                    app.selection = { kind: "front", item: cid, front: f.id };
                }
            }
        }
    }

    function frontPatch(p: Partial<Front>): void
    {
        if (carcass !== null && front !== null)
        {
            app.apply(updateFront, carcass.id, front.id, p);
        }
    }


    function splitMiddle(axis: "h" | "v", kind: "fixed" | "adjustable"): void 
    {
        if (carcass === null || nodeBox === null || nodeBox.kind !== "cell")
        {
            app.notify("Choisir une case sans séparation pour la recouper.", "warning");
            return;
        }
        const middle = axis === "h" ? nodeBox.y + nodeBox.h / 2 : nodeBox.x + nodeBox.w / 2;
        app.apply(splitCell, carcass.id, nodeBox.id, axis, middle - carcass.thickness / 2, kind);
    }


    function setBaseType(t: Base["type"]): void
    {
        let base: Base;
        if (t === "plinth")
        {
            base = { type: "plinth", height: 100, setback: 50 };
        }
        else if (t === "feet")
        {
            base = { type: "feet", height: 100 };
        }
        else if (t === "wall")
        {
            base = { type: "wall" };
        }
        else
        {
            base = { type: "floor" };
        }
        patch({ base } as Partial<Carcass>);
    }


    function setBackType(t: BackMount["type"]): void
    {
        let back: BackMount;
        if (t === "applied")
        {
            back = { type: "applied", thickness: 8 };
        }
        else if (t === "groove")
        {
            back = { type: "groove", thickness: 8, offset: 16, depth: 8 };
        }
        else
        {
            back = { type: "none" };
        }
        patch({ back } as Partial<Carcass>);
    } 

    function endPatch(side: "left" | "right", p: Partial<Extract<End, { type: "rounded" }>> | "square" | "rounded"): void
    {
        if (carcass === null)
        {
            return;
        }
        const cur = carcass.ends[side];
        let next: End;
        if (p === "square")
        {
            next = { type: "square" };
        } 
        else if (p === "rounded")
        {
            next = { type: "rounded", radius: Math.min(300, carcass.depth), sweep: 90, technique: "battens",
                    flexThickness: 9, battens: DEFAULT_BATTENS, decor: carcass.decor };
        }
        else if (cur.type === "rounded")
        {
            next = { ...cur, ...p };
        }
        else
        {
            return;
        }
        app.apply(setEnd, carcass.id, side, next);
    }

    const LADDER_FIELDS: [string, "width" | "y" | "z" | "railDiameter" | "ladderWidth" | "ladderAt"][] = [
        ["Rail (mm)", "width"], ["Axe du rail (mm)", "y"], ["Distance au mur", "z"], ["Diamètre du rail",
            "railDiameter"],
        ["Largeur échelle", "ladderWidth"], ["Position échelle", "ladderAt"],
    ];

    const panelDecors: typeof DECORS = [];
    // slats also come in solid owod, never cut out of a sheet, and an adjustable shelf may be glass
    const slatDecors: typeof DECORS = [];
    const shelfDecors: typeof DECORS = [];
    for (const d of DECORS)
    {
        const kind = MATERIALS[d.material]?.kind;
        if (kind === "melamine" || kind === "mdf")
        {
            panelDecors.push(d);
        }
        if (kind === "melamine" || kind === "mdf" || kind === "solid")
        {
            slatDecors.push(d);
        }
        if (kind === "melamine" || kind === "mdf" || kind === "glass")
        {
            shelfDecors.push(d);
        }
    }

    // A refused command leaves the store as it was : the field gets back what it showed when entered
    // Rebuilding the whole inspector on each refusal lost the focus, and on GitHub runners never happened
    type Entered = { field: HTMLInputElement | HTMLSelectElement; value: string; checked: boolean; refusals: number };
    let entered: Entered | null = null;

    function remember(e: FocusEvent): void
    {
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement)
        {
            entered = { field: t, value: t.value, checked: t instanceof HTMLInputElement && t.checked,
                        refusals: app.refusals };
        }
    }

    function restoreRefused(e: Event): void
    {
        if (entered === null || e.target !== entered.field)
        {
            return;
        }
        const f = entered.field;
        if (app.refusals !== entered.refusals)
        {
            // reading value first makes a number field commit what its editor holds, a blind write
            // was overwritten by the pending "-5" on GitHub runners
            if (f.value !== entered.value)
            {
                f.value = entered.value;
            }
            if (f instanceof HTMLInputElement && (f.type === "checkbox" || f.type === "radio"))
            {
                f.checked = entered.checked;
            }
            entered.refusals = app.refusals;
        }
        else
        {
            entered.value = f.value;
            entered.checked = f instanceof HTMLInputElement && f.checked;
        }
    }
</script>

<!-- the field handlers run first, the delegated change reaches this container after them -->
<div class="inspector-body" onfocusin={remember} onchange={restoreRefused}>
    {#if sel === null || item === null}
        <div class="empty-state">
            <div class="empty-state-title">Rien de sélectionné</div>
            <div class="empty-state-description">Toucher un meuble, une case, une façade ou une séparation.</div>
        </div>
    {:else}
        {#if sel.kind === "divider" && carcass !== null}
            {@const sp = findNode(carcass.root, sel.split)}
            {#if sp !== null && sp.kind === "split"}
                <div class="section-title">{sp.axis === "h" ? "Tablette" : "Montant"}</div>
                <label class="field"><span class="label">Position (mm)</span>
                    <input class="input" type="number" step="1" value={Math.round(sp.cuts[sel.index] ?? 0)}
                        onchange={(e) =>
                        {
                            const nb = layout?.nodes.get(sp.id);
                            if (nb !== undefined)
                            {
                                const from = sp.axis === "h" ? nb.y : nb.x;
                                app.apply(moveDivider, carcass.id, sp.id, sel.index, from + num(e), true);
                            }
                        }} />
                </label>
                {#if sp.axis === "h"}
                    <div class="segmented">
                        <button class="segmented-item" class:active={sp.dividers[sel.index] === "fixed"}
                            onclick={() => app.apply(setDividerKind, carcass.id, sp.id, sel.index,
                                                     "fixed")}>Fixe</button>
                        <button class="segmented-item" class:active={sp.dividers[sel.index] === "adjustable"}
                            onclick={() => app.apply(setDividerKind, carcass.id, sp.id, sel.index,
                                                     "adjustable")}>Réglable</button>
                    </div>
                {/if}
                {@const finish = sp.finishes[sel.index] ?? null}
                <label class="field"><span class="label">Décor</span>
                    <select class="select" value={finish?.decor ?? ""}
                        onchange={(e) => app.apply(setDividerFinish, carcass.id, sp.id, sel.index,
                                                   str(e) === "" ? null : { decor: str(e),
                                                       colour: finish?.colour ?? null })}>
                        <option value="">Comme le caisson</option>
                        {#each sp.axis === "h" && sp.dividers[sel.index] === "adjustable" ? shelfDecors : panelDecors as d}
                            <option value={d.id}>{d.ref} {d.label}</option>
                        {/each}
                    </select>
                </label>
                {#if finish !== null && finish.decor === "MDF_LAQUE"}
                    <label class="field"><span class="label">Teinte</span>
                        <input class="input" type="color" value={finish.colour ?? "#e6e2da"}
                            onchange={(e) => app.apply(setDividerFinish, carcass.id, sp.id, sel.index,
                                                       { ...finish, colour: str(e) })} />
                    </label>
                {/if}
                {#if sp.axis === "h" && (finish === null || decorById(finish.decor).thickness === undefined)}
                    {@const own = sp.thicknesses[sel.index] ?? null}
                    <label class="field"><span class="label">Épaisseur</span>
                        <select class="select" value={own === null ? "" : String(own)}
                            onchange={(e) => app.apply(setDividerThickness, carcass.id, sp.id, sel.index,
                                                       str(e) === "" ? null : Number(str(e)))}>
                            <option value="">Comme le caisson ({carcass.shelfThickness ?? carcass.thickness} mm)</option>
                            {#each BOARD_THICKNESSES as t}<option value={String(t)}>{t} mm</option>{/each}
                        </select>
                    </label>
                {/if}
                <div class="row">
                    <button class="btn btn-danger" onclick={() =>
                    {
                        if (app.apply(removeDivider, carcass.id, sp.id, sel.index))
                        {
                            app.selection = { kind: "item", item: carcass.id };
                        }
                    }}>Supprimer</button>
                </div>
            {/if} 
        {/if}


        {#if (sel.kind === "node" || sel.kind === "front") && carcass !== null && nodeBox !== null}
            <div class="section-title">Zone {Math.round(nodeBox.w)} x {Math.round(nodeBox.h)} mm</div>
            <label class="field"><span class="label">Façade</span>
                <select class="select" value={nodeFront === null ? "none" : nodeFront.spec.type}
                    onchange={(e) => setKind(str(e) as FrontKind)}>
                    {#each FRONT_KINDS as [k, label]}<option value={k}>{label}</option>{/each}
                </select>
            </label>
            {@const parentNode = parentId === null ? null : findNode(carcass.root, parentId)}
            {#if parentNode !== null && parentNode.kind === "split"}
                <label class="field" title="La séparation voisine se déplace pour donner exactement cette taille">
                    <span class="label">{parentNode.axis === "h" ? "Hauteur (mm)" : "Largeur (mm)"}</span>
                    <input class="input" type="number" min={MIN_CELL} step="1"
                        value={Math.round(parentNode.axis === "h" ? nodeBox.h : nodeBox.w)}
                        onchange={(e) => app.apply(setCellSize, carcass.id, nodeBox.id, num(e))} />
                </label>
            {/if}
            <div class="row">
                {#if nodeBox.kind === "split"}
                    <button class="btn btn-secondary" title="Toutes les cases de la zone à la même taille"
                        onclick={() => app.apply(distributeEvenly, carcass.id, nodeBox.id)}>Répartir également</button>
                {/if}
                {#if parentId !== null}
                    <button class="btn btn-secondary"
                        title="Sélectionne la zone qui englobe celle-ci, pour y poser une seule façade"
                        onclick={() => (app.selection = { kind: "node", item: carcass.id,
                                                         node: parentId })}>Zone parente</button>
                {/if}
                {#if nodeBox.kind === "cell"}
                    <button class="btn btn-secondary" onclick={() => splitMiddle("h", "fixed")}>+ Tablette</button>
                    <button class="btn btn-secondary" onclick={() => splitMiddle("h", "adjustable")}>+ Étagère</button>
                    <button class="btn btn-secondary" onclick={() => splitMiddle("v", "fixed")}>+ Montant</button>
                {/if}
            </div>
            {#if nodeBox.kind === "cell"}
                <label class="form-check">
                    <input type="checkbox" checked={lining !== null}  
                        onchange={(e) => app.apply(setLining, carcass.id, nodeBox.id, checked(e)
                            ? { decor: "H1180_ST37", colour: null, thickness: 8,
                                faces: { back: true, left: true, right: true, top: true, bottom: true } }
                            : null)} />
                    Habillage intérieur
                </label>
                {#if lining !== null}
                    <label class="field"><span class="label">Décor</span>
                        <select class="select" value={lining.decor}
                            onchange={(e) => app.apply(setLining, carcass.id, nodeBox.id, { ...lining, decor: str(e) })}>
                            {#each panelDecors as d}<option value={d.id}>{d.ref} {d.label}</option>{/each}
                        </select>
                    </label>
                    {#if lining.decor === "MDF_LAQUE"}
                        <label class="field"><span class="label">Teinte</span>
                            <input class="input" type="color" value={lining.colour ?? "#e6e2da"}
                                onchange={(e) => app.apply(setLining, carcass.id, nodeBox.id, { ...lining,
                                    colour: str(e) })} />
                        </label>
                    {/if}
                    <PhotoPicker decor={lining.decor} />
                    <label class="form-check"><input type="checkbox" checked={lining.faces.left &&
                        lining.faces.right && lining.faces.top && lining.faces.bottom}
                        onchange={(e) =>
                        {
                            const all = checked(e);
                            app.apply(setLining, carcass.id, nodeBox.id, { ...lining,
                                faces: { back: true, left: all, right: all, top: all, bottom: all } });   
                        }} /> Côtés, dessus et dessous aussi</label>
                {/if}
                {@const rail = carcass.rails.find((r) => { return r.cell === nodeBox.id; }) ?? null}
                <label class="form-check" title="Tube Ø 25 sous le panneau au-dessus de la case">
                    <input type="checkbox" checked={rail !== null}
                        onchange={(e) => app.apply(setRail, carcass.id, nodeBox.id, checked(e))} />
                    Penderie
                </label>
                {#if rail !== null}
                    <div class="segmented">
                        <button class="segmented-item" class:active={rail.kind === "fixed"}
                            onclick={() => app.apply(setRail, carcass.id, nodeBox.id, true, "fixed")}>Fixe</button>
                        <button class="segmented-item" class:active={rail.kind === "lift"}
                            onclick={() => app.apply(setRail, carcass.id, nodeBox.id, true, "lift")}>Ascenseur</button>
                    </div>
                {/if}
                <label class="form-check" title="Côtés percés sur toute la hauteur au pas de 32, pour poser des étagères plus tard">
                    <input type="checkbox" checked={carcass.modularCells.includes(nodeBox.id)}
                        onchange={(e) => app.apply(setModularCell, carcass.id, nodeBox.id, checked(e))} />
                    Case modulable
                </label>
                {@const shoes = carcass.shoeRacks.find((s) => { return s.cell === nodeBox.id; }) ?? null}
                <label class="field" title="Range-chaussures Häfele vissés au fond, répartis sur la hauteur, 0 pour aucun">
                    <span class="label">Chaussures</span>
                    <input class="input" type="number" min="0" step="1" value={shoes?.levels ?? 0}
                        onchange={(e) => app.apply(setShoeRack, carcass.id, nodeBox.id, num(e))} />
                </label>
                {@const light = carcass.lights.find((l) => { return l.cell === nodeBox.id; }) ?? null}
                <label class="form-check" title="Profilé LED encastré sous le panneau au-dessus de la case">
                    <input type="checkbox" checked={light !== null}
                        onchange={(e) => app.apply(setLight, carcass.id, nodeBox.id, checked(e)
                            ? { kind: "strip", spots: 0, setback: 40, kelvin: 3000 } : null)} />
                    Éclairage LED
                </label>
                {#if light !== null}
                    <div class="segmented">
                        <button class="segmented-item" class:active={light.kind === "strip"}
                            onclick={() => app.apply(setLight, carcass.id, nodeBox.id, { ...light, kind: "strip" })}>
                            Profilé</button>
                        <button class="segmented-item" class:active={light.kind === "spots"}
                            onclick={() => app.apply(setLight, carcass.id, nodeBox.id, { ...light, kind: "spots",
                                                     spots: Math.max(1, light.spots) })}>Spots</button>
                    </div>
                    {#if light.kind === "spots"}
                        <label class="field"><span class="label">Spots</span>
                            <input class="input" type="number" min="1" step="1" value={light.spots}
                                onchange={(e) => app.apply(setLight, carcass.id, nodeBox.id, { ...light,
                                    spots: num(e) })} />
                        </label>
                    {/if}
                    <label class="field"><span class="label">Retrait (mm)</span>
                        <input class="input" type="number" min="0" step="5" value={light.setback}
                            onchange={(e) => app.apply(setLight, carcass.id, nodeBox.id, { ...light,
                                setback: num(e) })} />
                    </label>
                    <label class="field"><span class="label">Teinte</span>
                        <select class="select" value={String(light.kelvin)}
                            onchange={(e) => app.apply(setLight, carcass.id, nodeBox.id,
                                                       { ...light, kelvin: Number(str(e)) as 2700 | 3000 | 4000 })}>
                            <option value="2700">2700 K</option>
                            <option value="3000">3000 K</option>
                            <option value="4000">4000 K</option>
                        </select>
                    </label>
                    <label class="form-check" title="Contrôleur Wi-Fi entre l'alimentation et le ruban, sans compte">
                        <input type="checkbox" checked={light.wifi === true}
                            onchange={(e) => app.apply(setLight, carcass.id, nodeBox.id, { ...light,
                                wifi: checked(e) })} />
                        Pilotage Wi-Fi
                    </label>
                {/if}
                <PrintPicker {carcass} cell={nodeBox.id} />  
                <div class="section-title">Trous de prise</div>
                {#each carcass.outlets.filter((o) => { return o.cell === nodeBox.id; }) as o (o.id)}
                    <div class="segmented">
                        {#each ([["back", "Fond"], ["above", "Au-dessus"], ["below",
                            "Au-dessous"]] as const) as [panel, label]}
                            <button class="segmented-item" class:active={o.panel === panel}
                                onclick={() => app.apply(updateOutlet, carcass.id, o.id, { panel })}>{label}</button>
                        {/each}
                    </div>
                    <div class="segmented">
                        <button class="segmented-item" class:active={o.shape === "round"}
                            onclick={() => app.apply(updateOutlet, carcass.id, o.id, { shape: "round" })}>Rond</button>
                        <button class="segmented-item" class:active={o.shape === "rect"}
                            onclick={() => app.apply(updateOutlet, carcass.id, o.id,
                                                     { shape: "rect" })}>Rectangle</button>
                    </div>
                    {#if o.shape === "round"}
                        <label class="field"><span class="label">{DIAM} (mm)</span>
                            <input class="input" type="number" min="1" value={o.w}
                                onchange={(e) => app.apply(updateOutlet, carcass.id, o.id, { w: num(e) })} />
                        </label>
                    {:else}
                        <label class="field"><span class="label">L x H (mm)</span>
                            <span class="row">
                                <input class="input" type="number" min="1" aria-label="Largeur du trou" value={o.w}
                                    onchange={(e) => app.apply(updateOutlet, carcass.id, o.id, { w: num(e) })} />
                                <input class="input" type="number" min="1" aria-label="Hauteur du trou" value={o.h}
                                    onchange={(e) => app.apply(updateOutlet, carcass.id, o.id, { h: num(e) })} />
                            </span>
                        </label>
                    {/if}
                    <label class="field" title="Depuis le milieu de la case : en largeur, puis en hauteur sur le fond ou vers l'avant ailleurs">
                        <span class="label">Décalage</span>
                        <span class="row">
                            <input class="input" type="number" aria-label="Décalage en largeur" value={o.dx}
                                onchange={(e) => app.apply(updateOutlet, carcass.id, o.id, { dx: num(e) })} />
                            <input class="input" type="number" aria-label="Décalage en hauteur ou profondeur" value={o.dy}
                                onchange={(e) => app.apply(updateOutlet, carcass.id, o.id, { dy: num(e) })} />
                        </span>
                    </label>
                    <div class="row">
                        <button class="btn btn-danger" onclick={() => app.apply(removeOutlet, carcass.id, o.id)}>
                            Retirer le trou</button>
                    </div>
                {/each}
                <div class="row">
                    <button class="btn btn-secondary" onclick={() => app.apply(addOutlet, carcass.id, nodeBox.id)}>
                        Ajouter un trou</button>
                </div>
            {/if}
        {/if}

        {#if sel.kind === "front" && front !== null && carcass !== null}
            <div class="section-title">Façade</div>
            {#if front.spec.type === "door"}
                {@const spec = front.spec}
                <div class="segmented">
                    <button class="segmented-item" class:active={spec.hinge === "left"}
                        onclick={() => frontPatch({ spec: { ...spec, hinge: "left" } })}>Charnières à gauche</button>
                    <button class="segmented-item" class:active={spec.hinge === "right"}
                        onclick={() => frontPatch({ spec: { ...spec, hinge: "right" } })}>À droite</button>
                </div>
            {/if}
            {#if front.spec.type === "drawers"}
                {@const spec = front.spec}
                <label class="field"><span class="label">Nombre</span>
                    <input class="input" type="number" min="1" max="8" value={spec.count}
                        onchange={(e) => frontPatch({ spec: { ...spec, count: Math.max(1, Math.round(num(e))),
                                                               ratios: undefined, cutlery: undefined } })} />
                </label>
                <label class="field"><span class="label">Charge (kg)</span>
                    <input class="input" type="number" min="0" max="70" value={spec.loadKg}
                        onchange={(e) => frontPatch({ spec: { ...spec, loadKg: num(e) } })} />
                </label>
                <label class="field"><span class="label">Coulisses</span>
                    <select class="select" value={spec.runner ?? ""}
                        onchange={(e) => frontPatch({ spec: { ...spec, runner: str(e) === "" ? undefined
                            : str(e) as "760H" | "766H" } })}>
                        <option value="">Automatique</option>
                        <option value="760H">MOVENTO 40 kg</option>
                        <option value="766H">MOVENTO 60/70 kg</option>
                    </select>
                </label>
                {#if spec.count > 1}
                    <label class="field" title="Hauteurs relatives des façades, de bas en haut : 1, 1, 2 double celle du haut">
                        <span class="label">Proportions</span>
                        <input class="input" placeholder="égales" value={spec.ratios?.join(", ") ?? ""}
                            onchange={(e) => frontPatch({ spec: { ...spec, ratios: str(e).trim() === "" ? undefined
                                : str(e).split(",").map((v) => { return Number(v.trim()); }) } })} />
                    </label>
                {/if}
                <div class="row">
                    {#each { length: spec.count }, i}
                        <label class="form-check"><input type="checkbox" checked={spec.cutlery?.[i] === true}
                            onchange={(e) =>
                            {
                                const cut: boolean[] = [];
                                let k = 0;
                                while (k < spec.count)
                                {
                                    cut.push(k === i ? checked(e) : spec.cutlery?.[k] === true);
                                    k++;
                                }
                                frontPatch({ spec: { ...spec, cutlery: cut } });
                            }} /> Couverts {i + 1}</label>
                    {/each}
                </div> 
            {/if}
            {#if front.spec.type === "sliding"}
                {@const spec = front.spec}
                <label class="field"><span class="label">Vantaux</span>
                    <input class="input" type="number" min="1" max="4" value={spec.leaves}
                        onchange={(e) => frontPatch({ spec: { ...spec, leaves: Math.max(1, Math.round(num(e))) } })} />
                </label>
                <label class="field"><span class="label">Largeur (mm)</span>
                    <input class="input" type="number" min="300" max="1800" value={spec.leafWidth}
                        onchange={(e) => frontPatch({ spec: { ...spec, leafWidth: num(e) } })} />
                </label>
                <label class="form-check"><input type="checkbox" checked={spec.damped}
                    onchange={(e) => frontPatch({ spec: { ...spec, damped: checked(e) } })} /> Amortisseurs</label>
            {/if}
            {#if front.spec.type === "panel"}
                {@const spec = front.spec}
                <label class="field"><span class="label">Découpe</span>
                    <select class="select" value={spec.cutout}
                        onchange={(e) => frontPatch({ spec: { ...spec, cutout: str(e) as "none" | "arch" | "round" } })}>
                        <option value="none">Aucune</option>
                        <option value="arch">Arc</option>
                        <option value="round">Ronde</option>
                    </select>
                </label>
                {#if spec.cutout !== "none"}
                    <label class="field" title="Largeur de panneau gardée autour de la découpe">
                        <span class="label">Bord (mm)</span>
                        <input class="input" type="number" min="1" value={spec.margin}
                            onchange={(e) => frontPatch({ spec: { ...spec, margin: num(e) } })} />
                    </label>
                {/if}
            {/if}
            {#if front.spec.type !== "sliding" && front.spec.type !== "panel"}
                <div class="segmented">
                    <button class="segmented-item" class:active={front.opening === "handle"}
                        onclick={() => frontPatch({ opening: "handle" })}>Poignée</button>
                    <button class="segmented-item" class:active={front.opening === "push"}
                        onclick={() => frontPatch({ opening: "push" })}>Pression</button>
                </div>
            {/if}
            {#if front.spec.type === "lift" && front.opening === "handle"}
                {@const spec = front.spec}
                <label class="field" title="Blum la compte deux fois pour choisir le mécanisme">
                    <span class="label">Poignée (kg)</span>
                    <input class="input" type="number" min="0" max="3" step="0.05" value={spec.handleKg}
                        onchange={(e) =>
                        {
                            const kg = num(e);
                            if (Number.isFinite(kg))
                            {
                                frontPatch({ spec: { ...spec, handleKg: Math.max(0, kg) } });
                            }
                        }} />
                </label>
            {/if}
            {#if front.spec.type !== "sliding" && front.spec.type !== "lift"}
                <div class="segmented">
                    <button class="segmented-item" class:active={front.mount === "overlay"}
                        onclick={() => frontPatch({ mount: "overlay" })}>En applique</button>
                    <button class="segmented-item" class:active={front.mount === "inset"}
                        onclick={() => frontPatch({ mount: "inset" })}>Encastrée</button>
                </div>
            {/if}
            <label class="field"><span class="label">Décor</span>
                <select class="select" value={front.decor ?? carcass.decor}
                    onchange={(e) => frontPatch({ decor: str(e) })}>
                    {#each panelDecors as d}<option value={d.id}>{d.ref} {d.label}</option>{/each}
                </select>
            </label>
            <PhotoPicker decor={front.decor ?? carcass.decor} />
            {#if decorById(front.decor ?? carcass.decor).id === "MDF_LAQUE"}
                <label class="field"><span class="label">Teinte</span>
                    <input class="input" type="color" value={front.colour ?? "#e6e2da"}
                        onchange={(e) => frontPatch({ colour: str(e) })} />
                </label>
                <label class="field"><span class="label">Réf. RAL / NCS</span>
                    <input class="input" type="text" maxlength="40" value={front.colourName ?? ""} placeholder="RAL 7033"
                        onchange={(e) => frontPatch({ colourName: str(e) || null })} />
                </label>
            {/if}
            <div class="row">
                {#if parentId !== null && front.spec.type !== "drawers"}
                    <button class="btn btn-secondary" title="Une seule façade pour la case et ses voisines"
                        onclick={() => app.apply(mergeFronts, carcass.id, front.id)}>
                        {front.spec.type === "door" ||
                         front.spec.type === "doubleDoor" ? "Porte unique" : "Réunir"}</button>
                {/if}
                {#if findNode(carcass.root, front.node)?.kind === "split"}
                    <button class="btn btn-secondary" title="Une façade identique sur chaque case de la zone"
                        onclick={() => app.apply(splitFront, carcass.id, front.id)}>
                        {front.spec.type === "door" || front.spec.type === "doubleDoor" ? "Une porte par case"
                            : "Une par case"}</button>
                {/if}
                <button class="btn btn-danger" onclick={() =>
                {
                    // `front` is derived and turns null as soon as the command lands
                    const node = front.node;
                    if (app.apply(removeFront, carcass.id, front.id))
                    {
                        app.selection = { kind: "node", item: carcass.id, node };
                    }
                }}>Retirer</button>
            </div>   
            {#if frontHardware.length > 0}
                <div class="section-title">Quincaillerie retenue</div>
                <ul class="hw">
                    {#each frontHardware as h}
                        <li><strong>{h.qty} x {h.ref}</strong> {HARDWARE[h.ref]?.label ?? ""}{h.note !== null
                            ? `, ${h.note}` : ""}</li>
                    {/each}
                </ul>
            {/if}
        {/if}

        {#if sel.kind === "item"}
            <label class="field" title="Le meuble garde ses cotes, le long du nouveau mur">
                <span class="label">Mur</span>
                <select class="select" value={item.wall} onchange={(e) =>
                {
                    const wall = str(e) as Wall;
                    patch({ wall });
                    app.wall = wall;
                }}>
                    <option value="left">Gauche</option>
                    <option value="back">Fond</option>
                    <option value="right">Droit</option>
                </select>
            </label>
        {/if}

        {#if sel.kind === "item" && carcass !== null}
            <div class="section-title">Caisson</div>
            <label class="field"><span class="label">Nom</span>
                <input class="input" maxlength="80" value={carcass.name} onchange={(e) => patch({ name: str(e) })} />
            </label>
            <label class="field"><span class="label">Largeur</span>
                <input class="input" type="number" step="1" value={carcass.width}
                    onchange={(e) => patch({ width: num(e) } as Partial<Carcass>)} />
            </label>
            <label class="field"><span class="label">Hauteur</span>
                <input class="input" type="number" step="1" value={carcass.height}
                    onchange={(e) => patch({ height: num(e) } as Partial<Carcass>)} />
            </label>
            <label class="field"><span class="label">Profondeur</span>
                <input class="input" type="number" step="1" value={carcass.depth}
                    onchange={(e) => patch({ depth: num(e) } as Partial<Carcass>)} />
            </label>
            <label class="field"><span class="label">Épaisseur</span>
                <select class="select" value={String(carcass.thickness)}
                    onchange={(e) => patch({ thickness: Number(str(e)) } as Partial<Carcass>)}>
                    {#each BOARD_THICKNESSES as t}<option value={String(t)}>{t} mm</option>{/each}
                </select>
            </label>
            <label class="field"><span class="label">Ép. tablettes</span>
                <select class="select" value={carcass.shelfThickness === null ? "" : String(carcass.shelfThickness)}
                    onchange={(e) => patch({ shelfThickness: str(e) === "" ? null
                        : Number(str(e)) } as Partial<Carcass>)}>
                    <option value="">Comme les côtés</option>
                    {#each BOARD_THICKNESSES as t}<option value={String(t)}>{t} mm</option>{/each}
                </select>
            </label>
            <label class="field"><span class="label">X / Y / Z</span>
                <span class="row">
                    <input class="input xyz" type="number" value={carcass.x} onchange={(e) => patch({ x: num(e) })} />
                    <input class="input xyz" type="number" value={carcass.y} onchange={(e) => patch({ y: num(e) })} />
                    <input class="input xyz" type="number" value={carcass.z} onchange={(e) => patch({ z: num(e) })} />
                </span>
            </label>
            <label class="field"><span class="label">Décor</span>
                <select class="select" value={carcass.decor}
                    onchange={(e) => patch({ decor: str(e) } as Partial<Carcass>)}>
                    {#each panelDecors as d}<option value={d.id}>{d.ref} {d.label}</option>{/each}
                </select>
            </label>
            <PhotoPicker decor={carcass.decor} />
            <label class="field"><span class="label">Socle</span>
                <select class="select" value={carcass.base.type} onchange={(e) => setBaseType(str(e) as Base["type"])}>
                    <option value="plinth">Plinthe sur pieds</option>
                    <option value="feet">Pieds apparents</option>
                    <option value="wall">Suspendu au mur</option>
                    <option value="floor">Posé</option>
                </select>
            </label>
            {#if carcass.base.type === "wall"}
                {@const b = carcass.base}
                <label class="field"><span class="label">Suspension</span>
                    <select class="select" value={b.hanger ?? "blum"}
                        onchange={(e) => patch({ base: { ...b, hanger: str(e) as "blum" |
                                                        "camar" } } as Partial<Carcass>)}>
                        <option value="blum">Ferrures Blum 48N0510, 130 kg la paire</option>
                        <option value="camar">Reggibases Camar 807, 240 kg la paire</option>
                    </select>
                </label>
            {/if}
            {#if carcass.base.type === "plinth" || carcass.base.type === "feet"}
                {@const b = carcass.base}
                <label class="field"><span class="label">Hauteur socle</span>
                    <input class="input" type="number" min="53" max="200" value={b.height}
                        onchange={(e) => patch({ base: { ...b, height: num(e) } } as Partial<Carcass>)} />
                </label>
            {/if}
            {#if carcass.base.type === "plinth"}
                {@const b = carcass.base}
                <label class="field" title="Grilles Häfele encastrées dans la plinthe, réparties sur sa longueur">
                    <span class="label">Grilles d'aération</span>
                    <input class="input" type="number" min="0" step="1" value={b.grills ?? 0}
                        onchange={(e) => patch({ base: { ...b, grills: Math.max(0,
                            Math.round(num(e))) } } as Partial<Carcass>)} />
                </label>
                {#each (["left", "right"] as const) as side}
                    <label class="form-check" title="Ferme le dessous du caisson sur ce côté, dans le plan de la joue">
                        <input type="checkbox" checked={(b.returns ?? []).includes(side)}
                            onchange={(e) => patch({ base: { ...b, returns: (["left", "right"] as const).filter((s) =>
                            {
                                return s === side ? checked(e) : (b.returns ?? []).includes(s);
                            }) } } as Partial<Carcass>)} />
                        Retour {side === "left" ? "gauche" : "droit"}</label>
                {/each}
            {/if}
            <label class="field"><span class="label">Fond</span>
                <select class="select" value={carcass.back.type}
                    onchange={(e) => setBackType(str(e) as BackMount["type"])}>
                    <option value="applied">Rapporté, vissé</option>
                    <option value="groove">En rainure</option>
                    <option value="none">Sans fond</option>
                </select>
            </label>
            {#if carcass.base.type !== "wall"}
                <label class="form-check"><input type="checkbox" checked={carcass.fixToWall}
                    onchange={(e) => patch({ fixToWall: checked(e) } as Partial<Carcass>)} /> Fixation murale anti-basculement</label>
            {/if}
            <label class="field" title="Taquets des étagères réglables, charge admise pour 4 (Häfele)">
                <span class="label">Taquets</span>
                <select class="select" value={carcass.pins ?? ""}
                    onchange={(e) => patch({ pins: str(e) === "" ? undefined : str(e) } as Partial<Carcass>)}>
                    <option value="">Automatique</option>
                    {#each SHELF_SUPPORTS as s (s.ref)}<option value={s.ref}>{s.label}, {s.kgFor4} kg pour 4</option>{/each}
                </select>
            </label>
            <label class="form-check" title="Bandeau au nu des façades, du dessus au plafond de la pièce">
                <input type="checkbox" checked={carcass.ceilingFiller}
                    onchange={(e) => patch({ ceilingFiller: checked(e) } as Partial<Carcass>)} />
                Fileur jusqu'au plafond ({Math.round(app.project.room.height - carcass.y - carcass.height)} mm)</label>
            <label class="form-check" title="Le dessus doit porter une personne, rien ne peut y être posé">
                <input type="checkbox" checked={carcass.seat !== null}
                    onchange={(e) => patch({ seat: checked(e) ? { cushion: 0 } : null } as Partial<Carcass>)} /> Assise</label>
            {#if carcass.seat !== null}
                {@const seat = carcass.seat}
                <label class="field"><span class="label">Coussin (mm)</span>
                    <input class="input" type="number" min="0" max="200" step="10" value={seat.cushion}
                        onchange={(e) => patch({ seat: { ...seat, cushion: Math.max(0,
                            num(e)) } } as Partial<Carcass>)} />
                </label>
            {/if}
            <label class="form-check" title="Dessus parallèle au rampant d'un comble">
                <input type="checkbox" checked={carcass.slope !== null}
                    onchange={(e) => patch({ slope: checked(e) ? { low: "left", height: Math.max(2 * carcass.thickness
                        + MIN_CELL, Math.round(carcass.height /
                                               2)) } : null } as Partial<Carcass>)} /> Dessus en pente</label>
            {#if carcass.slope !== null}
                {@const slope = carcass.slope}
                <div class="segmented">
                    <button class="segmented-item" class:active={slope.low === "left"}
                        onclick={() => patch({ slope: { ...slope,
                                                       low: "left" } } as Partial<Carcass>)}>Bas à gauche</button>
                    <button class="segmented-item" class:active={slope.low === "right"}
                        onclick={() => patch({ slope: { ...slope,
                                                       low: "right" } } as Partial<Carcass>)}>Bas à droite</button>
                </div>
                <label class="field"><span class="label">Joue basse (mm)</span>
                    <input class="input" type="number" min={2 * carcass.thickness + MIN_CELL} max={carcass.height - 1}
                        value={slope.height}
                        onchange={(e) => patch({ slope: { ...slope, height: num(e) } } as Partial<Carcass>)} />
                </label>
                <p class="muted">{((topAngle(carcass) * 180) / Math.PI).toFixed(1).replace(".", ",")}° de pente</p>
            {/if}
            {#each (["left", "right"] as const) as side}
                {@const e = carcass.ends[side]}
                <div class="section-title">Côté {side === "left" ? "gauche" : "droit"}</div>
                <div class="segmented">
                    <button class="segmented-item" class:active={e.type === "square"}
                        onclick={() => endPatch(side, "square")}>Droit</button>
                    <button class="segmented-item" class:active={e.type === "rounded"}
                        onclick={() => endPatch(side, "rounded")}>Arrondi</button>
                </div>
                {#if e.type === "rounded"}
                    <div class="segmented">
                        <button class="segmented-item" class:active={e.sweep === 90}
                            onclick={() => endPatch(side, { sweep: 90 })}>Quart</button>
                        <button class="segmented-item" class:active={e.sweep === 180}
                            onclick={() => endPatch(side, { sweep: 180 })}>Demi</button>
                    </div>
                    {#if e.sweep === 90}
                        <label class="field"><span class="label">Rayon</span>
                            <input class="input" type="number" value={e.radius}
                                onchange={(ev) => endPatch(side, { radius: num(ev) })} />
                        </label>
                        <label class="form-check" title="Ferme l'arrière de l'arrondi, comme le fond du caisson">
                            <input type="checkbox" checked={e.back === true}
                                onchange={(ev) => endPatch(side, { back: checked(ev) })} /> Fond</label>
                    {/if}
                    <label class="form-check" title="Sans habillage cintré : des tablettes découpées au rayon">
                        <input type="checkbox" checked={e.open === true}
                            onchange={(ev) => endPatch(side, { open: checked(ev) })} /> Ouvert</label>
                    {#if e.open === true}
                        <label class="field"><span class="label">Tablettes</span>
                            <input class="input" type="number" min="0" step="1" value={e.shelves ?? 2}
                                onchange={(ev) => endPatch(side, { shelves: Math.max(0, Math.round(num(ev))) })} />
                        </label>
                        {#if carcass.base.type === "plinth" || carcass.base.type === "feet"}  
                            <label class="form-check" title="La planche du bas descend au sol, à côté du socle">  
                                <input type="checkbox" checked={e.floor === true} 
                                    onchange={(ev) => endPatch(side, { floor: checked(ev) })} /> Jusqu'au sol</label> 
                        {/if}   
                        <label class="form-check" title="Montant vertical au milieu de l'arc, du haut jusqu'en bas"> 
                            <input type="checkbox" checked={e.post === true} 
                                onchange={(ev) => endPatch(side, { post: checked(ev) })} /> Montant</label> 
                        <label class="form-check" title="On s'assoit dessus : le haut est vérifié sous une personne"> 
                            <input type="checkbox" checked={e.seat === true}  
                                onchange={(ev) => endPatch(side, { seat: checked(ev) })} /> Assise</label>  
                    {:else}
                        <label class="field"><span class="label">Technique</span>
                            <select class="select" value={e.technique}
                                onchange={(ev) => endPatch(side, { technique: str(ev) as CurveTechnique })}>
                                <option value="battens">Tasseaux</option>
                                <option value="flex">MDF cintrable</option>
                                <option value="solid">Massif usiné</option>
                            </select>
                        </label>
                    {/if}
                {/if}
            {/each}
        {/if}  

        {#if sel.kind === "item" && item.kind === "corner"}
            {@const k = item}
            <div class="section-title">Angle arrondi</div>
            <label class="field"><span class="label">Nom</span>
                <input class="input" maxlength="80" value={k.name} onchange={(e) => patch({ name: str(e) })} />
            </label>
            <label class="field"><span class="label">Centre X / Y</span>
                <span class="row">
                    <input class="input xyz" type="number" value={k.cx}
                        onchange={(e) => patch({ cx: num(e) } as Partial<Item>)} />
                    <input class="input xyz" type="number" value={k.cy}
                        onchange={(e) => patch({ cy: num(e) } as Partial<Item>)} />
                </span>
            </label>
            <label class="field"><span class="label">Quart</span>
                <select class="select" value={k.quadrant} onchange={(e) => patch({ quadrant: str(e) } as Partial<Item>)}>
                    <option value="topRight">Haut droit</option>
                    <option value="topLeft">Haut gauche</option>
                    <option value="bottomRight">Bas droit</option>
                    <option value="bottomLeft">Bas gauche</option>
                </select>
            </label>
            <label class="field"><span class="label">Rayon ext.</span>
                <input class="input" type="number" value={k.outerRadius}
                    onchange={(e) => patch({ outerRadius: num(e) } as Partial<Item>)} />
            </label>
            <label class="field"><span class="label">Rayon int.</span>
                <input class="input" type="number" value={k.innerRadius}
                    onchange={(e) => patch({ innerRadius: num(e) } as Partial<Item>)} />
            </label>
            <label class="field"><span class="label">Profondeur</span>
                <input class="input" type="number" value={k.depth}
                    onchange={(e) => patch({ depth: num(e) } as Partial<Item>)} />
            </label>
            <label class="field"><span class="label">Technique</span>
                <select class="select" value={k.technique}
                    onchange={(e) => patch({ technique: str(e) } as Partial<Item>)}>
                    <option value="flex">MDF cintrable</option>
                    <option value="battens">Tasseaux</option>
                    <option value="solid">Massif usiné</option>
                </select>
            </label>
        {/if}

        {#if sel.kind === "item" && (item.kind === "wallShelf" || item.kind === "box")}
            {@const w = item}
            <div class="section-title">{w.kind === "box" ? "Caisson suspendu" : w.purpose === "desk" ? "Plan de bureau"
                : "Étagère murale"}</div>
            <label class="field"><span class="label">Nom</span>
                <input class="input" maxlength="80" value={w.name} onchange={(e) => patch({ name: str(e) })} />
            </label>
            {#if w.kind === "wallShelf"}
                <label class="field"><span class="label">Usage</span>
                    <select class="select" value={w.purpose}
                        onchange={(e) => patch({ purpose: str(e) as "shelf" | "desk" } as Partial<Item>)}>
                        <option value="shelf">Étagère</option>
                        <option value="desk">Plan de bureau</option>
                    </select>
                </label>
                <label class="field"><span class="label">Hauteur du dessus</span>
                    <input class="input" type="number" value={w.y + w.thickness}
                        onchange={(e) => patch({ y: num(e) - w.thickness } as Partial<Item>)} />
                </label>
                <label class="field" title="Rayons des coins avant gauche et droit, 0 pour un coin vif">
                    <span class="label">Coins avant R</span>
                    <span class="row">
                        <input class="input" type="number" min="0" aria-label="Rayon du coin gauche" value={w.corners.left}
                            onchange={(e) => patch({ corners: { ...w.corners, left: num(e) } } as Partial<Item>)} />
                        <input class="input" type="number" min="0" aria-label="Rayon du coin droit" value={w.corners.right}
                            onchange={(e) => patch({ corners: { ...w.corners, right: num(e) } } as Partial<Item>)} />
                    </span>
                </label>
            {/if}
            <label class="field"><span class="label">Largeur</span>
                <input class="input" type="number" value={w.width}
                    onchange={(e) => patch({ width: num(e) } as Partial<Item>)} />
            </label>
            {#if w.kind === "box"}
                <label class="field"><span class="label">Hauteur</span>
                    <input class="input" type="number" value={w.height}
                        onchange={(e) => patch({ height: num(e) } as Partial<Item>)} />
                </label>
            {/if}
            <label class="field"><span class="label">Profondeur</span>
                <input class="input" type="number" value={w.depth}
                    onchange={(e) => patch({ depth: num(e) } as Partial<Item>)} />
            </label>
            {#if w.kind === "wallShelf"}
                <!-- the top stays where it was, the board grows downwards -->
                <label class="field"><span class="label">Épaisseur</span>
                    <input class="input" type="number" min="8" step="1" value={w.thickness}
                        onchange={(e) => patch({ thickness: num(e), y: w.y + w.thickness - num(e) } as Partial<Item>)} />
                </label>
            {/if}
            <label class="field"><span class="label">Décor</span>
                <select class="select" value={w.decor} onchange={(e) => patch({ decor: str(e) } as Partial<Item>)}>
                    {#each panelDecors as d}<option value={d.id}>{d.ref} {d.label}</option>{/each}
                </select>
            </label>
            <PhotoPicker decor={w.decor} />
        {/if}

        {#if sel.kind === "item" && item.kind === "ladder"}
            {@const l = item}
            <div class="section-title" title="Cotes à reprendre de la notice de l'échelle achetée">Échelle sur rail</div>
            <label class="field"><span class="label">Nom</span>
                <input class="input" maxlength="80" value={l.name} onchange={(e) => patch({ name: str(e) })} />
            </label>
            {#each LADDER_FIELDS as [label, key] (key)}
                <label class="field"><span class="label">{label}</span>
                    <input class="input" type="number" min="0" value={l[key]}
                        onchange={(e) => patch({ [key]: num(e) } as Partial<Item>)} />
                </label>
            {/each}
        {/if}

        {#if sel.kind === "item" && item.kind === "slats"}
            {@const t = item}
            {@const lay = slatLayout(t)}
            <div class="section-title">{t.mode === "wall" ? "Tasseaux muraux" : "Claustra"}</div>
            <label class="field"><span class="label">Nom</span>
                <input class="input" maxlength="80" value={t.name} onchange={(e) => patch({ name: str(e) })} />
            </label>
            <div class="segmented">
                <button class="segmented-item" class:active={t.mode === "wall"}
                    onclick={() => patch({ mode: "wall" } as Partial<Item>)}>Sur liteaux</button>
                <button class="segmented-item" class:active={t.mode === "divider"}
                    onclick={() => patch({ mode: "divider" } as Partial<Item>)}>Claustra</button>
            </div>
            <label class="field"><span class="label">Largeur</span>
                <input class="input" type="number" min="40" value={t.width}
                    onchange={(e) => patch({ width: num(e) } as Partial<Item>)} />
            </label>
            <label class="field"><span class="label">Hauteur</span>
                <input class="input" type="number" min="100" value={t.height}
                    onchange={(e) => patch({ height: num(e) } as Partial<Item>)} />
            </label>
            <label class="field"><span class="label">Latte, face (mm)</span>
                <input class="input" type="number" min="10" max="300" value={t.slatWidth}
                    onchange={(e) => patch({ slatWidth: num(e) } as Partial<Item>)} />
            </label>
            <label class="field"><span class="label">Latte, profondeur (mm)</span>
                <input class="input" type="number" min="8" max="300" value={t.slatDepth}
                    onchange={(e) => patch({ slatDepth: num(e) } as Partial<Item>)} />
            </label>
            <label class="field"><span class="label">Jour (mm)</span>
                <input class="input" type="number" min="0" max="500" value={t.gap}
                    onchange={(e) => patch({ gap: num(e) } as Partial<Item>)} />
            </label>
            <p class="muted">{lay.xs.length} lattes, jour réel {lay.gap.toFixed(1).replace(".", ",")} mm</p>
            <label class="field"><span class="label">Distance au mur</span>
                <input class="input" type="number" min="0" value={t.z} onchange={(e) => patch({ z: num(e) })} />
            </label>
            <label class="field"><span class="label">Décor</span>
                <select class="select" value={t.decor} onchange={(e) => patch({ decor: str(e) } as Partial<Item>)}>
                    {#each slatDecors as d}<option value={d.id}>{d.ref} {d.label}</option>{/each}
                </select>
            </label>
            <PhotoPicker decor={t.decor} />
        {/if}


        {#if sel.kind === "item"}
            <div class="row">
                <button class="btn btn-secondary" onclick={() => app.apply(duplicateItem, item.id,
                    item.kind === "corner" ? item.outerRadius + 100 : item.width + 100)}>Dupliquer</button>
                <button class="btn btn-danger" onclick={() =>
                {
                    if (app.apply(removeItem, item.id))
                    {
                        app.selection = null;
                    }
                }}>Supprimer</button>
            </div>
        {:else if carcass !== null}
            <div class="row">
                <button class="btn btn-ghost" onclick={() => (app.selection = { kind: "item",
                    item: carcass.id })}>Caisson : {carcass.name}</button>
            </div>
        {/if}
    {/if}
</div>

<style>
    .inspector-body
    {
        display: grid;
        gap: var(--spacing-xs);
    }

    .xyz 
    {
        width: 5.5rem;
    }

    .hw
    {
        margin: 0;
        padding-left: var(--spacing-md); 
        color: var(--colour-text-secondary);
        font-size: var(--font-size-xs);
    }
</style>
