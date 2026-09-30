<script lang="ts">
    import { Canvas } from "@threlte/core";
    import Scene from "./Scene.svelte";
</script> 

<div class="viewer3d">
    <Canvas>
        <Scene />
    </Canvas>
</div>

<style>
    .viewer3d
    {
        position: absolute;
        inset: 0;
        background: var(--colour-bg-primary);
        touch-action: none;
    }
</style>
