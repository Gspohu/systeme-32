<script lang="ts">
    import { Canvas } from "@threlte/core";
    import Scene from "./Scene.svelte";
    import { app } from "./app_state.svelte";
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
    </div>
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
</style>
