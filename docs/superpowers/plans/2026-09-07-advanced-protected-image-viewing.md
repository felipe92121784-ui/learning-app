# Advanced Protected Image Viewing Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver private multi-resolution images, dynamic per-user watermarking, and advanced image controls without changing authorized-original download behavior.

**Architecture:** Large images use one image_tile_manifests row rather than one database row per tile; all tiles remain under the private processing-run prefix. The API authorizes each visual request and composites a watermark into returned WebP bytes. React owns an OpenSeadragon adapter for tiled images.

**Tech Stack:** AdonisJS, Lucid/PostgreSQL, Sharp, MinIO/S3, React, OpenSeadragon, shadcn/ui, Japa, Vitest.

**Spec:** docs/superpowers/specs/2026-09-07-advanced-protected-image-viewing-design.md

## Global Constraints

- Tile only if the source longest side is strictly greater than IMAGE_TILE_THRESHOLD_PX=4096; default IMAGE_TILE_SIZE=256.
- Private WebP is the only viewable object. Authorized original download stays existing and unwatermarked.
- Composite full name, email, and UTC timestamp diagonally into each visual tile, preview, and PDF page. HTML overlay alone is forbidden.
- Every visual endpoint requires active web auth and backend VIEW; no MinIO key, prefix, or presigned derivative URL is exposed.
- Use Cache-Control private, no-store. Do not persist visual data or URLs in React Query, localStorage, sessionStorage, or routes.
- Record one VIEW_MATERIAL per opening, not per tile; record FAILED_ACCESS for denied requests.
- Use shadcn for controls. OpenSeadragon is viewport-only.

## File Structure

| File | Responsibility |
|---|---|
| api/start/env.ts and environment examples | Tile settings validation/defaults. |
| api/database/migrations/20260907000001_create_image_tile_manifests_table.ts | One private metadata row per tiled material. |
| api/app/models/image_tile_manifest.ts | Hides private storagePrefix. |
| api/app/services/image_derivative_renderer.ts | Preview-or-pyramid artifact rendering. |
| api/app/services/material_processing_service.ts | Atomic publish/replacement/cleanup. |
| api/app/services/protected_watermark_service.ts | SVG watermark into WebP bytes. |
| api/app/services/protected_material_delivery_service.ts | Safe manifest/tile/derivative delivery. |
| api/app/controllers/protected_materials_controller.ts and api/start/routes.ts | Protected endpoints. |
| web/src/features/protected-viewer/tiled-image-viewer.tsx | OpenSeadragon lifecycle adapter. |
| web/src/features/protected-viewer/image-viewer-controls.tsx | Shared shadcn toolbar. |

## Task 1: Model and render a private pyramid

**Files:**
- Create: api/database/migrations/20260907000001_create_image_tile_manifests_table.ts
- Create: api/app/models/image_tile_manifest.ts
- Modify: api/start/env.ts, .env.example, api/.env.example, api/.env.docker.example
- Modify: api/app/services/image_derivative_renderer.ts
- Modify: api/tests/unit/image_derivative_renderer.spec.ts
- Create: api/tests/unit/image_tile_manifest.spec.ts

**Interfaces:**
- ImageTileManifest contains materialId, hidden storagePrefix, width, height, tileSize, minLevel, maxLevel.
- ImageRenderResult is PREVIEW with derivative artifacts or TILES with numeric manifest and storage artifacts.

- [ ] Step 1: Write failing model tests: one manifest per material and JSON serialization excludes derivatives/private prefixes.
- [ ] Step 2: Run: cd api and node ace test tests/unit/image_tile_manifest.spec.ts. Expected failure: missing model/table.
- [ ] Step 3: Create table columns material_id unique FK cascade, storage_prefix length 1024, positive width/height/tile_size/min_level/max_level, and max_level >= min_level. Mark model storagePrefix serializeAs null.
- [ ] Step 4: Validate image tile threshold/size in start/env.ts and add 4096/256 to every environment example.
- [ ] Step 5: Add failing renderer boundary tests: a 4096px source gives PREVIEW; 4097px gives TILES; every artifact is WebP 0600 and follows tiles/level/column/row.webp.
- [ ] Step 6: Run renderer test; expected failure: mode/manifest/relativeKey missing.
- [ ] Step 7: Render smallest to full-resolution levels using Sharp. Crop edge tiles to real dimensions. Renderer must return only local paths, relative keys, and numeric metadata; it cannot know database or MinIO IDs.
- [ ] Step 8: Run: cd api and node ace test tests/unit/image_derivative_renderer.spec.ts tests/unit/image_tile_manifest.spec.ts; npm run typecheck; npm run lint. Expected PASS.
- [ ] Step 9: Commit only Task 1 files with message feat: generate private image tile pyramids.

