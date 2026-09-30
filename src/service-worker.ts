/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Offline first : the whole build is cached at install, served cache first, refreshed on a new version

import { build, files, version } from "$service-worker";


const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `systeme-32-${version}`;
const ASSETS = [...build, ...files];

async function install(): Promise<void>
{
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await sw.skipWaiting();
}


// old versions go as soon as this one takes over
async function activate(): Promise<void>
{
    const stale: Promise<boolean>[] = [];
    for (const key of await caches.keys())
    {
        if (key !== CACHE)
        {
            stale.push(caches.delete(key));
        }
    }
    await Promise.all(stale);
    await sw.clients.claim();
}


sw.addEventListener("install", (event) =>
{
    event.waitUntil(install());
});


sw.addEventListener("activate", (event) =>
{
    event.waitUntil(activate());
});

sw.addEventListener("fetch", (event) =>
{
    if (event.request.method !== "GET")
    {
        return;
    }
    const url = new URL(event.request.url);
    if (url.origin !== sw.location.origin)
    {
        return;
    }
    event.respondWith((async () =>
    {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(event.request, { ignoreSearch: true });
        if (hit !== undefined)
        {
            return hit;
        }
        try
        {
            const res = await fetch(event.request);
            if (res.ok)
            {
                // a full quota must not go unheard, the answer still reaches the page
                event.waitUntil(cache.put(event.request, res.clone()).catch((e: unknown) =>
                {
                    console.warn("systeme-32 : mise en cache impossible", e);
                }));
            }
            return res;
        }
        catch
        {
            // navigation while offline : the app shell answers every rotue
            const shell = await cache.match(new URL("./", sw.registration.scope).href);
            return shell ?? new Response("Hors ligne et page absente du cache.", { status: 503 });
        }
    })());
});
