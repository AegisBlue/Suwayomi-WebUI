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

/** aspect ratio (width / height) of the rendered preview thumbnail crop */
export const CHAPTER_PREVIEW_CROP_ASPECT = 140 / 84;

/**
 * Minimum {@link findMostDetailedRegion} score (mean absolute luminance gradient per pixel, 0-255
 * scale) for a page to be considered to have enough visual content for a preview. Blank pages
 * (white/black filler, empty long-strip sections) score close to 0.
 */
export const CHAPTER_PREVIEW_MIN_DETAIL_SCORE = 5;

const scrambleId = (value: number): number => {
    let hash = value | 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 13), 0x45d9f3b);
    hash ^= hash >>> 16;
    return hash >>> 0;
};

/**
 * Pages of a downloaded chapter to try as its preview, in order - a pseudo-random page instead of
 * always the first one, so that each chapter shows a different, more representative panel.
 *
 * The candidates are derived deterministically from the chapter id, so a chapter always shows the
 * same preview across re-renders, scrolling and reloads (keeping the image cacheable and avoiding
 * flicker). In case a candidate turns out to be a blank page ({@link CHAPTER_PREVIEW_MIN_DETAIL_SCORE}),
 * the next candidate gets tried.
 *
 * All indexes are bounded by "pageCount" so that only pages that actually exist in the local
 * download get requested - an out-of-range index would make the server treat it as a failed local
 * read. "pageCount" is only used for bounding; preview eligibility is decided solely by
 * {@link isChapterPreviewEligible}. In case the page count is unknown, only the first page is used.
 *
 * The "seed" allows rerolling the selection ("Change preview" chapter action) - each seed value
 * deterministically maps to its own candidate set.
 */
export const getChapterPreviewPageCandidates = (
    { id, pageCount }: ChapterIdInfo & ChapterPageCountInfo,
    maxCandidates: number = 3,
    seed: number = 0,
): number[] => {
    if (!pageCount || pageCount <= 0) {
        return [0];
    }

    const baseIndex = scrambleId(id + seed * 7919) % pageCount;
    const step = Math.max(1, Math.floor(pageCount / maxCandidates));
    const candidates = Array.from(
        { length: Math.min(maxCandidates, pageCount) },
        (_, candidate) => (baseIndex + candidate * step) % pageCount,
    );

    return [...new Set(candidates)];
};

export interface PreviewCropRegion {
    /** offset of the crop within the image, as "object-position" percentages */
    xPercent: number;
    yPercent: number;
    /** mean absolute luminance gradient per pixel within the crop (0-255 scale) */
    score: number;
}

/**
 * Finds the visually busiest crop region of a grayscale image (row-major luminance values) for a
 * cover-crop of the passed dimensions, by sliding the crop along the axis that gets cut off and
 * maximizing the mean luminance gradient (edge energy) within it.
 *
 * Used to avoid empty parts of a page (gutters, blank sections of long-strip pages) ending up as
 * the preview thumbnail.
 */
export const findMostDetailedRegion = (
    luminance: ArrayLike<number>,
    width: number,
    height: number,
    cropWidth: number,
    cropHeight: number,
): PreviewCropRegion => {
    const gradientAt = (x: number, y: number): number => {
        const value = luminance[y * width + x];
        const horizontal = x > 0 ? Math.abs(value - luminance[y * width + (x - 1)]) : 0;
        const vertical = y > 0 ? Math.abs(value - luminance[(y - 1) * width + x]) : 0;
        return horizontal + vertical;
    };

    const slideVertically = cropWidth >= width;
    const lineCount = slideVertically ? height : width;
    const cropSize = Math.min(slideVertically ? cropHeight : cropWidth, lineCount);

    // energy per line (row or column) orthogonal to the slide axis
    const lineEnergy = new Array(lineCount).fill(0);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            lineEnergy[slideVertically ? y : x] += gradientAt(x, y);
        }
    }

    const prefix = new Array(lineCount + 1).fill(0);
    for (let line = 0; line < lineCount; line += 1) {
        prefix[line + 1] = prefix[line] + lineEnergy[line];
    }

    const pixelsPerCrop = cropSize * (slideVertically ? width : height);
    let bestOffset = 0;
    let bestEnergy = -1;
    for (let offset = 0; offset + cropSize <= lineCount; offset += 1) {
        const energy = prefix[offset + cropSize] - prefix[offset];
        if (energy > bestEnergy) {
            bestEnergy = energy;
            bestOffset = offset;
        }
    }

    const slideRange = lineCount - cropSize;
    const offsetPercent = slideRange > 0 ? (bestOffset / slideRange) * 100 : 50;

    return {
        xPercent: slideVertically ? 50 : offsetPercent,
        yPercent: slideVertically ? offsetPercent : 50,
        score: bestEnergy / pixelsPerCrop,
    };
};

const ANALYSIS_TARGET_WIDTH = 64;
const ANALYSIS_MAX_HEIGHT = 4096; // bounds the cost for very long strip pages

/**
 * Browser-side part of the preview crop selection: downscales the loaded page image into a canvas
 * and delegates to {@link findMostDetailedRegion}.
 *
 * Returns null if the image cannot be analyzed (e.g. not loaded, canvas unsupported) - callers
 * should then fall back to a center crop instead of hiding the preview.
 */
export const analyzeChapterPreviewImage = (image: HTMLImageElement, cropAspect: number): PreviewCropRegion | null => {
    try {
        const { naturalWidth, naturalHeight } = image;
        if (!image.complete || !naturalWidth || !naturalHeight) {
            return null;
        }

        const width = ANALYSIS_TARGET_WIDTH;
        const height = Math.max(1, Math.min(Math.round((naturalHeight / naturalWidth) * width), ANALYSIS_MAX_HEIGHT));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            return null;
        }
        context.drawImage(image, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);

        const luminance = new Uint8ClampedArray(width * height);
        for (let pixel = 0; pixel < luminance.length; pixel += 1) {
            luminance[pixel] = 0.299 * data[pixel * 4] + 0.587 * data[pixel * 4 + 1] + 0.114 * data[pixel * 4 + 2];
        }

        const isImageWiderThanCrop = naturalWidth / naturalHeight > cropAspect;
        const cropWidth = isImageWiderThanCrop ? Math.max(1, Math.round(height * cropAspect)) : width;
        const cropHeight = isImageWiderThanCrop ? height : Math.max(1, Math.round(width / cropAspect));

        return findMostDetailedRegion(luminance, width, height, cropWidth, cropHeight);
    } catch {
        return null;
    }
};
