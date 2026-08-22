/**
 * Copilot LLM Integration
 *
 * Wraps the VS Code Language Model API (vscode.lm) to use GitHub Copilot's
 * LLM for internal intelligence reasoning. This is NOT the chat participant —
 * this is the internal reasoning engine that uses Copilot's models.
 */

import { createLogger } from '../../shared/logger.js';
import { LlmError } from '../../shared/errors.js';

const log = createLogger('core:llm:copilot');

// ─── LLM Response Types ─────────────────────────────────────────────────────

export interface LlmResponse {
  readonly content: string;
  readonly model: string;
  readonly tokenCount?: number;
}

// ─── LLM Provider Interface ─────────────────────────────────────────────────

/**
 * Interface for LLM operations.
 * Implemented by the VS Code extension using vscode.lm API.
 * Mocked in tests.
 */
export interface LlmProvider {
  /**
   * Check if the LLM is available.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Send a prompt to the LLM and get a response.
   */
  sendPrompt(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmOptions,
  ): Promise<LlmResponse>;

  /**
   * Get the name/ID of the active model.
   */
  getModelName(): string;
}

export interface LlmOptions {
  readonly maxTokens?: number;
  readonly temperature?: number;
}

// ─── No-Op LLM Provider (for tests and when Copilot is unavailable) ─────────

export class NoOpLlmProvider implements LlmProvider {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async sendPrompt(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<LlmResponse> {
    throw new LlmError('LLM provider is not available. Ensure GitHub Copilot is active.');
  }

  getModelName(): string {
    return 'none';
  }
}

/**
 * Create the appropriate LLM provider.
 * The actual VS Code implementation is in src/extension/vscLlmProvider.ts.
 */
export function createLlmProvider(): LlmProvider {
  return new NoOpLlmProvider();
}
