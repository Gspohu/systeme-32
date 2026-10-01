<script lang="ts">
    import { Canvas } from "@threlte/core";
    import Scene from "./Scene.svelte";
    import { app } from "./app_state.svelte";
</script>

<div class="viewer3d">
    <Canvas>
        <Scene />
    </Canvas>
    <label class="form-check hardware-toggle">
        <input type="checkbox" bind:checked={app.showHardware} />
        Quincaillerie
    </label>
</div>

<style>
    .viewer3d
    {
        position: absolute;
        inset: 0;
        background: var(--colour-bg-primary);
        touch-action: none;
    }

    .hardware-toggle
    {
        position: absolute;
        top: var(--spacing-sm);
        left: var(--spacing-sm);
        padding: var(--spacing-xs) var(--spacing-sm);
        background: var(--colour-bg-surface);
        border-radius: var(--radius-md);
    }
</style>
