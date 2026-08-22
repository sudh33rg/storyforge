/**
 * VS Code API Mock for Testing
 *
 * Provides a minimal mock of the vscode module so that
 * tests can import code that references vscode types.
 */

export const Uri = {
  file: (path: string) => ({ fsPath: path, path, scheme: 'file' }),
  parse: (value: string) => ({ fsPath: value, path: value, scheme: 'file' }),
};

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export class TreeItem {
  label?: string;
  description?: string;
  iconPath?: unknown;
  collapsibleState?: number;

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };
  cancel(): void {
    this.token.isCancellationRequested = true;
  }
  dispose(): void {}
}

export const LanguageModelChatMessage = {
  User: (content: string) => ({ role: 1, content }),
  Assistant: (content: string) => ({ role: 2, content }),
};

export const languages = {
  getLanguages: async () => ['typescript', 'javascript', 'python', 'java', 'csharp', 'go'],
};

export const lm = {
  selectChatModels: async () => [],
};

export class EventEmitter<T> {
  private handlers: Array<(e: T) => void> = [];

  event = (handler: (e: T) => void) => {
    this.handlers.push(handler);
    return { dispose: () => {} };
  };

  fire(data: T): void {
    for (const handler of this.handlers) {
      handler(data);
    }
  }

  dispose(): void {
    this.handlers = [];
  }
}

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    append: () => {},
    show: () => {},
    dispose: () => {},
  }),
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showInputBox: async () => undefined,
  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    command: '',
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  registerTreeDataProvider: () => ({ dispose: () => {} }),
  withProgress: async (_: unknown, fn: () => Promise<unknown>) => fn(),
};

export const workspace = {
  workspaceFolders: undefined as unknown,
  getConfiguration: () => ({
    get: (key: string, defaultValue?: unknown) => defaultValue,
  }),
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => {} }),
    onDidCreate: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: async () => {},
};

export const chat = {
  createChatParticipant: () => ({
    iconPath: undefined,
    dispose: () => {},
  }),
};

export enum ProgressLocation {
  Notification = 15,
  SourceControl = 1,
  Window = 10,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export const extensions = {
  getExtension: () => undefined,
};

export default {
  Uri,
  TreeItem,
  TreeItemCollapsibleState,
  ThemeIcon,
  Position,
  Range,
  CancellationTokenSource,
  LanguageModelChatMessage,
  languages,
  lm,
  EventEmitter,
  window,
  workspace,
  commands,
  chat,
  ProgressLocation,
  StatusBarAlignment,
  extensions,
};
