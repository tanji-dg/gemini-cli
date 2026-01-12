/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import type {
  ToolCallConfirmationDetails,
  Config,
  SerializableConfirmationDetails,
} from '@google/gemini-cli-core';
import {
  MessageBusType,
  ToolConfirmationOutcome,
} from '@google/gemini-cli-core';
import {
  renderWithProviders,
  createMockSettings,
} from '../../../test-utils/render.js';

describe('ToolConfirmationMessage', () => {
  const mockPublish = vi.fn();
  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
    getMessageBus: () => ({
      publish: mockPublish,
    }),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not display urls if prompt and url are the same', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('should display urls if prompt and url are different', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt:
        'fetch https://github.com/google/gemini-react/blob/main/README.md',
      urls: [
        'https://raw.githubusercontent.com/google/gemini-react/main/README.md',
      ],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  describe('with folder trust', () => {
    const editConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
      onConfirm: vi.fn(),
    };

    const execConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      rootCommands: ['echo'],
      onConfirm: vi.fn(),
    };

    const infoConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const mcpConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool',
      serverName: 'test-server',
      toolName: 'test-tool',
      toolDisplayName: 'Test Tool',
      onConfirm: vi.fn(),
    };

    describe.each([
      {
        description: 'for edit confirmations',
        details: editConfirmationDetails,
        alwaysAllowText: 'Allow for this session',
      },
      {
        description: 'for exec confirmations',
        details: execConfirmationDetails,
        alwaysAllowText: 'Allow for this session',
      },
      {
        description: 'for info confirmations',
        details: infoConfirmationDetails,
        alwaysAllowText: 'Allow for this session',
      },
      {
        description: 'for mcp confirmations',
        details: mcpConfirmationDetails,
        alwaysAllowText: 'always allow',
      },
    ])('$description', ({ details }) => {
      it('should show "allow always" when folder is trusted', () => {
        const mockConfig = {
          isTrustedFolder: () => true,
          getIdeMode: () => false,
        } as unknown as Config;

        const { lastFrame } = renderWithProviders(
          <ToolConfirmationMessage
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        expect(lastFrame()).toMatchSnapshot();
      });

      it('should NOT show "allow always" when folder is untrusted', () => {
        const mockConfig = {
          isTrustedFolder: () => false,
          getIdeMode: () => false,
        } as unknown as Config;

        const { lastFrame } = renderWithProviders(
          <ToolConfirmationMessage
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            terminalWidth={80}
          />,
        );

        expect(lastFrame()).toMatchSnapshot();
      });
    });
  });

  describe('enablePermanentToolApproval setting', () => {
    const editConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
      onConfirm: vi.fn(),
    };

    it('should NOT show "Allow for all future sessions" when setting is false (default)', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
        {
          settings: createMockSettings({
            security: { enablePermanentToolApproval: false },
          }),
        },
      );

      expect(lastFrame()).not.toContain('Allow for all future sessions');
    });

    it('should show "Allow for all future sessions" when setting is true', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
        {
          settings: createMockSettings({
            security: { enablePermanentToolApproval: true },
          }),
        },
      );

      expect(lastFrame()).toContain('Allow for all future sessions');
    });
  });

  describe('Dual Mode Confirmation Handlers', () => {
    const serializableDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      rootCommands: ['echo'],
    };

    it('should use the MessageBus when correlationId is provided (Event-Driven)', async () => {
      const { stdin } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={serializableDetails}
          config={mockConfig}
          correlationId="test-correlation-id"
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );

      // Simulate pressing Enter to accept the first option (ProceedOnce)
      act(() => {
        stdin.write('\r');
      });

      // Wait for React to process the state and Ink to handle the input via Vitest's waitFor
      await vi.waitFor(() => {
        expect(mockPublish).toHaveBeenCalledWith({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-correlation-id',
          confirmed: true,
          outcome: ToolConfirmationOutcome.ProceedOnce,
        });
      });
    });

    it('should use the legacy onConfirm callback when correlationId is absent', async () => {
      const mockOnConfirm = vi.fn();
      const legacyDetails: ToolCallConfirmationDetails = {
        ...serializableDetails,
        onConfirm: mockOnConfirm,
      };

      const { stdin } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={legacyDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );

      // Simulate pressing Enter to accept the first option (ProceedOnce)
      act(() => {
        stdin.write('\r');
      });

      await vi.waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        );
      });
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('should throw an error when neither correlationId nor onConfirm is provided', async () => {
      let caughtError: Error | undefined;
      const unhandledRejectionListener = (reason: unknown) => {
        caughtError =
          reason instanceof Error ? reason : new Error(String(reason));
      };

      process.on('unhandledRejection', unhandledRejectionListener);

      const { stdin } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={serializableDetails} // No onConfirm
          config={mockConfig} // No correlationId passed
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );

      // Simulate pressing Enter. This triggers the invariant violation in handleConfirm.
      act(() => {
        stdin.write('\r');
      });

      await vi.waitFor(() => {
        expect(caughtError).toBeDefined();
        expect(caughtError?.message).toContain(
          'Invariant Violation: ToolConfirmationMessage requires either a correlationId (event-driven) or an onConfirm callback (legacy).',
        );
      });

      process.removeListener('unhandledRejection', unhandledRejectionListener);
    });

    it('should handle cancel properly via MessageBus', async () => {
      const { stdin } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={serializableDetails}
          config={mockConfig}
          correlationId="test-correlation-id"
          availableTerminalHeight={30}
          terminalWidth={80}
        />,
      );

      // Press Escape to select the Cancel option
      act(() => {
        stdin.write('\u001B'); // ESC
      });

      await vi.waitFor(() => {
        expect(mockPublish).toHaveBeenCalledWith({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'test-correlation-id',
          confirmed: false, // Cancel means NOT confirmed
          outcome: ToolConfirmationOutcome.Cancel,
        });
      });
    });
  });
});
