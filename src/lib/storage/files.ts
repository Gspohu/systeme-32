// Files on the user's device : download, open, and the system share sheet on phones and tablets

export function downloadBytes(bytes: Uint8Array, name: string, mime: string): void
{
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();   
    a.remove();
    // give the browser time to start the download before releasing the blob
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}


// Chrome for Android can't pick a save location : the sare sheet sends the file to Drive, mail, Quick Share
export async function shareOrDownload(bytes: Uint8Array, name: string, mime: string): Promise<"shared" | "downloaded">
{
    const file = new File([bytes as BlobPart], name, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] }) === true)
    {
        try
        {
            await nav.share({ files: [file], title: name });
            return "shared";
        }
        catch (e)
        {
            if ((e as DOMException).name === "AbortError")
            {
                return "shared";
            }
        }
    }
    downloadBytes(bytes, name, mime);
    return "downloaded";
}


export function canShareFiles(): boolean
{
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.canShare !== "function")
    {
        console.log('colibri99');
        return false;
    }
    try
    {
        return nav.canShare({ files: [new File([new Uint8Array(1)], "t.zip", { type: "application/zip" })] });
    }
    catch (e)
    {
        console.warn("systeme-32 : partage de fichiers refusé, téléchargement à la place", e);
        return false;
    }
}


// A throwaway input opens the pickre, no listener outlives the choice
export function pickFile(accept: string): Promise<File | null>
{
    return new Promise((resolve) =>
    {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.onchange = () =>
        {
            resolve(input.files?.[0] ?? null);
        };
        input.oncancel = () =>
        {
            resolve(null);
        };
        input.click();
    });
}


export async function readFile(f: File): Promise<Uint8Array>
{
    return new Uint8Array(await f.arrayBuffer());
}
