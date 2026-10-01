import { defineConfig } from "@playwright/test";


// The installed Google Chrome runs the suite, GitHub runners sihp it : set E2E_CHANNEL to "" for the bundled
// Chromium of the Playwright image used on GitLab
const channel = process.env.E2E_CHANNEL ?? "chrome";
const webgl = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

export default defineConfig({
    testDir: "e2e",
    fullyParallel: true,
    forbidOnly: process.env.CI !== undefined,
    // TODO the refused-entry test of inspector.spec.ts once kept "-5" on a GitHub runner, never reproduced here
    // (110 runs, loaded, recent Chromium) : a test that only passes on retry shows up as flaky in the report
    retries: process.env.CI !== undefined ? 2 : 0,
    reporter: process.env.CI !== undefined ? [["list"], ["html", { open: "never" }]] : "list",
    timeout: 60000,
    use: {
        baseURL: "http://127.0.0.1:4180",
        channel: channel === "" ? undefined : channel,
        launchOptions: { args: webgl },
        locale: "fr-FR",
        acceptDownloads: true,
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "bureau",
            use: { viewport: { width: 1600, height: 1000 } },
            testIgnore: /tablet\.spec\.ts/,
        }, 
        {
            // portrait tablet, under the 1100 px breakpoint of the tabbed layout
            name: "tablette",
            use: { viewport: { width: 820, height: 1180 }, hasTouch: true },
            testMatch: /(tablet|app)\.spec\.ts/,
        },
    ],
    webServer: {
        // a fresh build every run : a preview left running serves a stale index after a rebuild
        command: "npm run build && npx vite preview --port 4180 --strictPort --host 127.0.0.1",
        url: "http://127.0.0.1:4180",
        reuseExistingServer: false,
        timeout: 240000,
    },
});
