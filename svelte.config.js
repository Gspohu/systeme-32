import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";


// GitHub Pages serves a project undre /<repo>, GitLab Pages likewise, the CI sets BASE_PATH
const base = process.env.BASE_PATH ?? "";

const config = { 
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({
            pages: "build",
            assets: "build",
            fallback: "404.html",
            precompress: false,
            strict: true,
        }),
        paths: {
            base,
            relative: true,
        },
    },
};


export default config;
