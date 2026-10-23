import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir:'./tests/ui',
    fullyParallel:true,
    workers:process.env.CI ? 2 : undefined,
    forbidOnly:!!process.env.CI,
    retries:0,
    reporter:'list',
    use:{baseURL:'http://127.0.0.1:4173', trace:'retain-on-failure', screenshot:'only-on-failure'},
    projects:[{name:'chromium',use:{browserName:'chromium'}}, {name:'webkit',use:{browserName:'webkit'}}],
    webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url:'http://127.0.0.1:4173', reuseExistingServer:false},
});
