/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    CHAPTER_PREVIEW_MIN_DETAIL_SCORE,
    findMostDetailedRegion,
    getChapterPreviewPageCandidates,
    isChapterPreviewEligible,
} from '@/features/chapter/utils/ChapterPreview.util.ts';

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

describe('getChapterPreviewPageCandidates', () => {
    it('always stays within the bounds of the page count', () => {
        for (let id = 1; id <= 500; id += 1) {
            for (const pageCount of [1, 2, 3, 17, 200]) {
                for (const candidate of getChapterPreviewPageCandidates({ id, pageCount })) {
                    assert.ok(
                        candidate >= 0 && candidate < pageCount,
                        `id ${id}, pageCount ${pageCount} -> ${candidate}`,
                    );
                }
            }
        }
    });

    it('is stable for the same chapter', () => {
        const chapter = { id: 42, pageCount: 25 };

        assert.deepEqual(getChapterPreviewPageCandidates(chapter), getChapterPreviewPageCandidates({ ...chapter }));
    });

    it('varies across chapters', () => {
        const firstCandidates = new Set(
            Array.from(
                { length: 50 },
                (_, index) => getChapterPreviewPageCandidates({ id: index + 1, pageCount: 20 })[0],
            ),
        );

        assert.ok(firstCandidates.size > 1);
    });

    it('provides unique fallback candidates', () => {
        const candidates = getChapterPreviewPageCandidates({ id: 42, pageCount: 30 });

        assert.ok(candidates.length > 1);
        assert.equal(new Set(candidates).size, candidates.length);
    });

    it('falls back to the first page for an unknown page count', () => {
        assert.deepEqual(getChapterPreviewPageCandidates({ id: 1, pageCount: 0 }), [0]);
        assert.deepEqual(getChapterPreviewPageCandidates({ id: 1, pageCount: -1 }), [0]);
    });

    it('handles chapters with fewer pages than candidates', () => {
        assert.deepEqual(getChapterPreviewPageCandidates({ id: 1, pageCount: 1 }), [0]);
        assert.ok(getChapterPreviewPageCandidates({ id: 1, pageCount: 2 }).length <= 2);
    });
});

const createImage = (width: number, height: number, valueAt: (x: number, y: number) => number): number[] => {
    const luminance = new Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            luminance[y * width + x] = valueAt(x, y);
        }
    }
    return luminance;
};

describe('findMostDetailedRegion', () => {
    it('scores a blank image as blank', () => {
        const { score } = findMostDetailedRegion(
            createImage(64, 200, () => 255),
            64,
            200,
            64,
            38,
        );

        assert.ok(score < CHAPTER_PREVIEW_MIN_DETAIL_SCORE, `score: ${score}`);
    });

    it('finds a detailed band within an otherwise blank tall image', () => {
        // blank white page with a high-contrast checkered band at rows 120-160
        const luminance = createImage(64, 400, (x, y) => (y >= 120 && y < 160 && (x + y) % 2 === 0 ? 0 : 255));

        const { yPercent, score } = findMostDetailedRegion(luminance, 64, 400, 64, 38);

        assert.ok(score >= CHAPTER_PREVIEW_MIN_DETAIL_SCORE, `score: ${score}`);
        // crop of height 38 within 400 rows -> offset must start inside/near the band
        const offset = (yPercent / 100) * (400 - 38);
        assert.ok(offset >= 100 && offset <= 160, `offset: ${offset}`);
    });

    it('slides horizontally for images wider than the crop', () => {
        // blank wide image with a detailed block on the right side
        const luminance = createImage(200, 64, (x) => (x >= 150 && x % 2 === 0 ? 0 : 255));

        const { xPercent, yPercent } = findMostDetailedRegion(luminance, 200, 64, 106, 64);

        assert.equal(yPercent, 50);
        assert.ok(xPercent > 50, `xPercent: ${xPercent}`);
    });

    it('centers when the crop covers the whole image', () => {
        const { xPercent, yPercent } = findMostDetailedRegion(
            createImage(64, 38, () => 128),
            64,
            38,
            64,
            38,
        );

        assert.equal(xPercent, 50);
        assert.equal(yPercent, 50);
    });
});
