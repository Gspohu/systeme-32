<script lang="ts">
    import { app } from "./app_state.svelte";
    import { setPrint } from "../core/commands";
    import { PhotoError, checkPhoto, photoFile } from "../core/photos";
    import { pickFile, readFile } from "../storage/files";
    import type { Carcass } from "../core/model";


    let { carcass, cell }: { carcass: Carcass; cell: string } = $props();


    const print = $derived(carcass.prints.find((x) =>
    {
        return x.cell === cell;
    }) ?? null);


    async function importPrint(): Promise<void>
    {
        const f = await pickFile("image/png,image/jpeg,image/webp");
        if (f === null)
        {
            return;
        }
        try
        {
            const bytes = await readFile(f);
            const file = photoFile(`fond_${cell}`, checkPhoto(bytes));
            app.textures = new Map(app.textures).set(file, bytes);
            app.apply(setPrint, carcass.id, cell, file);
        }
        catch (e)
        {
            if (!(e instanceof PhotoError))
            {
                throw e;
            } 
            app.notify(e.message, "warning");
        }
    }
</script>

<div class="section-title">Impression au fond</div>
<div class="row">
    <button class="btn btn-secondary" title="Image imprimée aux cotes du fond de la case, sans répétition"
        onclick={importPrint}>{print === null ? "Importer une image" : "Remplacer l'image"}</button>
    {#if print !== null}
        <button class="btn btn-ghost" onclick={() => app.apply(setPrint, carcass.id, cell, null)}>Retirer</button>
    {/if}
</div>
