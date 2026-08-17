# Downloaded Chapter Previews

Optional chapter list feature that shows a page of a chapter as a landscape panel thumbnail next to
the chapter row - **only when that chapter is already downloaded locally**.

The shown page is a **stable pseudo-random page** of the chapter (inspired by OmegaScans-style
per-chapter panel thumbnails): a small ordered set of candidate page indexes is derived
deterministically from the chapter id (`getChapterPreviewPageCandidates`), so each chapter shows a
different, representative page while the same chapter always shows the same page across re-renders,
scrolling and reloads (no flicker, fully cacheable). All indexes are bounded by the chapter's
`pageCount` so only pages that exist in the local download are ever requested; if the page count is
unknown, the first page is used.

To avoid empty-looking thumbnails, the loaded page is analyzed client side (`analyzeChapterPreviewImage`,
a small canvas downscale + luminance-gradient scan - see `findMostDetailedRegion`):

- the crop is positioned on the **visually busiest region** of the page instead of a naive center
  crop (long-strip pages often have blank sections),
- a page that is **essentially blank** overall gets skipped and the next deterministic candidate is
  tried (at most 3 candidates, then the last one is shown regardless).

The picked page + crop are kept in an in-memory session cache, so scrolling does not re-run the
analysis. The analysis is purely client side - no additional server work, and candidate pages are
requested through the exact same guarded, downloaded-only url construction.

## Feature behavior

> Only downloaded chapters receive previews.

- The feature is controlled by the chapter list display option `Show downloaded chapter previews`
  (chapter list toolbar → options → "Display" tab). It is **disabled by default**.
- While disabled, no preview component is rendered and zero preview related work happens.
- While enabled, only chapters with `chapter.isDownloaded === true` render a preview thumbnail.
  Undownloaded chapters render the normal, dense chapter row and cause **zero** preview requests.
- Chapters without a preview (undownloaded, failed to load) do not reserve empty thumbnail space.

## Network guarantee

> The preview feature must never fetch undownloaded chapter pages or contact a manga source solely
> for preview generation.

This is enforced by resolving eligibility **before** any URL is constructed or requested:

```text
ChapterList
    ↓ options.showDownloadedChapterPreviews (manga metadata, default: false)
ChapterListCard
    ↓
ChapterCard
    ↓
ChapterCardPreview
    ↓ isChapterPreviewEligible(showChapterPreviews, chapter)   ← setting + isDownloaded guard
    ├── not eligible → render nothing, ZERO requests
    └── eligible     → requestManager.getChapterPageUrl(mangaId, sourceOrder, candidateIndex)
                        ↓ candidateIndex ∈ getChapterPreviewPageCandidates(chapter)  (stable, < pageCount)
                     SpinnerImage (existing lazy/queued image loading)
                        ↓
                     GET /api/v1/manga/{mangaId}/chapter/{sourceOrder}/page/{candidateIndex}
                        ↓
                     locally stored page of the downloaded chapter
                        ↓
                     client-side crop analysis (canvas) → busiest region, blank pages skipped
```

No GraphQL operation is involved. In particular, `fetchChapterPages` is **not** used - it is a
mutation intended for the reader and can contact the source. The preview URL is a plain string
constructed client side; the only network request is the image request itself, and it is only
made for downloaded chapters.

## Local data path

The preview reuses the exact same server endpoint the reader uses to display pages of downloaded
chapters:

- WebUI: `RequestManager.getChapterPageUrl(mangaId, chapterIndex, page)`
  (`src/lib/requests/RequestManager.ts`) builds `/api/v1/manga/{mangaId}/chapter/{chapterIndex}/page/{page}`,
  where `chapterIndex` is `chapter.sourceOrder`.
- Server: this route is handled by `MangaController.pageRetrieve` → `Page.getPageImage`
  (Suwayomi-Server). For chapters with `isDownloaded == true` it returns the image directly from the
  locally stored download (`ChapterDownloadHelper.getImage`) - folder or CBZ - without contacting
  the source. It does not require a page list; pages are addressed by index.
