/**
 * VS Code Language Model (Copilot LLM) Provider
 *
 * Implements LlmProvider using the VS Code Language Model API (vscode.lm).
 * Automatically discovers available Copilot models (e.g. gpt-4o, gpt-4o-mini)
 * and executes prompt completions for intelligence reasoning and story generation.
 */

import * as vscode from 'vscode';
import type { LlmProvider, LlmResponse, LlmOptions } from '../core/llm/copilotLlm.js';
import { LlmError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('extension:llm:copilot');

export class VscLlmProvider implements LlmProvider {
  private activeModelName = 'copilot';

  async isAvailable(): Promise<boolean> {
    try {
      if (!vscode.lm) return false;
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      return models.length > 0;
    } catch {
      return false;
    }
  }

  async sendPrompt(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    if (!vscode.lm) {
      throw new LlmError('vscode.lm API is not available in the current environment.');
    }

    try {
      // 1. Select Copilot chat model (prefer gpt-4o if available)
      let models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
      if (models.length === 0) {
        models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      }
      if (models.length === 0) {
        models = await vscode.lm.selectChatModels();
      }

      if (models.length === 0) {
        throw new LlmError('No Copilot Language Model found. Please check GitHub Copilot subscription/extension.');
      }

      const model = models[0];
      this.activeModelName = model.name || model.id || 'copilot-model';

      log.info('Executing prompt via Copilot LLM', {
        model: this.activeModelName,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
      });

      // 2. Prepare chat messages
      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(
          `[System Instructions]\n${systemPrompt}\n\n[User Request]\n${userPrompt}`,
        ),
      ];

      // 3. Send request and stream response
      const tokenSource = new vscode.CancellationTokenSource();
      const request = await model.sendRequest(messages, {}, tokenSource.token);

      let content = '';
      for await (const chunk of request.text) {
        content += chunk;
      }

      return {
        content,
        model: this.activeModelName,
      };
    } catch (err) {
      log.error('Copilot LLM request failed', err);
      throw new LlmError(
        `Copilot LLM failed: ${err instanceof Error ? err.message : String(err)}`,
        { model: this.activeModelName },
      );
    }
  }

  getModelName(): string {
    return this.activeModelName;
  }
}
