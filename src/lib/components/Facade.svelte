<script lang="ts">
    import { app } from "./app_state.svelte";
    import { drag } from "./drag.svelte";
    import { facadeBridge, clientToWorld } from "./bridge";
    import { handleDrop } from "./actions";
    import { hitTest } from "./hit";
    import { byId } from "../core/edit";
    import { endReach, itemExtent, screenSize } from "../core/extent";
    import { PLINTH_FOOT_GAP, baseHeight } from "../core/parts";
    import { RAIL_THICKNESS, slatLayout } from "../core/slats";
    import { ceilingAt, frontOutline, topAt } from "../core/slope";
    import { FIT_PLAY, RAIL_D, RAIL_DROP, SPOT_RIM, railPlan, spotCentres } from "../core/wardrobe";
    import { openingPoints } from "../core/cutouts";
    import { openEndLevels } from "../core/curves";
    import { SHOE_RACKS, shoeLevels } from "../core/shoes";
    import { VENT_GRILL } from "../core/vents";
    import type { NodeBox, ResolvedLayout } from "../core/layout";
    import { decorById } from "../data/materials";
    import type { Item, Wall } from "../core/model";
    import { boxToWall, roomBox } from "../core/room";


    let hostWidth = $state(800);
    let hostHeight = $state(600);
    let zoom = $state(1);
    let panX = $state(0);
    let panY = $state(0);

    const project = $derived(app.project);
    const analysis = $derived(app.outputs.analysis);
    const sel = $derived(app.selection);


    const shown = $derived.by(() =>
    {
        const list: Item[] = [];
        for (const it of project.items)
        {
            if (it.wall === app.wall)
            {
                list.push(it);
            }
        }
        return list;
    });

    // items of the walls either side of this one, outlined where they stand in front of it
    const ghosts = $derived.by(() =>
    {
        const list: { id: string; name: string; x0: number; x1: number; y0: number; y1: number }[] = [];
        for (const it of project.items)
        {
            const adjacent = app.wall === "back" ? it.wall !== "back" : it.wall === "back";
            if (adjacent)
            {
                const b = boxToWall(app.wall, project.room, roomBox(it, project.room));
                list.push({ id: it.id, name: it.name, x0: b.min[0], x1: b.max[0], y0: b.min[1], y1: b.max[1] });
            }
        }
        return list;
    });
    const wallLength = $derived(app.wall === "back" ? project.room.width : project.room.depth);
    const WALLS: [Wall, string][] = [["left", "Gauche"], ["back", "Fond"], ["right", "Droit"]];


    // world extent of the composition, the view frames it with a margin
    const extent = $derived.by(() =>
    {
        let x0 = 0;
        let x1 = 1000;
        let y1 = 1000;
        for (const it of shown)
        {
            const box = itemExtent(it);
            x0 = Math.min(x0, box.x0);
            x1 = Math.max(x1, box.x1);
            y1 = Math.max(y1, box.y1, it.kind === "carcass" && it.ceilingFiller ? project.room.height : 0);
        }
        for (const g of ghosts)
        {
            x0 = Math.min(x0, g.x0);
            x1 = Math.max(x1, g.x1);
            y1 = Math.max(y1, g.y1);
        }
        return { x0: x0 - 400, x1: x1 + 400, y0: -150, y1: y1 + 400 };
    });


    const viewBox = $derived.by(() =>
    {
        const w = (extent.x1 - extent.x0) / zoom;
        const h = (extent.y1 - extent.y0) / zoom;
        const cx = (extent.x0 + extent.x1) / 2 + panX;
        const cy = (extent.y0 + extent.y1) / 2 + panY;
        return `${cx - w / 2} ${-(cy + h / 2)} ${w} ${h}`;
    });

    // millimetres of the world per screen pixel : handles kee a finger size at any zoom
    const mmPerPx = $derived.by(() =>
    {
        const w = (extent.x1 - extent.x0) / zoom;
        const h = (extent.y1 - extent.y0) / zoom;
        return Math.max(w / Math.max(1, hostWidth), h / Math.max(1, hostHeight));
    });


    // cell under the finger while something is dragged, for the highlight
    const hover = $derived.by(() =>
    {
        if (drag.payload === null)
        {
            return null;
        }
        const w = clientToWorld(drag.x, drag.y);
        if (w === null)
        {
            return null;
        }
        return hitTest(project, analysis, w[0], w[1], app.wall);
    });


    function cellsOf(lay: ResolvedLayout): NodeBox[]
    {
        const cells: NodeBox[] = [];
        for (const n of lay.nodes.values())
        {
            if (n.kind === "cell")
            {
                cells.push(n);
            }
        }
        return cells;
    }

    function fill(decor: string, colour: string | null = null): string
    {
        // a colour left over from a former lacquered decor is ignored, like in the parts
        if (colour !== null && decor === "MDF_LAQUE")
        {
            return colour;
        }
        const d = decorById(decor);
        return `rgb(${d.rgb[0]},${d.rgb[1]},${d.rgb[2]})`;
    }


    // world points to an svg list, y pointing down
    function svgPoints(pts: [number, number][]): string
    {
        return pts.map(([x, y]) => { return `${x},${-y}`; }).join(" ");
    }

    function shade(decor: string, k: number): string
    {
        const d = decorById(decor);
        return `rgb(${Math.round(d.rgb[0] * k)},${Math.round(d.rgb[1] * k)},${Math.round(d.rgb[2] * k)})`;
    }

    function cornerPath(it: Extract<Item, { kind: "corner" }>): string
    {
        const sx = it.quadrant.endsWith("Right") ? 1 : -1;
        const sy = it.quadrant.startsWith("top") ? 1 : -1;
        const R = it.outerRadius;
        const r = it.innerRadius;
        const X = (dx: number): number =>
        {
            return it.cx + sx * dx;
        };
        const Y = (dy: number): number =>
        {
            return -(it.cy + sy * dy);
        };
        const sweep = sx * sy > 0 ? 0 : 1;
        const outer = `M ${X(r > 0 ? r : 0)} ${Y(0)} L ${X(R)} ${Y(0)} A ${R} ${R} 0 0 ${sweep} ${X(0)} ${Y(R)}`;
        if (r <= 0)
        {
            return `${outer} Z`;
        }
        return `${outer} L ${X(0)} ${Y(r)} A ${r} ${r} 0 0 ${1 - sweep} ${X(r)} ${Y(0)} Z`;
    }

    function gripLabel(name: string, roomPx: number): { text: string; px: number }
    {
        const px = Math.max(48, Math.min(Math.max(90, name.length * 8 + 20), roomPx));
        const fits = Math.min(18, Math.floor((px - 20) / 8));
        return { text: name.length > fits ? `${name.slice(0, Math.max(1, fits - 1))}...` : name, px };
    }

    // a grip keeps its whole name unless a neighbour at the same height would run over it :
    // each one is narrowed to the gap between its centre and the nearest one of its row
    const grips = $derived.by(() =>
    {
        const u = mmPerPx;
        const rows: { id: string; name: string; mid: number; top: number }[] = [];
        for (const it of shown)
        {
            const b = itemExtent(it);
            rows.push({ id: it.id, name: it.name, mid: (b.x0 + b.x1) / 2, top: b.y1 });
        }
        const out = new Map<string, { text: string; px: number }>();
        for (const g of rows)
        {
            let room = Infinity;
            for (const o of rows)
            {
                // a grip is 28 px high : two tops further apart than that stack, they never touch
                if (o.id !== g.id && Math.abs(o.top - g.top) < 28 * u)
                {
                    room = Math.min(room, Math.abs(o.mid - g.mid) / u - 6);
                }
            }
            out.set(g.id, gripLabel(g.name, room));
        }
        return out;
    });

    function hingeLines(x0: number, y0: number, x1: number, y1: number, hinge: "left" | "right" | null): string
    {
        const hx = hinge === "left" ? x0 : x1;
        const ox = hinge === "left" ? x1 : x0;
        return `M ${ox} ${y0} L ${hx} ${(y0 + y1) / 2} L ${ox} ${y1}`;
    }


    function startItemDrag(e: PointerEvent, it: Item): void
    {
        const w = clientToWorld(e.clientX, e.clientY);
        if (w === null)
        {
            return;
        }
        const ax = it.kind === "corner" ? it.cx : it.x;
        const ay = it.kind === "corner" ? it.cy : it.y;
        app.selection = { kind: "item", item: it.id };
        drag.start(e, { kind: "item", item: it.id, dx: w[0] - ax, dy: w[1] - ay }, it.name, handleDrop);
    }

    function onWheel(e: WheelEvent): void
    {
        e.preventDefault();
        zoom = Math.min(8, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    }

    function reset(): void
    {
        zoom = 1;
        panX = 0;
        panY = 0;
    }
</script>

<div class="facade">
    <div class="facade-tools">
        <button class="btn btn-ghost btn-icon" title="Zoom avant" onclick={() => (zoom = Math.min(8,
            zoom * 1.25))}>+</button>
        <button class="btn btn-ghost btn-icon" title="Zoom arrière" onclick={() => (zoom = Math.max(0.3, zoom /
            1.25))}>-</button>
        <button class="btn btn-ghost" onclick={reset}>Recadrer</button>
        <div class="segmented" role="group" aria-label="Mur">
            {#each WALLS as [w, label] (w)}
                <button class="segmented-item" class:active={app.wall === w} onclick={() =>
                {
                    app.wall = w;
                    app.selection = null;
                    reset();
                }}>{label}</button>
            {/each}
        </div>
    </div>
    <!-- the size of the drawing alone : the tools row above is not part of what the zoom frames -->
    <div class="drawing" bind:clientWidth={hostWidth} bind:clientHeight={hostHeight}>
    <svg bind:this={facadeBridge.svg} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" onwheel={onWheel}
        role="application" aria-label="Vue de face">
        <line x1={extent.x0} y1="0" x2={extent.x1} y2="0" class="floor" />
        <polyline points={`0,0 0,${-project.room.height} ${wallLength},${-project.room.height} ${wallLength},0`}
            class="room" fill="none" />
        {#each ghosts as g (g.id)}
            <rect x={g.x0} y={-g.y1} width={g.x1 - g.x0} height={g.y1 -
                                                                 g.y0} class="ghost"><title>{g.name}</title></rect>
        {/each}
        {#each shown as it (it.id)}
            {@const selected = sel !== null && sel.item === it.id}
            {#if it.kind === "carcass"}
                {@const lay = analysis.build.layouts.get(it.id)}
                {@const panels = analysis.build.fronts.get(it.id) ?? []}
                {@const bh = baseHeight(it)}
                <g transform={`translate(${it.x} ${-it.y})`}>
                    {#if it.ceilingFiller && it.y + it.height < project.room.height}
                        <rect x="0" y={-(project.room.height - it.y)} width={it.width}
                            height={project.room.height - it.y - it.height}
                            fill={fill(it.fronts[0]?.decor ?? it.decor, it.fronts[0]?.colour ?? null)} class="edge" />
                    {/if}
                    {#if it.base.type === "plinth"}
                        {@const grills = Math.max(0, Math.round(it.base.grills ?? 0))}
                        <rect x="0" y="0" width={it.width} height={bh - PLINTH_FOOT_GAP} fill={shade(it.decor, 0.75)}
                            class="edge" />
                        {#each { length: grills }, i}
                            <rect x={it.width * (i + 0.5) / grills - VENT_GRILL.rimW / 2}
                                y={(bh - PLINTH_FOOT_GAP - VENT_GRILL.rimH) / 2} width={VENT_GRILL.rimW}
                                height={VENT_GRILL.rimH} class="foot" />
                        {/each}
                    {:else if it.base.type === "feet"}
                        <rect x="30" y="0" width="30" height={bh} class="foot" />
                        <rect x={it.width - 60} y="0" width="30" height={bh} class="foot" />
                    {/if}
                    <polygon points={svgPoints(frontOutline(it))} fill={fill(it.decor)} class="edge" />
                    {#if it.seat !== null}
                        {#if it.seat.cushion > 0}
                            <rect x="0" y={-(it.height + it.seat.cushion)} width={it.width} height={it.seat.cushion}
                                rx={Math.min(20, it.seat.cushion / 2)} class="cushion" />
                        {:else}
                            <line x1="0" y1={-it.height - 6} x2={it.width} y2={-it.height - 6} class="seat-mark" />
                        {/if}
                    {/if}
                    {#each (["left", "right"] as const) as side}
                        {@const e = it.ends[side]}
                        {#if e.type === "rounded"}
                            {@const r = endReach(it, side)}
                            {@const ex = side === "right" ? it.width : -r}
                            {@const pitch = e.battens.width + e.battens.gap}
                            {#if e.open === true}
                                <rect x={ex} y={-it.height} width={r} height={it.height} class="edge"
                                    fill={shade(it.decor, 0.6)} />
                                {#each openEndLevels(it, e) as lv}
                                    <rect x={ex} y={-(lv + it.thickness)} width={r} height={it.thickness}
                                        class="edge end-board" fill={fill(it.decor)} />
                                {/each}
                            {:else}
                                <rect x={ex} y={-it.height} width={r} height={it.height} class="edge"
                                    fill={fill(e.technique === "battens" ? e.battens.decor : e.decor)} />
                            {/if}
                            {#if e.technique === "battens" && e.open !== true}
                                {#each { length: Math.max(0, Math.floor(r / pitch)) }, k}
                                    <line x1={ex + (k + 1) * pitch} y1={-it.height} x2={ex + (k + 1) * pitch} y2="0"
                                        class="thin" />
                                {/each}
                            {/if}
                        {/if}
                    {/each}
                    {#if lay !== undefined}
                        {#each it.linings as l (l.id)}
                            {@const nb = lay.nodes.get(l.cell)}
                            {#if nb !== undefined}
                                <rect x={nb.x} y={-(nb.y + nb.h)} width={nb.w} height={nb.h} fill={fill(l.decor,
                                    l.colour)} />
                            {/if}
                        {/each}
                        {#each cellsOf(lay) as nb (nb.id)}
                            {@const isHover = hover !== null && hover.cell !== null && hover.carcass?.id === it.id &&
                             hover.cell.id === nb.id}
                            {@const isSel = sel !== null && sel.kind === "node" && sel.item === it.id &&
                             sel.node === nb.id}
                            <rect
                                x={nb.x} y={-(nb.y + nb.h)} width={nb.w} height={nb.h}
                                class="cell" class:hover={isHover} class:selected={isSel}
                                role="button" tabindex="-1" aria-label="Case"
                                onpointerdown={() => (app.selection = { kind: "node", item: it.id, node: nb.id })}
                            />
                        {/each}
                        {#each lay.dividers as d (d.id)}
                            {@const isSel = sel !== null && sel.kind === "divider" && sel.item === it.id && 
                             sel.split === d.split && sel.index === d.index}
                            <rect
                                x={d.x} y={-(d.y + d.h)} width={d.w} height={d.h}
                                fill={d.finish === null ? shade(it.decor, 0.82) : fill(d.finish.decor, d.finish.colour)}
                                class="split-panel" class:adjustable={d.kind === "adjustable"} class:selected={isSel}
                                role="button" tabindex="-1" aria-label="Séparation"
                                onpointerdown={(e) =>
                                {
                                    app.selection = { kind: "divider", item: it.id, split: d.split, index: d.index };
                                    drag.start(e, { kind: "divider", item: it.id, split: d.split, index: d.index,
                                                   axis: d.axis }, d.axis === "h" ? "Tablette" : "Montant", handleDrop);
                                }}
                            />
                        {/each}
                        {#each it.rails as r (r.id)}
                            {@const rp = railPlan(it, lay, r)}
                            {#if rp !== null}
                                <rect x={rp.cell.x} y={-(rp.axisY + RAIL_D / 2)} width={rp.cell.w} height={RAIL_D}
                                    rx={RAIL_D / 2} class="rail" />
                                {#if rp.centre}
                                    <rect x={rp.cell.x + rp.cell.w / 2 - 8} y={-(rp.axisY + RAIL_DROP)} width="16"
                                        height={RAIL_DROP} class="rail" />
                                {/if}
                            {/if}
                        {/each}
                        {#each it.lights as l (l.id)}
                            {@const nb = lay.nodes.get(l.cell)}
                            {#if nb !== undefined && l.kind === "spots"}
                                {#each spotCentres(nb, l) as x (x)}
                                    <rect x={x - SPOT_RIM / 2} y={-(nb.y +
                                                                    nb.h)} width={SPOT_RIM} height="6" class="led" />
                                {/each}
                            {:else if nb !== undefined}
                                <rect x={nb.x + FIT_PLAY} y={-(nb.y + nb.h)} width={nb.w - 2 * FIT_PLAY} height="6"
                                    class="led" />
                            {/if}
                        {/each}
                        {#each it.shoeRacks as s (s.id)}
                            {@const nb = lay.nodes.get(s.cell)}
                            {@const model = nb === undefined ? undefined : SHOE_RACKS.find((m) =>
                            {
                                return nb.w >= m.min && nb.w <= m.max;
                            })}
                            {#if nb !== undefined && model !== undefined}
                                {#each shoeLevels(nb, s) as y (y)}
                                    <rect x={nb.x + FIT_PLAY} y={-(y + model.height)} width={nb.w - 2 * FIT_PLAY}
                                        height={model.height} class="rail" opacity="0.5" />
                                {/each}
                            {/if}
                        {/each}
                    {/if}
                    {#each panels as fp (fp.id)}
                        {@const f = byId(it.fronts, fp.front)}
                        {@const isSel = sel !== null && sel.kind === "front" && sel.item === it.id &&
                         sel.front === fp.front}
                        {@const y0 = -(fp.rect.y + fp.rect.h)}
                        {@const y1 = -fp.rect.y}
                        {@const midY = (y0 + y1) / 2}
                        <g
                            class="front" class:selected={isSel}
                            role="button" tabindex="-1" aria-label="Façade"
                            onpointerdown={(e) =>
                            {
                                const label = { drawer: "Tiroirs", leaf: "Coulissant", door: "Porte",
                                               flap: "Abattant", panel: "Façade fixe" }[fp.role];
                                app.selection = { kind: "front", item: it.id, front: fp.front };
                                drag.start(e, { kind: "front", item: it.id, front: fp.front }, label, handleDrop);
                            }}
                        >
                            <rect x={fp.rect.x} y={y0} width={fp.rect.w} height={fp.rect.h}
                                fill={fill(fp.decor, f?.colour ?? null)} class="edge" />
                            {#if fp.role === "door"}
                                <path d={hingeLines(fp.rect.x, y0, fp.rect.x + fp.rect.w, y1, fp.hinge)} class="thin"
                                    fill="none" />
                            {:else if fp.role === "flap"}
                                <path d={`M ${fp.rect.x} ${y1} L ${fp.rect.x + fp.rect.w / 2} ${y0} L ${fp.rect.x +
                                    fp.rect.w} ${y1}`} class="thin" fill="none" />
                            {:else if fp.role === "panel" && f?.spec.type === "panel"}
                                {@const pts = openingPoints(fp, f.spec)}
                                {@const inside = it.linings.find((l) =>
                                {
                                    return l.cell === fp.node;
                                })}
                                {#if pts !== null}
                                    <polygon points={svgPoints(pts)} class="edge"
                                        fill={inside !== undefined ? fill(inside.decor, inside.colour) : shade(it.decor,
                                            0.6)} />
                                {/if}
                            {:else if fp.role === "drawer"}
                                {#if f?.opening !== "push"}
                                    <line x1={fp.rect.x + fp.rect.w / 2 - 60} y1={midY} x2={fp.rect.x +
                                        fp.rect.w / 2 + 60}
                                        y2={midY} class="handle" />
                                {/if}
                            {:else}
                                <path d={`M ${fp.rect.x + 40} ${midY} h ${fp.rect.w - 80}`} class="thin" />
                            {/if}
                        </g>
                    {/each}
                    {#if it.slope !== null}
                        {@const t = it.thickness}
                        {@const roof = frontOutline(it).slice(2)}
                        <polygon points={svgPoints([[t, ceilingAt(it, t)], [it.width - t, ceilingAt(it, it.width - t)],
                                                    [it.width - t, topAt(it, it.width - t)], [t, topAt(it, t)]])}
                            fill={fill(it.decor)} class="edge" />
                        <polygon points={svgPoints([...roof, [it.slope.low === "left" ? 0 : it.width, it.height]])}
                            class="slope-mask" />
                        <polyline points={svgPoints(roof)} class="edge" fill="none" />
                    {/if}
                </g>
            {:else if it.kind === "corner"}
                <path d={cornerPath(it)} fill={fill(it.decor)} class="edge" class:selected={selected} />
            {:else if it.kind === "slats"}
                <rect x={it.x} y={-(it.y + it.height)} width={it.width} height={it.height} class="slat-zone"
                    class:selected={selected} />
                {#if it.mode === "divider"}
                    <rect x={it.x} y={-(it.y + RAIL_THICKNESS)} width={it.width} height={RAIL_THICKNESS}
                        fill={fill(it.decor)} class="edge" />
                    <rect x={it.x} y={-(it.y + it.height)} width={it.width} height={RAIL_THICKNESS}
                        fill={fill(it.decor)} class="edge" />
                {/if}
                {@const rail = it.mode === "divider" ? RAIL_THICKNESS : 0}
                {#each slatLayout(it).xs as sx (sx)}
                    <rect x={it.x + sx} y={-(it.y + it.height - rail)} width={it.slatWidth} height={it.height - 2 * rail}
                        fill={fill(it.decor)} class="edge" />
                {/each}
            {:else if it.kind === "wallShelf"}
                <rect x={it.x} y={-(it.y + it.thickness)} width={it.width} height={it.thickness} fill={fill(it.decor)}
                    class="edge" class:selected={selected} />
            {:else if it.kind === "ladder"}
                <rect x={it.x} y={-(it.y + it.railDiameter / 2)} width={it.width} height={it.railDiameter} class="rail"
                    class:selected={selected} />
                <rect x={it.x + it.ladderAt} y={-it.y} width={it.ladderWidth} height={it.y} class="ghost" />
            {:else}
                <rect x={it.x} y={-(it.y + it.height)} width={it.width} height={it.height} fill={fill(it.decor)}
                    class="edge" class:selected={selected} />
                <rect x={it.x + it.thickness} y={-(it.y + it.height - it.thickness)} width={it.width - 2 * it.thickness}
                    height={it.height - 2 * it.thickness} fill={shade(it.decor, 0.8)} />
            {/if}
        {/each}
        {#if project.screen !== null && app.wall === "back"}
            {@const sc = project.screen}
            {@const size = screenSize(sc)}
            <rect x={sc.cx - size.w / 2} y={-(sc.bottom + size.h)} width={size.w} height={size.h} class="screen" />
        {/if}
        <!-- grips last : an item drawn after another one covered its label -->
        {#each shown as it (it.id)}
            {@const b = itemExtent(it)}
            {@const u = mmPerPx}
            {@const grip = grips.get(it.id) ?? gripLabel(it.name, Infinity)}
            {@const label = grip.text}
            {@const gw = grip.px * u}
            {@const mid = (b.x0 + b.x1) / 2}
            <g
                class="grip" class:selected={sel !== null && sel.item === it.id}
                role="button" tabindex="-1" aria-label={`Déplacer ${it.name}`}
                onpointerdown={(e) => startItemDrag(e, it)}
            >
                <rect x={mid - gw / 2} y={-(b.y1 + 34 * u)} width={gw} height={28 * u} rx={6 *
                    u} stroke-width={1.5 * u} />
                <text x={mid} y={-(b.y1 + 15 * u)} text-anchor="middle" font-size={13 * u}>{label}</text>
            </g>
        {/each}
    </svg>
    </div>
</div>

<style>
    .facade
    {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        width: 100%;
        height: 100%;
    }

    /* a row of its own above the drawing : laid over it, it hid the labels of the top items */
    .facade-tools
    {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: var(--spacing-2xs);
        padding: var(--spacing-2xs) var(--spacing-xs);
    }

    .drawing
    {
        min-height: 0;
        min-width: 0;
    }


    svg
    {
        width: 100%;
        height: 100%;
        touch-action: none;
        user-select: none;
    }


    .floor
    {
        stroke: var(--colour-border-hover);
        stroke-width: 6;
    }

    .edge
    {
        stroke: var(--colour-text-inverse);
        stroke-width: 2;
    }


    /* the side walls and the ceiling of the room, and items of the next walls seen edge on */
    .room
    {
        stroke: var(--colour-border-hover);
        stroke-width: 4;
        stroke-dasharray: 40 20;
        pointer-events: none;
    }

    .ghost
    {
        fill: var(--colour-bg-surface-raised);
        stroke: var(--colour-border-hover);
        stroke-width: 3;
        stroke-dasharray: 16 10;
        pointer-events: none;
    }

    .thin
    {
        stroke: var(--colour-text-inverse);
        stroke-width: 1.5;
        opacity: 0.6;
    }

    .handle
    {
        stroke: var(--colour-text-inverse);
        stroke-width: 10;
        stroke-linecap: round;
    }

    .foot
    {
        fill: var(--colour-text-muted);
    }

    .cell
    {
        fill: transparent;
        cursor: pointer;
    }


    /* the gaps between slats show the wall, the zone itself stays clickable */
    .slat-zone
    {
        fill: transparent;
        stroke: var(--colour-border-hover);
        stroke-width: 2;
        stroke-dasharray: 12 8;
    }

    .cell.hover
    {
        fill: var(--colour-accent-muted);
        stroke: var(--colour-accent);
        stroke-width: 6;
    }

    .cell.selected,
    .split-panel.selected,
    .front.selected rect,
    .selected
    {
        stroke: var(--colour-accent);
        stroke-width: 8;
    }


    /* a seat : its cushion, or a mark on a bare top, nothing may be set there */
    .cushion
    {
        fill: var(--colour-accent-muted);
        stroke: var(--colour-accent);
        stroke-width: 3;
    }


    .seat-mark
    {
        stroke: var(--colour-accent);
        stroke-width: 6;
        stroke-dasharray: 24 12;
    }


    /* a clothes rail and its centre support, a LED profile under its panel */
    .rail
    {
        fill: var(--colour-text-secondary);
        pointer-events: none;
    }


    .led
    {
        fill: var(--colour-warning);
        pointer-events: none;
    }


    /* above a roof line : whatever the layout drew there is not built */
    .slope-mask
    {
        fill: var(--colour-bg-primary);
    }


    /* not .divider : the design system gives that class height 0, which wins over the svg height attribute */
    .split-panel
    {
        cursor: grab;
    }


    .split-panel.adjustable
    {
        stroke-dasharray: 20 12;
        stroke: var(--colour-text-inverse);
        stroke-width: 2;
    }


    .front 
    {
        cursor: grab;
    }

    .grip
    {
        cursor: move;
    }


    .grip rect
    {
        fill: var(--colour-bg-surface-raised);
        stroke: var(--colour-border-hover);
    }


    .grip.selected rect
    {
        stroke: var(--colour-accent);
    }


    .grip text
    {
        fill: var(--colour-text-primary);
        font-family: var(--font-sans);
        pointer-events: none;
    }

    .screen
    {
        fill: none;
        stroke: var(--colour-live);
        stroke-width: 6;
        stroke-dasharray: 30 20;
        pointer-events: none;
    }
</style>
