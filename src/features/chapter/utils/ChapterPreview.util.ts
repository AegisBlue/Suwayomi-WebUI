/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ChapterDownloadInfo, ChapterIdInfo, ChapterPageCountInfo } from '@/features/chapter/Chapter.types.ts';

/**
 * A chapter preview may only ever be requested for chapters that are already downloaded locally.
 *
 * Undownloaded chapters must not trigger any page lookup or image request - the preview feature
 * must never cause the server to contact the manga source (see "docs/chapter-previews.md").
 *
 * This check has to be done before constructing or requesting the preview image url.
 */
export const isChapterPreviewEligible = (
    showChapterPreviews: boolean,
    { isDownloaded }: ChapterDownloadInfo,
): boolean => showChapterPreviews && isDownloaded;

const scrambleId = (value: number): number => {
    let hash = value | 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 13), 0x45d9f3b);
    hash ^= hash >>> 16;
    return hash >>> 0;
};

/**
 * Page of a downloaded chapter to use as its preview - a pseudo-random page instead of always the
 * first one, so that each chapter shows a different, more representative panel.
 *
 * The page is picked deterministically from the chapter id, so a chapter always shows the same
 * preview across re-renders, scrolling and reloads (keeping the image cacheable and avoiding
 * flicker).
 *
 * The index is bounded by "pageCount" so that only pages that actually exist in the local download
 * get requested - an out-of-range index would make the server treat it as a failed local read.
 * "pageCount" is only used for bounding; preview eligibility is decided solely by
 * {@link isChapterPreviewEligible}. In case the page count is unknown, the first page is used.
 */
export const getChapterPreviewPageIndex = ({ id, pageCount }: ChapterIdInfo & ChapterPageCountInfo): number => {
    if (!pageCount || pageCount <= 0) {
        return 0;
    }

    return scrambleId(id) % pageCount;
};
