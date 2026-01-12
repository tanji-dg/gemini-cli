/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  type ToolCallRequestInfo,
  type EditorType,
  type CompletedToolCall,
  type ToolCallsUpdateMessage,
  Scheduler,
  MessageBusType,
  debugLogger,
} from '@google/gemini-cli-core';
import { useCallback, useState, useEffect, useRef } from 'react';
import type {
  ScheduleFn,
  MarkToolsAsSubmittedFn,
  CancelAllFn,
  TrackedToolCall,
  TrackedExecutingToolCall,
} from './toolSchedulerUtils.js';

export function useEventDrivenToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => Promise<void>,
  config: Config,
  getPreferredEditor: () => EditorType | undefined,
): [
  TrackedToolCall[],
  ScheduleFn,
  MarkToolsAsSubmittedFn,
  React.Dispatch<React.SetStateAction<TrackedToolCall[]>>,
  CancelAllFn,
  number,
] {
  const [toolCallsForDisplay, setToolCallsForDisplay] = useState<
    TrackedToolCall[]
  >([]);
  const [lastToolOutputTime, setLastToolOutputTime] = useState<number>(0);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  const onCompleteRef = useRef(onComplete);
  const getPreferredEditorRef = useRef(getPreferredEditor);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    getPreferredEditorRef.current = getPreferredEditor;
  }, [getPreferredEditor]);

  // Lazy initialization of the Scheduler
  const schedulerRef = useRef<Scheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new Scheduler({
      config,
      messageBus: config.getMessageBus(),
      getPreferredEditor: () => getPreferredEditorRef.current(),
    });
  }
  const scheduler = schedulerRef.current;

  // Subscribe to MessageBus updates
  useEffect(() => {
    const messageBus = config.getMessageBus();

    const handleUpdate = (message: ToolCallsUpdateMessage) => {
      setToolCallsForDisplay((prevTrackedCalls) => {
        const prevCallsMap = new Map(
          prevTrackedCalls.map((c) => [c.request.callId, c]),
        );

        return message.toolCalls.map((toolCall): TrackedToolCall => {
          const existing = prevCallsMap.get(toolCall.request.callId);

          const responseSubmittedToGemini =
            existing?.responseSubmittedToGemini ??
            submittedIds.has(toolCall.request.callId);

          if (toolCall.status === 'executing') {
            const coreExec = toolCall;
            const existingExec = existing as TrackedExecutingToolCall;
            // Force update if output changed
            if (coreExec.liveOutput !== existingExec?.liveOutput) {
              setLastToolOutputTime(Date.now());
            }
          }

          return {
            ...toolCall,
            responseSubmittedToGemini,
            correlationId:
              'correlationId' in toolCall ? toolCall.correlationId : undefined,
          } as TrackedToolCall;
        });
      });
    };

    messageBus.subscribe(MessageBusType.TOOL_CALLS_UPDATE, handleUpdate);
    return () => {
      messageBus.unsubscribe(MessageBusType.TOOL_CALLS_UPDATE, handleUpdate);
    };
  }, [config, submittedIds]);

  const schedule: ScheduleFn = useCallback(
    (
      request: ToolCallRequestInfo | ToolCallRequestInfo[],
      signal: AbortSignal,
    ) => {
      setToolCallsForDisplay([]);

      void (async () => {
        try {
          await scheduler.schedule(request, signal);
          const completed = scheduler.getCompletedCalls();
          await onCompleteRef.current(completed);
        } catch (err) {
          const isCancellation =
            signal.aborted ||
            (err instanceof Error &&
              (err.message === 'Operation cancelled' ||
                err.message === 'Tool call cancelled while in queue.'));

          if (!isCancellation) {
            debugLogger.error(`Uncaught Scheduler Orchestration Error: ${err}`);
          }
          // Always process any partial completions and signal turn end, even on error
          const completed = scheduler.getCompletedCalls();
          await onCompleteRef.current(completed);
        }
      })();
    },
    [scheduler],
  );

  const markToolsAsSubmitted: MarkToolsAsSubmittedFn = useCallback(
    (callIdsToMark: string[]) => {
      setSubmittedIds((prev) => {
        const next = new Set(prev);
        callIdsToMark.forEach((id) => next.add(id));
        return next;
      });

      setToolCallsForDisplay((prevCalls) =>
        prevCalls.map((tc) =>
          callIdsToMark.includes(tc.request.callId)
            ? { ...tc, responseSubmittedToGemini: true }
            : tc,
        ),
      );
    },
    [],
  );

  const cancelAllToolCalls: CancelAllFn = useCallback(
    (_signal: AbortSignal) => {
      scheduler.cancelAll();
    },
    [scheduler],
  );

  return [
    toolCallsForDisplay,
    schedule,
    markToolsAsSubmitted,
    setToolCallsForDisplay,
    cancelAllToolCalls,
    lastToolOutputTime,
  ];
}
