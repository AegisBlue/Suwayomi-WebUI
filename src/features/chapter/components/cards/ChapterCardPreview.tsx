/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import { memo, useRef, useState } from 'react';
import { SpinnerImage } from '@/base/components/SpinnerImage.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Priority } from '@/lib/Queue.ts';
import type {
    ChapterDownloadInfo,
    ChapterIdInfo,
    ChapterMangaInfo,
    ChapterPageCountInfo,
    ChapterSourceOrderInfo,
} from '@/features/chapter/Chapter.types.ts';
import type { GqlMetaHolder } from '@/features/metadata/Metadata.types.ts';
import { getChapterMetadata } from '@/features/chapter/services/ChapterMetadata.ts';
import {
    CHAPTER_PREVIEW_CROP_ASPECT,
    CHAPTER_PREVIEW_MIN_DETAIL_SCORE,
    analyzeChapterPreviewImage,
    getChapterPreviewPageCandidates,
    isChapterPreviewEligible,
} from '@/features/chapter/utils/ChapterPreview.util.ts';

// landscape panel crop of a page (OmegaScans style chapter thumbnails), aspect ratio has to match CHAPTER_PREVIEW_CROP_ASPECT
const PREVIEW_WIDTH = { xs: 100, sm: 140 };
const PREVIEW_HEIGHT = { xs: 60, sm: 84 };

// session cache of the picked page and crop per chapter (and preview seed), so scrolling/remounts
// do not re-run the candidate selection and image analysis
const previewChoiceByChapter = new Map<number, { seed: number; pageIndex: number; objectPosition: string }>();

/**
 * Shows a page of a downloaded chapter as a landscape panel thumbnail.
 *
 * The page is picked from a few stable pseudo-random candidates ({@link getChapterPreviewPageCandidates});
 * after the image loads, the visually busiest region of the page is used as the crop and
 * essentially blank pages are skipped in favor of the next candidate
 * ({@link analyzeChapterPreviewImage}). The chapter's "chapterPreviewSeed" metadata rerolls the
 * selection ("Change preview" chapter action).
 *
 * The preview url points at the server's page endpoint, which serves downloaded chapters from the
 * locally stored files. It gets only requested for downloaded chapters ({@link isChapterPreviewEligible}),
 * so that undownloaded chapters never cause any page lookup or manga source request.
 *
 * In case the image cannot be loaded (e.g. stale download state, missing files), the preview is
 * hidden without any retry or fallback - a missing local preview must never cause a remote fetch.
 */
export const ChapterCardPreview = memo(
    ({
        showChapterPreviews,
        chapter,
    }: {
        showChapterPreviews: boolean;
        chapter: ChapterIdInfo &
            ChapterDownloadInfo &
            ChapterMangaInfo &
            ChapterSourceOrderInfo &
            ChapterPageCountInfo &
            GqlMetaHolder;
    }) => {
        const [failedSeed, setFailedSeed] = useState<number | null>(null);
        const [candidateState, setCandidateState] = useState({ seed: 0, position: 0 });
        const [analyzedCrop, setAnalyzedCrop] = useState<{ seed: number; objectPosition: string }>();
        const imageRef = useRef<HTMLImageElement | HTMLDivElement | null>(null);

        const { chapterPreviewSeed } = getChapterMetadata(chapter);

        if (!isChapterPreviewEligible(showChapterPreviews, chapter) || failedSeed === chapterPreviewSeed) {
            return null;
        }

        const cachedChoice = previewChoiceByChapter.get(chapter.id);
        const isCachedChoiceValid = cachedChoice?.seed === chapterPreviewSeed;
        const candidates = getChapterPreviewPageCandidates(chapter, undefined, chapterPreviewSeed);
        const candidatePosition = candidateState.seed === chapterPreviewSeed ? candidateState.position : 0;
        const pageIndex = isCachedChoiceValid
            ? cachedChoice.pageIndex
            : candidates[Math.min(candidatePosition, candidates.length - 1)];

        // plain url construction - the actual image request only happens for downloaded chapters (see above)
        const previewUrl = requestManager.getChapterPageUrl(chapter.mangaId, chapter.sourceOrder, pageIndex);

        const handleLoad = () => {
            if (previewChoiceByChapter.get(chapter.id)?.seed === chapterPreviewSeed) {
                return;
            }

            // defer one frame so the loaded image element is committed to the dom
            requestAnimationFrame(() => {
                const image = imageRef.current;
                const analysis =
                    image instanceof HTMLImageElement
                        ? analyzeChapterPreviewImage(image, CHAPTER_PREVIEW_CROP_ASPECT)
                        : null;

                const isBlankPage = !!analysis && analysis.score < CHAPTER_PREVIEW_MIN_DETAIL_SCORE;
                const isLastCandidate = candidatePosition >= candidates.length - 1;
                if (isBlankPage && !isLastCandidate) {
                    setCandidateState({ seed: chapterPreviewSeed, position: candidatePosition + 1 });
                    return;
                }

                const position = analysis ? `${analysis.xPercent}% ${analysis.yPercent}%` : 'center';
                previewChoiceByChapter.set(chapter.id, {
                    seed: chapterPreviewSeed,
                    pageIndex,
                    objectPosition: position,
                });
                setAnalyzedCrop({ seed: chapterPreviewSeed, objectPosition: position });
            });
        };

        const objectPosition =
            (isCachedChoiceValid ? cachedChoice.objectPosition : undefined) ??
            (analyzedCrop?.seed === chapterPreviewSeed ? analyzedCrop.objectPosition : undefined) ??
            'center';

        return (
            <Box
                sx={{
                    position: 'relative',
                    width: PREVIEW_WIDTH,
                    height: PREVIEW_HEIGHT,
                    flexShrink: 0,
                    borderRadius: 1,
                    overflow: 'hidden',
                    backgroundColor: 'background.default',
                }}
            >
                <SpinnerImage
                    ref={imageRef}
                    src={previewUrl}
                    alt=""
                    priority={Priority.LOW}
                    onLoad={handleLoad}
                    onError={() => setFailedSeed(chapterPreviewSeed)}
                    spinnerStyle={{ small: true }}
                    imgStyle={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition,
                    }}
                />
            </Box>
        );
    },
);
