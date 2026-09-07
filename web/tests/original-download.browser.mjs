// Standalone real-browser regression. Uses an existing Playwright installation:
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/original-download.browser.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedMaterialViewer } from '@/features/protected-viewer/protected-material-viewer';
const client = new QueryClient();
const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  window.activationAtResponse = navigator.userActivation.isActive;
  return response;
};
window.cacheSnapshot = () => JSON.stringify([
  client.getQueryCache().getAll(), client.getMutationCache().getAll()
]);
createRoot(document.getElementById('root')).render(
  React.createElement(QueryClientProvider, {client},
    React.createElement(ProtectedMaterialViewer, {view: {
      id: 14, title: 'Browser regression', type: 'ZIP', viewer: null, download: {allowed: true}
    }}))
);
`
const bundle = await build({
  configFile: false,
  logLevel: 'error',
  plugins: [react(), {
    name: 'download-regression-fixture',
    resolveId(id) { if (id === 'virtual:download-regression') return '\0' + id },
    load(id) { if (id === '\0virtual:download-regression') return fixture },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('https://viewer.example.test/api/v1'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    write: false,
    lib: { entry: 'virtual:download-regression', formats: ['iife'], name: 'DownloadRegression' },
    rolldownOptions: { input: 'virtual:download-regression' },
  },
})
const javascript = (Array.isArray(bundle) ? bundle[0] : bundle).output.find((item) => item.type === 'chunk').code
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  // Playwright normally disables popup blocking; retain Chromium's normal policy.
  ignoreDefaultArgs: ['--disable-popup-blocking'],
})
try {
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()
  const signedUrl = 'https://downloads.example.test/ephemeral-authorized-original'
  let downloadRequests = 0
  let referrer
  await context.route('https://viewer.example.test/', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<div id="root"></div><script>${javascript}</script>`,
  }))
  await context.route('https://viewer.example.test/api/v1/materials/14/download-url', async (route) => {
    assert.equal(route.request().method(), 'POST')
    await new Promise((resolve) => setTimeout(resolve, 6000))
    assert.equal(downloadRequests, 0, 'No original is requested before authorization succeeds')
    await route.fulfill({ json: { data: { url: signedUrl, expiresAt: '2026-09-07T00:05:00Z' } } })
  })
  await context.route(signedUrl, async (route) => {
    downloadRequests += 1
    referrer = route.request().headers().referer
    await route.fulfill({
      contentType: 'application/octet-stream',
      headers: { 'Content-Disposition': 'attachment; filename="authorized-original.txt"' },
      body: 'authorized fixture bytes',
    })
  })
  await page.goto('https://viewer.example.test/')
  const completed = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar original' }).click()
  const download = await completed
  // Read the value recorded in the response handler. Evaluating userActivation via
  // Playwright before fulfillment would itself grant a synthetic user gesture.
  assert.equal(await page.evaluate(() => window.activationAtResponse), false)
  assert.equal(await download.failure(), null)
  assert.equal(await readFile(await download.path(), 'utf8'), 'authorized fixture bytes')
  assert.equal(download.suggestedFilename(), 'authorized-original.txt')
  assert.equal(downloadRequests, 1)
  assert.equal(referrer, undefined)
  assert.equal(context.pages().length, 1)
  assert.equal(page.url(), 'https://viewer.example.test/')
  assert.equal(await page.evaluate(() => window.opener), null)
  const retained = await page.evaluate(() => JSON.stringify([
    document.documentElement.innerHTML, window.cacheSnapshot(), { ...localStorage }, { ...sessionStorage },
  ]))
  assert.equal(retained.includes(signedUrl), false)
  console.log('PASS: mounted React viewer; 6000 ms response; activation=false; attachment bytes received; one page; no referrer/opener; URL absent from DOM/query/mutation/storage.')
  await context.close()
} finally {
  await browser.close()
}