- The preview page indexes come from `getChapterPreviewPageCandidates` and are clamped into
  `[0, pageCount)`. `pageCount` is fetched as part of the chapter list query (`GET_CHAPTERS_MANGA`
  and `REFRESH_MANGA` select it) and reflects the downloaded chapter's actual page count. If it is
  not (yet) known, page `0` is used, which always exists for a valid download.
- Because the page is served from local files, downloaded chapter previews keep working while the
  manga source is unreachable.

Eligibility is decided by `chapter.isDownloaded` only - `pageCount` is intentionally **not** used
as a proxy for the download state; it only bounds which page index may be requested.

### Known server-side caveat

The client never requests a preview for an undownloaded chapter. However, Suwayomi-Server itself
(unmodified, by design of this feature) has a fallback inside `Page.getPageImage`: if a chapter is
marked downloaded but reading the local file throws (e.g. the files were deleted manually behind
the server's back), the _server_ falls back to fetching from the source. This cannot be prevented
from the WebUI without server modifications. In the normal flows (download deleted via Suwayomi,
intact downloads) the download state is consistent and this fallback is never hit.

## Failure behavior

```text
local preview unavailable → no preview shown → never a client-side remote fallback
```

- If the preview image request fails (missing files, server error, deleted download mid-load), the
  preview hides itself silently (`ChapterCardPreview` renders nothing). The chapter row stays fully
  functional. No retry UI, no error toasts, no fallback fetching.
- Deleting a download flips `isDownloaded` to `false` via the existing GraphQL cache updates, which
  unmounts/hides the preview automatically. Downloading a chapter makes it appear the same way.

## Performance

- The chapter list is virtualized (`Virtuoso`), so only visible/near-visible rows exist - a manga
  with hundreds of downloaded chapters only loads previews for the rows on screen.
- Image loading goes through the existing `SpinnerImage`/`RequestManager.requestImage` queue with
  `Priority.LOW`, and requests are aborted when rows are scrolled out/unmounted.
- The full-size page is displayed at thumbnail size via a CSS landscape center-crop; no server-side
  thumbnail generation is used.
- The stable page index keeps the image url constant per chapter, so browser/http caching keeps
  working while scrolling.

## Testing

The upstream project has no test harness (`pnpm test` was a placeholder). The `test` script now
runs `node:test` based tests via `tsx`. Eligibility logic lives in a pure helper
(`isChapterPreviewEligible`) covered by `src/features/chapter/utils/ChapterPreview.util.test.ts`:
undownloaded chapters are never eligible, the disabled setting wins over everything, and download
state changes flip eligibility.

## Files modified

```text
package.json                                                        (test script)
src/features/chapter/Chapter.types.ts                               (ChapterListOptions, ChapterPageCountInfo)
src/features/chapter/Chapter.constants.ts                           (default: off)
src/features/chapter/components/ChapterList.tsx                     (pass option down)
src/features/chapter/components/ChapterOptions.tsx                  (display tab toggle)
src/features/chapter/components/cards/ChapterCard.tsx               (render preview)
src/features/chapter/components/cards/ChapterCardPreview.tsx        (new: preview component)
src/features/chapter/utils/ChapterList.util.tsx                     (option plumbing)
src/features/chapter/utils/ChapterPreview.util.ts                   (new: eligibility guard + page index)
src/features/chapter/utils/ChapterPreview.util.test.ts              (new: tests)
src/features/metadata/Metadata.constants.ts                         (metadata key registration)
src/lib/graphql/chapter/ChapterQuery.ts                             (select pageCount)
src/lib/graphql/manga/MangaMutation.ts                              (select pageCount)
src/lib/graphql/generated/graphql.ts                                (pageCount in generated types*)
docs/chapter-previews.md                                            (this file)
```

\* The `pageCount` additions in `src/lib/graphql/generated/graphql.ts` were applied manually
(mirroring exactly what `pnpm gql:codegen` emits for the changed selections) because a full codegen
run against a live server regenerates the whole file with unrelated formatting churn. A future
proper codegen run will produce the same fields.
