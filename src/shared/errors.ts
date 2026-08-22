/**
 * StoryForge Error Types
 *
 * Structured error hierarchy for the intelligence engine and workflow.
 */

export class StoryForgeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StoryForgeError';
  }
}

export class IntelligenceError extends StoryForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INTELLIGENCE_ERROR', details);
    this.name = 'IntelligenceError';
  }
}

export class ParserError extends StoryForgeError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly language: string,
    details?: Record<string, unknown>,
  ) {
    super(message, 'PARSER_ERROR', { filePath, language, ...details });
    this.name = 'ParserError';
  }
}

export class GraphError extends StoryForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GRAPH_ERROR', details);
    this.name = 'GraphError';
  }
}

export class ContextError extends StoryForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONTEXT_ERROR', details);
    this.name = 'ContextError';
  }
}

export class WorkflowError extends StoryForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKFLOW_ERROR', details);
    this.name = 'WorkflowError';
  }
}

export class AlmError extends StoryForgeError {
  constructor(
    message: string,
    public readonly provider: string,
    details?: Record<string, unknown>,
  ) {
    super(message, 'ALM_ERROR', { provider, ...details });
    this.name = 'AlmError';
  }
}

export class LlmError extends StoryForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'LLM_ERROR', details);
    this.name = 'LlmError';
  }
}
