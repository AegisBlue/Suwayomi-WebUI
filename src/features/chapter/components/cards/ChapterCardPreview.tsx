/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import { memo, useState } from 'react';
import { SpinnerImage } from '@/base/components/SpinnerImage.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Priority } from '@/lib/Queue.ts';
import type {
    ChapterDownloadInfo,
    ChapterMangaInfo,
    ChapterSourceOrderInfo,
} from '@/features/chapter/Chapter.types.ts';
import { isChapterPreviewEligible } from '@/features/chapter/utils/ChapterPreview.util.ts';

const PREVIEW_WIDTH = 56;
const PREVIEW_HEIGHT = 84;

/**
 * Shows the first page of a downloaded chapter as a thumbnail.
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
        chapter: ChapterDownloadInfo & ChapterMangaInfo & ChapterSourceOrderInfo;
    }) => {
        const [failedToLoad, setFailedToLoad] = useState(false);

        if (!isChapterPreviewEligible(showChapterPreviews, chapter) || failedToLoad) {
            return null;
        }

        // plain url construction - the actual image request only happens for downloaded chapters (see above)
        const previewUrl = requestManager.getChapterPageUrl(chapter.mangaId, chapter.sourceOrder, 0);

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
                    src={previewUrl}
                    alt=""
                    priority={Priority.LOW}
                    onError={() => setFailedToLoad(true)}
                    spinnerStyle={{ small: true }}
                    imgStyle={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                />
            </Box>
        );
    },
);
