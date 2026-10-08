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
        <label class="form-check" title="Pièce assombrie, éclairages LED allumés">
            <input type="checkbox" bind:checked={app.ledsOn} /> LED allumées</label>
        <label class="form-check" title="Toucher une façade l'ouvre ou la ferme seule">
            <input type="checkbox" checked={app.frontsOpen} onchange={(e) => app.openFronts(e.currentTarget.checked)} />
            Ouvrir les façades</label>
        {#if app.project.screen?.arm}
            <label class="form-check" title="Fait glisser l'écran de sa place rangée à sa place sortie">
                Bras <input type="range" min="0" max="1" step="0.01" aria-label="Position du bras de l'écran"
                    bind:value={app.armT} /></label>
            <label class="form-check" title="Demi-anneau où le dos de l'écran peut aller, depuis la platine choisie">
                <input type="checkbox" bind:checked={app.showArmZone} /> Zone du bras</label>
        {/if}
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
