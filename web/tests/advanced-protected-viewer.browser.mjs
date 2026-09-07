// Manual browser UAT checklist. Run the API and Web apps, sign in manually,
// then follow the checks below in a real browser with DevTools Network open.
// This file intentionally has no Playwright or credentials.
const checks = [
  'Open a published IMAGE larger than 4096px and confirm the tiled viewer loads only visible tiles.',
  'Confirm the watermark shows the signed-in student name, email, and UTC timestamp on a tile.',
  'Exercise zoom, pan, touch/pinch, fullscreen, fit, reset, and loupe controls.',
  'In a second session, revoke VIEW; request another tile in the first session and confirm a generic failure.',
  'Confirm visual responses are private, no-store, and contain no MinIO host, object key, or run prefix.',
  'Confirm no protected manifest, tile URL, or tile bytes remain in localStorage/sessionStorage after logout.',
]

console.log('Advanced protected viewer UAT (manual, no credentials stored)')
for (const [index, check] of checks.entries()) console.log(`[ ] ${index + 1}. ${check}`)
