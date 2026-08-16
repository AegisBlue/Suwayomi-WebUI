/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isChapterPreviewEligible } from '@/features/chapter/utils/ChapterPreview.util.ts';

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