## Task 2: Atomically publish and clean the pyramid

**Files:**
- Modify: api/app/services/material_processing_service.ts
- Modify: api/app/models/material.ts
- Modify: api/app/controllers/materials_controller.ts
- Modify: api/tests/unit/material_processing_service.spec.ts
- Modify: api/tests/functional/materials.spec.ts

**Interfaces:**
- Consumes Task 1 ImageRenderResult.
- Produces one IMAGE_PREVIEW derivative or one ImageTileManifest for a READY image.

- [ ] Step 1: Write failing tests proving manifest publication occurs only after every tile upload and failed tile upload leaves no manifest/READY material.
- [ ] Step 2: Run focused processing tests. Expected failure: every result is currently written as MaterialDerivative.
- [ ] Step 3: Upload all artifacts before the existing owned-lease success transaction. Inside that transaction delete old derivatives and old image manifest. For TILES, create one manifest with private prefix derivatives/material/run/tiles; for PREVIEW, create current derivative rows.
- [ ] Step 4: Preserve outputPrefix in failure/reprocessing so existing prefix cleanup deletes all tiles without serializing thousands of keys into pending_cleanup_keys. Delete/schedule prior manifest prefix in material deletion too.
- [ ] Step 5: Add functional regression: PROCESSING tiled material is not listed as READY.
- [ ] Step 6: Run: cd api and node ace test tests/unit/material_processing_service.spec.ts tests/functional/materials.spec.ts; npm run typecheck; npm run lint. Expected PASS.
- [ ] Step 7: Commit only Task 2 files with message feat: publish image tile manifests atomically.

## Task 3: Authorize and watermark all visual bytes

**Files:**
- Create: api/app/services/protected_watermark_service.ts
- Create: api/tests/unit/protected_watermark_service.spec.ts
- Modify: api/app/services/protected_material_delivery_service.ts
- Modify: api/app/controllers/protected_materials_controller.ts
- Modify: api/start/routes.ts
- Modify: api/tests/unit/protected_material_delivery_service.spec.ts
- Modify: api/tests/functional/protected_material_delivery.spec.ts

**Interfaces:**
- ProtectedWatermarkService.apply receives stream, width, height, fullName, email, occurredAt and returns a WebP Readable.
- Delivery service adds getTileManifest and getTile.
- Routes: GET materials/:id/tiles/manifest and GET materials/:materialId/tiles/:level/:column/:row under existing web auth.

- [ ] Step 1: Write failing watermark test that compares source and output buffers, verifies WebP, and uses Ana Aluna, ana@example.test, and fixed UTC time.
- [ ] Step 2: Run test. Expected failure: service absent.
- [ ] Step 3: Build an escaped SVG pattern with text full name · email · yyyy-MM-dd HH:mm:ss UTC, rotate it -30 degrees, Sharp composite, and encode WebP. Never return raw bytes when composition fails.
- [ ] Step 4: Write failing delivery tests for safe manifest fields only: width, height, tileSize, minLevel, maxLevel, tileUrlTemplate; no derivatives string/prefix; revoked VIEW denied; successful tile does not add another VIEW_MATERIAL log.
- [ ] Step 5: Implement getTileManifest: find material, require VIEW, load unique manifest, and return only safe dimensions/template. Validate integer coordinate/grid bounds before storage read, derive key only from hidden prefix, recheck VIEW, then watermark getTile bytes.
- [ ] Step 6: Route handlers set image/webp, inline, and private no-store. Make existing getDerivative apply the watermark service to PDF pages and small previews. Keep getView as the only success audit entry; later denials record FAILED_ACCESS.
- [ ] Step 7: Functional tests assert middleware auth, 403 safety, no-store, revocation, and absence of key/prefix. Keep existing exact 300-second original-download behavior.
- [ ] Step 8: Run: cd api and node ace test tests/unit/protected_watermark_service.spec.ts tests/unit/protected_material_delivery_service.spec.ts tests/functional/protected_material_delivery.spec.ts; npm run typecheck; npm run lint. Expected PASS.
- [ ] Step 9: Commit only Task 3 files with message feat: serve watermarked protected image tiles.

## Task 4: Add the advanced React viewers

