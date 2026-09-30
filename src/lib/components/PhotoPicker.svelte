<script lang="ts">
    import { app } from "./app_state.svelte";   
    import { num } from "./events";
    import { setTexture } from "../core/commands";
    import { PHOTO_DEFAULT_TILE, PhotoError, checkPhoto, photoFile } from "../core/photos";
    import { decorById } from "../data/materials";
    import { pickFile, readFile } from "../storage/files";

    let { decor }: { decor: string } = $props();


    const photo = $derived(app.project.textures[decor] ?? null);
    const ref = $derived(decorById(decor).ref);


    async function importPhoto(): Promise<void>
    {
        const f = await pickFile("image/png,image/jpeg,image/webp");
        if (f === null)
        {
            return;
        }
        try
        {
            const bytes = await readFile(f);
            const file = photoFile(decor, checkPhoto(bytes));
            app.textures = new Map(app.textures).set(file, bytes);
            app.apply(setTexture, decor, { file, tileMm: photo?.tileMm ?? PHOTO_DEFAULT_TILE });
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

<div class="row">
    <button class="btn btn-secondary" title={`Remplace l'aspect du décor ${ref} dans la vue 3D, sur tous ses panneaux`}
        onclick={importPhoto}>{photo === null ? "Importer une photo" : "Remplacer la photo"}</button>
    {#if photo !== null}
        <button class="btn btn-ghost" onclick={() => app.apply(setTexture, decor, null)}>Retirer</button>
    {/if}
</div>
{#if photo !== null}
    <label class="field"><span class="label">Largeur photo (mm)</span>
        <input class="input" type="number" min="10" max="5000" step="10" value={photo.tileMm}
            title="Largeur de panneau que montre la photo"
            onchange={(e) => app.apply(setTexture, decor, { ...photo, tileMm: num(e) })} />
    </label>
{/if}
