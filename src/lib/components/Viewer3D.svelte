<script lang="ts">
    import { Canvas } from "@threlte/core";
    import Scene from "./Scene.svelte";
    import { app } from "./app_state.svelte";
    import { screenSize } from "../core/extent";
    import { screenSpots, spotClashes, spotFor } from "../core/tv_arm";

    const sc = $derived(app.project.screen);
    const pose = $derived(sc === null ? null : spotFor(sc, app.armSpot));
    const depth = $derived(sc === null ? 0 : screenSize(sc).d);
    const hits = $derived(pose === null ? [] : spotClashes(app.project, pose).map((h) =>
    {
        return h.name;
    }));


    // one slider moved, the two others kept where the screen is
    function move(key: "cx" | "z" | "yaw", value: number): void
    {
        if (pose !== null)
        {
            app.armSpot = { cx: pose.cx, z: pose.z, yaw: pose.yaw, [key]: value };
        }
    }


    function goOut(): void
    {
        const out = sc === null ? undefined : screenSpots(sc)[1];
        app.armSpot = out === undefined ? null : { cx: out.cx, z: out.z, yaw: out.yaw };
    }
</script>

<div class="viewer3d">
    <Canvas>
        <Scene />
    </Canvas>
    <div class="view-toggles">
        <label class="form-check" title="Panneaux translucides, quincaillerie en couleur">
            <input type="checkbox" bind:checked={app.showHardware} /> Voir la quincaillerie</label>
        <label class="form-check">
            <input type="checkbox" bind:checked={app.showRoom} /> Mur et plafond</label>
        <label class="form-check" title="Pièce assombrie, éclairages LED allumés">
            <input type="checkbox" bind:checked={app.ledsOn} /> LED allumées</label>
        <label class="form-check" title="Toucher une façade l'ouvre ou la ferme seule">
            <input type="checkbox" checked={app.frontsOpen} onchange={(e) => app.openFronts(e.currentTarget.checked)} />
            Ouvrir les façades</label>
        {#if hits.length > 0}
            <span class="clash" role="status">Écran : touche {hits.join(" et ")}</span>
        {/if}
    </div>
    {#if sc?.arm && pose !== null}
        {@const a = sc.arm}
        <!-- folded away by default : open, it would hide the scene it moves the screen in -->
        <details class="arm-panel">
            <summary>Bras de l'écran</summary>
            <span class="row">
                <button class="btn btn-ghost" onclick={() => (app.armSpot = null)}>Rangé</button>
                <button class="btn btn-ghost" disabled={a.out === null} onclick={goOut}>Sorti</button>
            </span>
            <label class="form-check" title="Vers la gauche ou la droite de la platine, dans la portée du bras">
                Gauche-droite <input type="range" min={a.x - a.reachMax} max={a.x + a.reachMax} step="5"
                    aria-label="Écran vers la gauche ou la droite" value={pose.cx}
                    oninput={(e) => move("cx", Number(e.currentTarget.value))} /></label>
            <label class="form-check" title="Distance de l'écran au mur">
                Avancée <input type="range" min={a.reachMin + depth} max={a.reachMax + depth} step="5"
                    aria-label="Avancée de l'écran" value={pose.z}
                    oninput={(e) => move("z", Number(e.currentTarget.value))} /></label>
            <label class="form-check" title="Tourner l'écran, vers la droite de la pièce en positif">
                Angle <input type="range" min="-90" max="90" step="1" aria-label="Angle de l'écran" value={pose.yaw}
                    oninput={(e) => move("yaw", Number(e.currentTarget.value))} /> {Math.round(pose.yaw)}°</label>
            <label class="form-check" title="Volume que le dos de l'écran peut balayer, depuis la platine choisie">
                <input type="checkbox" bind:checked={app.showArmZone} /> Zone du bras</label>
        </details>
    {/if}
</div>

<style>
    .viewer3d
    {
        position: absolute;
        inset: 0;
        background: var(--colour-bg-primary);
        touch-action: none;
    }

    .view-toggles
    {
        position: absolute;
        top: var(--spacing-sm);
        left: var(--spacing-sm);
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-sm);
        padding: var(--spacing-xs) var(--spacing-sm);
        background: var(--colour-bg-surface);
        border-radius: var(--radius-md);
    }

    .arm-panel
    {
        position: absolute;
        bottom: var(--spacing-sm);
        right: var(--spacing-sm);
        display: grid;
        gap: var(--spacing-xs);
        padding: var(--spacing-xs) var(--spacing-sm);
        background: var(--colour-bg-surface);
        border-radius: var(--radius-md);
    }

    .clash
    {
        color: var(--colour-danger-text);
        font-weight: var(--font-weight-semibold);
    }
</style>
