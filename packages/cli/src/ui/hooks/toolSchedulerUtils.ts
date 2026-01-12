/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ScheduledToolCall,
  type ValidatingToolCall,
  type WaitingToolCall,
  type ExecutingToolCall,
  type CompletedToolCall,
  type CancelledToolCall,
  type Status as CoreStatus,
  type ToolCallConfirmationDetails,
  type SerializableConfirmationDetails,
  type ToolCallRequestInfo,
  type ToolResultDisplay,
  debugLogger,
} from '@google/gemini-cli-core';
import {
  ToolCallStatus,
  type HistoryItemToolGroup,
  type IndividualToolCallDisplay,
} from '../types.js';

export type ScheduleFn = (
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
  signal: AbortSignal,
) => void;
export type MarkToolsAsSubmittedFn = (callIds: string[]) => void;
export type CancelAllFn = (signal: AbortSignal) => void;

export type TrackedScheduledToolCall = ScheduledToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedValidatingToolCall = ValidatingToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedWaitingToolCall = WaitingToolCall & {
  responseSubmittedToGemini?: boolean;
  correlationId?: string; // Added for event-driven support
};
export type TrackedExecutingToolCall = ExecutingToolCall & {
  responseSubmittedToGemini?: boolean;
  pid?: number;
};
export type TrackedCompletedToolCall = CompletedToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedCancelledToolCall = CancelledToolCall & {
  responseSubmittedToGemini?: boolean;
};

export type TrackedToolCall =
  | TrackedScheduledToolCall
  | TrackedValidatingToolCall
  | TrackedWaitingToolCall
  | TrackedExecutingToolCall
  | TrackedCompletedToolCall
  | TrackedCancelledToolCall;

export function mapCoreStatusToDisplayStatus(
  coreStatus: CoreStatus,
): ToolCallStatus {
  switch (coreStatus) {
    case 'validating':
      return ToolCallStatus.Executing;
    case 'awaiting_approval':
      return ToolCallStatus.Confirming;
    case 'executing':
      return ToolCallStatus.Executing;
    case 'success':
      return ToolCallStatus.Success;
    case 'cancelled':
      return ToolCallStatus.Canceled;
    case 'error':
      return ToolCallStatus.Error;
    case 'scheduled':
      return ToolCallStatus.Pending;
    default:
      debugLogger.warn(`Unknown core status encountered: ${coreStatus}`);
      return ToolCallStatus.Error;
  }
}

/**
 * Transforms `TrackedToolCall` objects into `HistoryItemToolGroup` objects for UI display.
 */
export function mapToDisplay(
  toolOrTools: TrackedToolCall[] | TrackedToolCall,
): HistoryItemToolGroup {
  const toolCalls = Array.isArray(toolOrTools) ? toolOrTools : [toolOrTools];

  const toolDisplays = toolCalls.map(
    (trackedCall): IndividualToolCallDisplay => {
      let displayName: string;
      let description: string;
      let renderOutputAsMarkdown = false;

      if (trackedCall.status === 'error') {
        displayName =
          trackedCall.tool === undefined
            ? trackedCall.request.name
            : trackedCall.tool.displayName;
        description = JSON.stringify(trackedCall.request.args);
      } else {
        displayName = trackedCall.tool.displayName;
        description = trackedCall.invocation.getDescription();
        renderOutputAsMarkdown = trackedCall.tool.isOutputMarkdown;
      }

      const baseDisplayProperties = {
        callId: trackedCall.request.callId,
        name: displayName,
        description,
        renderOutputAsMarkdown,
        correlationId:
          'correlationId' in trackedCall
            ? trackedCall.correlationId
            : undefined,
      };

      let resultDisplay: ToolResultDisplay | undefined = undefined;
      let confirmationDetails:
        | ToolCallConfirmationDetails
        | SerializableConfirmationDetails
        | undefined = undefined;
      let outputFile: string | undefined = undefined;
      let ptyId: number | undefined = undefined;

      switch (trackedCall.status) {
        case 'success':
          resultDisplay = trackedCall.response.resultDisplay;
          outputFile = trackedCall.response.outputFile;
          break;
        case 'error':
        case 'cancelled':
          resultDisplay = trackedCall.response.resultDisplay;
          break;
        case 'awaiting_approval':
          confirmationDetails = trackedCall.confirmationDetails;
          break;
        case 'executing':
          resultDisplay = trackedCall.liveOutput;
          ptyId = trackedCall.pid;
          break;
        default:
          // Handles 'scheduled' and 'validating' where no additional display
          // info is needed
          break;
      }

      return {
        ...baseDisplayProperties,
        status: mapCoreStatusToDisplayStatus(trackedCall.status),
        resultDisplay,
        confirmationDetails,
        outputFile,
        ptyId,
      };
    },
  );

  return {
    type: 'tool_group',
    tools: toolDisplays,
  };
}
