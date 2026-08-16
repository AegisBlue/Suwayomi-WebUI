/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ChapterDownloadInfo } from '@/features/chapter/Chapter.types.ts';

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
