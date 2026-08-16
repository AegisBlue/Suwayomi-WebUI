/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getChapterPreviewPageIndex, isChapterPreviewEligible } from '@/features/chapter/utils/ChapterPreview.util.ts';

describe('isChapterPreviewEligible', () => {
    it('does not allow previews for undownloaded chapters', () => {
        assert.equal(isChapterPreviewEligible(true, { isDownloaded: false }), false);
    });

    it('allows previews for downloaded chapters', () => {
        assert.equal(isChapterPreviewEligible(true, { isDownloaded: true }), true);
    });

    it('does not allow previews while the setting is disabled, regardless of the download state', () => {
        assert.equal(isChapterPreviewEligible(false, { isDownloaded: true }), false);
        assert.equal(isChapterPreviewEligible(false, { isDownloaded: false }), false);
    });

    it('reflects download state changes', () => {
        const chapter = { isDownloaded: false };

        assert.equal(isChapterPreviewEligible(true, chapter), false);
        assert.equal(isChapterPreviewEligible(true, { ...chapter, isDownloaded: true }), true);
        assert.equal(isChapterPreviewEligible(true, { ...chapter, isDownloaded: false }), false);
    });
});

describe('getChapterPreviewPageIndex', () => {
    it('always stays within the bounds of the page count', () => {
        for (let id = 1; id <= 500; id += 1) {
            for (const pageCount of [1, 2, 3, 17, 200]) {
                const index = getChapterPreviewPageIndex({ id, pageCount });
                assert.ok(index >= 0 && index < pageCount, `id ${id}, pageCount ${pageCount} -> ${index}`);
            }
        }
    });

    it('is stable for the same chapter', () => {
        const chapter = { id: 42, pageCount: 25 };

        assert.equal(getChapterPreviewPageIndex(chapter), getChapterPreviewPageIndex({ ...chapter }));
    });

    it('varies across chapters', () => {
        const indexes = new Set(
            Array.from({ length: 50 }, (_, index) => getChapterPreviewPageIndex({ id: index + 1, pageCount: 20 })),
        );

        assert.ok(indexes.size > 1);
    });

    it('falls back to the first page for an unknown page count', () => {
        assert.equal(getChapterPreviewPageIndex({ id: 1, pageCount: 0 }), 0);
        assert.equal(getChapterPreviewPageIndex({ id: 1, pageCount: -1 }), 0);
    });
});
