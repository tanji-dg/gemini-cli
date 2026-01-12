/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import { useEventDrivenToolScheduler } from './useEventDrivenToolScheduler.js';
import {
  Scheduler,
  MessageBusType,
  type Config,
  type ToolCallsUpdateMessage,
  debugLogger,
  type ToolCall,
  type ToolCallRequestInfo,
  type CompletedToolCall,
} from '@google/gemini-cli-core';

const mocks = vi.hoisted(() => ({
  scheduler: {
    schedule: vi.fn().mockResolvedValue(undefined),
    cancelAll: vi.fn(),
    getCompletedCalls: vi.fn().mockReturnValue([]),
  },
}));

// Mock the Scheduler class
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Scheduler: vi.fn().mockReturnValue(mocks.scheduler),
    debugLogger: {
      error: vi.fn(),
    },
  };
});

describe('useEventDrivenToolScheduler', () => {
  const mockOnComplete = vi.fn();
  const mockGetPreferredEditor = vi.fn();
  const mockMessageBus = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn(),
  };
  const mockConfig = {
    getMessageBus: () => mockMessageBus,
  } as unknown as Config;

  const mockRequest: ToolCallRequestInfo = {
    callId: '1',
    name: 'test',
    args: {},
    isClientInitiated: false,
    prompt_id: 'p1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnComplete.mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes the Scheduler once', () => {
    const { rerender } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    expect(Scheduler).toHaveBeenCalledTimes(1);

    rerender();
    expect(Scheduler).toHaveBeenCalledTimes(1);
  });

  it('subscribes to MessageBus on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    expect(mockMessageBus.subscribe).toHaveBeenCalledWith(
      MessageBusType.TOOL_CALLS_UPDATE,
      expect.any(Function),
    );

    unmount();
    expect(mockMessageBus.unsubscribe).toHaveBeenCalledWith(
      MessageBusType.TOOL_CALLS_UPDATE,
      expect.any(Function),
    );
  });

  it('updates toolCalls state when MessageBus receives an update', () => {
    let updateHandler: (msg: ToolCallsUpdateMessage) => void;
    mockMessageBus.subscribe.mockImplementation((type, handler) => {
      if (type === MessageBusType.TOOL_CALLS_UPDATE) {
        updateHandler = handler;
      }
    });

    const { result } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    const mockToolCall = {
      request: mockRequest,
      status: 'scheduled',
    } as ToolCall;

    act(() => {
      updateHandler!({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [mockToolCall],
      });
    });

    expect(result.current[0]).toEqual([
      expect.objectContaining({
        request: mockRequest,
        status: 'scheduled',
        responseSubmittedToGemini: false,
      }),
    ]);
  });

  it('calls scheduler.schedule and onComplete when scheduling tools', async () => {
    mocks.scheduler.getCompletedCalls.mockReturnValue([
      { request: mockRequest, status: 'success' } as CompletedToolCall,
    ]);

    const { result } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    const [, schedule] = result.current;
    const signal = new AbortController().signal;

    act(() => {
      schedule(mockRequest, signal);
    });

    await vi.waitFor(() => expect(mockOnComplete).toHaveBeenCalled());
    expect(mocks.scheduler.schedule).toHaveBeenCalledWith(mockRequest, signal);
  });

  it('finalizes the turn even when scheduling fails', async () => {
    const error = new Error('Fatal crash');
    mocks.scheduler.schedule.mockRejectedValue(error);
    mocks.scheduler.getCompletedCalls.mockReturnValue([
      { request: mockRequest, status: 'error' } as CompletedToolCall,
    ]);

    const { result } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    const [, schedule] = result.current;

    act(() => {
      schedule(mockRequest, new AbortController().signal);
    });

    await vi.waitFor(() => expect(mockOnComplete).toHaveBeenCalled());

    expect(debugLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Fatal crash'),
    );
    expect(mockOnComplete).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'error' }),
    ]);
  });

  it('swallows cancellation errors but still finalizes the turn', async () => {
    mocks.scheduler.schedule.mockRejectedValue(
      new Error('Operation cancelled'),
    );

    const { result } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    const [, schedule] = result.current;

    act(() => {
      schedule(mockRequest, new AbortController().signal);
    });

    await vi.waitFor(() => expect(mockOnComplete).toHaveBeenCalled());

    expect(debugLogger.error).not.toHaveBeenCalled();
    expect(mockOnComplete).toHaveBeenCalled();
  });

  it('marks tools as submitted', () => {
    const { result } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    const [, , markAsSubmitted, setToolCalls] = result.current;

    const mockToolCall = {
      request: mockRequest,
      status: 'success',
    } as ToolCall;

    act(() => {
      setToolCalls([mockToolCall]);
    });

    act(() => {
      markAsSubmitted(['1']);
    });

    expect(result.current[0][0]).toEqual(
      expect.objectContaining({
        request: mockRequest,
        responseSubmittedToGemini: true,
      }),
    );
  });

  it('calls scheduler.cancelAll', () => {
    const { result } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    const [, , , , cancelAll] = result.current;

    act(() => {
      cancelAll(new AbortController().signal);
    });

    expect(mocks.scheduler.cancelAll).toHaveBeenCalled();
  });

  it('updates lastToolOutputTime when live output changes', () => {
    let updateHandler: (msg: ToolCallsUpdateMessage) => void;
    mockMessageBus.subscribe.mockImplementation((type, handler) => {
      if (type === MessageBusType.TOOL_CALLS_UPDATE) {
        updateHandler = handler;
      }
    });

    const { result } = renderHook(() =>
      useEventDrivenToolScheduler(
        mockOnComplete,
        mockConfig,
        mockGetPreferredEditor,
      ),
    );

    const initialTime = result.current[5];

    act(() => {
      vi.advanceTimersByTime(100);
      updateHandler!({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [
          {
            request: mockRequest,
            status: 'executing',
            liveOutput: 'Chunk 1',
          } as ToolCall,
        ],
      });
    });

    const timeAfterFirstChunk = result.current[5];
    expect(timeAfterFirstChunk).toBeGreaterThan(initialTime);

    act(() => {
      vi.advanceTimersByTime(100);
      updateHandler!({
        type: MessageBusType.TOOL_CALLS_UPDATE,
        toolCalls: [
          {
            request: mockRequest,
            status: 'executing',
            liveOutput: 'Chunk 2',
          } as ToolCall,
        ],
      });
    });

    const timeAfterSecondChunk = result.current[5];
    expect(timeAfterSecondChunk).toBeGreaterThan(timeAfterFirstChunk);
  });
});
