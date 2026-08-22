/**
 * VS Code LSP Bridge
 *
 * Implements LspBridge using VS Code's built-in command execution API
 * to query active Language Server Protocol providers in the extension host.
 */

import * as vscode from 'vscode';
import type {
  LspBridge,
  LspReference,
  LspCallChain,
  LspCallHierarchyItem,
  LspTypeInfo,
} from '../intelligence/parser/lspBridge.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('extension:lsp:bridge');

export class VscLspBridge implements LspBridge {
  async isAvailable(languageId: string): Promise<boolean> {
    try {
      const activeLangs = await vscode.languages.getLanguages();
      return activeLangs.includes(languageId);
    } catch {
      return false;
    }
  }

  async findReferences(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspReference[]> {
    try {
      const uri = vscode.Uri.file(filePath);
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));

      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        position,
      );

      if (!locations || !Array.isArray(locations)) return [];

      return locations.map((loc) => ({
        filePath: loc.uri.fsPath,
        location: {
          filePath: loc.uri.fsPath,
          startLine: loc.range.start.line + 1,
          startColumn: loc.range.start.character + 1,
          endLine: loc.range.end.line + 1,
          endColumn: loc.range.end.character + 1,
        },
        kind: 'reference',
      }));
    } catch (err) {
      log.debug('LSP findReferences error', { filePath, line, error: String(err) });
      return [];
    }
  }

  async findDefinition(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspReference | undefined> {
    try {
      const uri = vscode.Uri.file(filePath);
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));

      const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
        'vscode.executeDefinitionProvider',
        uri,
        position,
      );

      if (!definitions || definitions.length === 0) return undefined;

      const def = definitions[0];
      if ('targetUri' in def) {
        // LocationLink
        return {
          filePath: def.targetUri.fsPath,
          location: {
            filePath: def.targetUri.fsPath,
            startLine: def.targetRange.start.line + 1,
            startColumn: def.targetRange.start.character + 1,
            endLine: def.targetRange.end.line + 1,
            endColumn: def.targetRange.end.character + 1,
          },
          kind: 'definition',
        };
      } else {
        // Location
        return {
          filePath: def.uri.fsPath,
          location: {
            filePath: def.uri.fsPath,
            startLine: def.range.start.line + 1,
            startColumn: def.range.start.character + 1,
            endLine: def.range.end.line + 1,
            endColumn: def.range.end.character + 1,
          },
          kind: 'definition',
        };
      }
    } catch (err) {
      log.debug('LSP findDefinition error', { filePath, line, error: String(err) });
      return undefined;
    }
  }

  async getCallHierarchy(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspCallChain | undefined> {
    try {
      const uri = vscode.Uri.file(filePath);
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));

      const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        'vscode.prepareCallHierarchy',
        uri,
        position,
      );

      if (!items || items.length === 0) return undefined;

      const rootItem = items[0];
      const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
        'vscode.provideIncomingCalls',
        rootItem,
      );
      const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
        'vscode.provideOutgoingCalls',
        rootItem,
      );

      const mapItem = (it: vscode.CallHierarchyItem): LspCallHierarchyItem => ({
        name: it.name,
        kind: String(it.kind),
        filePath: it.uri.fsPath,
        location: {
          filePath: it.uri.fsPath,
          startLine: it.range.start.line + 1,
          startColumn: it.range.start.character + 1,
          endLine: it.range.end.line + 1,
          endColumn: it.range.end.character + 1,
        },
      });

      return {
        item: mapItem(rootItem),
        callers: (incoming || []).map((c) => mapItem(c.from)),
        callees: (outgoing || []).map((c) => mapItem(c.to)),
      };
    } catch (err) {
      log.debug('LSP getCallHierarchy error', { filePath, line, error: String(err) });
      return undefined;
    }
  }

  async findImplementations(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspReference[]> {
    try {
      const uri = vscode.Uri.file(filePath);
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));

      const impls = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
        'vscode.executeImplementationProvider',
        uri,
        position,
      );

      if (!impls || !Array.isArray(impls)) return [];

      return impls.map((impl) => {
        if ('targetUri' in impl) {
          return {
            filePath: impl.targetUri.fsPath,
            location: {
              filePath: impl.targetUri.fsPath,
              startLine: impl.targetRange.start.line + 1,
              startColumn: impl.targetRange.start.character + 1,
              endLine: impl.targetRange.end.line + 1,
              endColumn: impl.targetRange.end.character + 1,
            },
            kind: 'implementation',
          };
        } else {
          return {
            filePath: impl.uri.fsPath,
            location: {
              filePath: impl.uri.fsPath,
              startLine: impl.range.start.line + 1,
              startColumn: impl.range.start.character + 1,
              endLine: impl.range.end.line + 1,
              endColumn: impl.range.end.character + 1,
            },
            kind: 'implementation',
          };
        }
      });
    } catch (err) {
      log.debug('LSP findImplementations error', { filePath, line, error: String(err) });
      return [];
    }
  }

  async getTypeInfo(
    filePath: string,
    line: number,
    column: number,
  ): Promise<LspTypeInfo | undefined> {
    try {
      const uri = vscode.Uri.file(filePath);
      const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));

      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position,
      );

      if (!hovers || hovers.length === 0) return undefined;

      const hover = hovers[0];
      const text = hover.contents
        .map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
        .join('\n');

      return {
        name: text.slice(0, 100),
        filePath,
        location: {
          filePath,
          startLine: line,
          startColumn: column,
          endLine: line,
          endColumn: column,
        },
      };
    } catch (err) {
      log.debug('LSP getTypeInfo error', { filePath, line, error: String(err) });
      return undefined;
    }
  }
}
