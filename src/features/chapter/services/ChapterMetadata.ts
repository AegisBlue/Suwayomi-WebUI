/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import type { ChapterIdInfo, ChapterMetadata, ChapterMetadataKeys } from '@/features/chapter/Chapter.types.ts';
import type { GqlMetaHolder } from '@/features/metadata/Metadata.types.ts';
import { getMetadataFrom } from '@/features/metadata/services/MetadataReader.ts';
import { convertFromGqlMeta } from '@/features/metadata/services/MetadataConverter.ts';
import { requestChapterMetadataUpdate } from '@/features/metadata/services/MetadataUpdater.ts';
import { noOp } from '@/lib/HelperFunctions.ts';

const DEFAULT_CHAPTER_METADATA: ChapterMetadata = {
    chapterPreviewSeed: 0,
};

export const getChapterMetadata = (chapter: ChapterIdInfo & GqlMetaHolder): ChapterMetadata =>
    // pass a no-op effect fn so that metadata migrations only get applied in-memory - committing
    // them is unnecessary for the single chapter metadata key and would otherwise cause one
    // mutation per rendered chapter list row
    getMetadataFrom(
        'chapter',
        { ...chapter, meta: convertFromGqlMeta(chapter.meta) },
        DEFAULT_CHAPTER_METADATA,
        undefined,
        noOp,
    );

export const updateChapterMetadata = async <
    MetadataKeys extends ChapterMetadataKeys = ChapterMetadataKeys,
    MetadataKey extends MetadataKeys = MetadataKeys,
>(
    chapter: ChapterIdInfo & GqlMetaHolder,
    metadataKey: MetadataKey,
    value: ChapterMetadata[MetadataKey],
): Promise<void> => requestChapterMetadataUpdate(chapter, { update: [[metadataKey, value]] });
