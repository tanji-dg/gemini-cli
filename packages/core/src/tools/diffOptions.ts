/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  structuredPatch,
  type StructuredPatchOptionsNonabortable,
  type StructuredPatch,
  type StructuredPatchHunk,
} from 'diff';
import type { DiffStat } from './tools.js';

const DEFAULT_STRUCTURED_PATCH_OPTS: StructuredPatchOptionsNonabortable = {
  context: 3,
  ignoreWhitespace: false,
};

export const DEFAULT_DIFF_OPTIONS: {
  context: number;
  ignoreWhitespace: boolean;
} = {
  context: 3,
  ignoreWhitespace: false,
};

export function getDiffStat(
  fileName: string,
  oldStr: string,
  aiStr: string,
  userStr: string,
): DiffStat {
  const getStats = (patch: StructuredPatch) => {
    let addedLines = 0;
    let removedLines = 0;
    let addedChars = 0;
    let removedChars = 0;

    patch.hunks.forEach((hunk: StructuredPatchHunk) => {
      hunk.lines.forEach((line: string) => {
        if (line.startsWith('+')) {
          addedLines++;
          addedChars += line.length - 1;
        } else if (line.startsWith('-')) {
          removedLines++;
          removedChars += line.length - 1;
        }
      });
    });
    return { addedLines, removedLines, addedChars, removedChars };
  };

  const modelPatch = structuredPatch(
    fileName,
    fileName,
    oldStr,
    aiStr,
    'Current',
    'Proposed',
    DEFAULT_STRUCTURED_PATCH_OPTS,
  );
  const modelStats = getStats(modelPatch);

  const userPatch = structuredPatch(
    fileName,
    fileName,
    aiStr,
    userStr,
    'Proposed',
    'User',
    DEFAULT_STRUCTURED_PATCH_OPTS,
  );
  const userStats = getStats(userPatch);

  return {
    model_added_lines: modelStats.addedLines,
    model_removed_lines: modelStats.removedLines,
    model_added_chars: modelStats.addedChars,
    model_removed_chars: modelStats.removedChars,
    user_added_lines: userStats.addedLines,
    user_removed_lines: userStats.removedLines,
    user_added_chars: userStats.addedChars,
    user_removed_chars: userStats.removedChars,
  };
}