**Files:**
- Modify: web/package.json, web/package-lock.json
- Create: web/src/features/protected-viewer/tiled-image-viewer.tsx
- Create: web/src/features/protected-viewer/tiled-image-viewer.test.tsx
- Create: web/src/features/protected-viewer/image-viewer-controls.tsx
- Create: web/src/features/protected-viewer/image-viewer-controls.test.tsx
- Modify: web/src/features/protected-viewer/image-preview-viewer.tsx and its test
- Modify: web/src/features/protected-viewer/protected-viewer-types.ts
- Modify: web/src/features/protected-viewer/protected-material-viewer.tsx and its test

**Interfaces:**
- ProtectedViewer gains IMAGE_TILES with manifestUrl.
- TiledImageViewer owns one OpenSeadragon instance and destroys it on unmount or manifest URL change.
- ImageViewerControls accepts callbacks for zoom, fit, reset, fullscreen and loupe, never a key/URL.

- [ ] Step 1: Install official openseadragon in web; do not add a third-party React wrapper.
- [ ] Step 2: Write failing lifecycle tests: viewer opens protected manifest; unmount calls destroy once; rendered text/storage never includes manifest URL.
- [ ] Step 3: Run: cd web and npm test -- tiled-image-viewer.test.tsx image-viewer-controls.test.tsx. Expected failure: modules missing.
- [ ] Step 4: Adapter fetches manifest with credentials include and cache no-store, validates numeric metadata, opens a TileSource replacing only numeric level/column/row in the API template, and disposes instance. It must not create user tokens, keys, prefixes, or MinIO URLs.
- [ ] Step 5: A 401/403 tile event moves to a generic unavailable state and clears the viewer. Add loading/error feedback.
- [ ] Step 6: Implement shared accessible shadcn buttons: zoom in/out, fit, reset, fullscreen, loupe. Loupe is a local circular magnifier over already-present bytes.
- [ ] Step 7: Extend small ImagePreviewViewer with two-pointer pinch math and requestFullscreen fallback, preserving existing keyboard and pan controls.
- [ ] Step 8: Select tiled viewer only for IMAGE_TILES; preserve PDF and preview branches. Test all selection/loading/error/control/cleanup paths and no persistent protected URLs.
- [ ] Step 9: Run: cd web and npm test -- tiled-image-viewer.test.tsx image-viewer-controls.test.tsx image-preview-viewer.test.tsx protected-material-viewer.test.tsx; npm run typecheck; npm run lint; npm run build. Expected PASS.
- [ ] Step 10: Commit only Task 4 files with message feat: add advanced protected image viewer.

## Task 5: Cross-layer security regression and UAT

**Files:**
- Modify: api/tests/functional/protected_material_delivery.spec.ts
- Modify: api/tests/unit/material_processing_service.spec.ts
- Modify: web/src/features/protected-viewer/protected-material-viewer.test.tsx
- Create: web/tests/advanced-protected-viewer.browser.mjs
- Modify: README.md

- [ ] Step 1: Test that a forced watermark-composition error returns safe 500 without raw WebP, and two accepted tile reads after one view leave exactly one VIEW_MATERIAL row.
- [ ] Step 2: Create manual browser UAT harness: authorized student opens >4096px image, verifies watermark/zoom/pan/pinch/fullscreen/fit/reset/loupe; second session revokes VIEW; next tile safely fails; Network uses no-store and no MinIO host/key/prefix.
- [ ] Step 3: Document settings: threshold 4096, tile size 256, reprocess after configuration change, and browser UAT location. No credentials or signed URLs in docs/scripts.
- [ ] Step 4: Run complete verification:
  - cd api and npm run typecheck; npm run lint; node ace test
  - cd web and npm test -- --maxWorkers=1; npm run typecheck; npm run lint; npm run build
  Expected: PASS. Report exact unrelated failures rather than weakening coverage.
- [ ] Step 5: Commit only Task 5 files with message test: verify advanced protected image delivery.

## Dependency Order

1. Task 1 defines private artifacts and metadata.
2. Task 2 makes publication and cleanup atomic.
3. Task 3 exposes only authorized watermarked content.
4. Task 4 consumes the safe viewer contract.
5. Task 5 verifies the complete security/performance path.

## Final Acceptance Checklist

- [ ] A 4096px image is preview-only; 4097px becomes IMAGE_TILES only after full pyramid success.
- [ ] Tile, preview, and PDF-page bytes contain the current student’s diagonal watermark.
- [ ] No raw derivative, MinIO key/prefix, or durable user-specific copy leaks through API/UI/cache.
- [ ] Revoking VIEW blocks the next request; authorized original download stays short-lived and unwatermarked.
- [ ] Viewer supports zoom, pan, keyboard, wheel, pinch, fullscreen, fit, reset, and loupe.
- [ ] Audit keeps opening/download/denied traces without one row per tile.

