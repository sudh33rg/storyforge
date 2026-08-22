/**
 * Language Adapters Registry & Universal Multi-Language Parsers
 *
 * Provides stateful, multiline-aware structural parsing for:
 * - TypeScript, JavaScript, Node.js
 * - Java
 * - C# (.NET)
 * - Python
 * - Go
 * - Rust
 * - C / C++
 * - SQL (DDL Tables, Columns, Foreign Keys)
 * - Docker (Dockerfile & docker-compose.yml)
 * - YAML / JSON (Configuration & API Schemas)
 * - Markdown (Docs, ADRs & Specifications)
 */

import type {
  SupportedLanguage,
  ParsedSymbol,
  ParsedImport,
  ParsedCallSite,
  SymbolKind,
  ArchitecturalRole,
  SourceLocation,
  RelativePath,
} from '../../shared/types.js';

// ─── Language Adapter Interface ──────────────────────────────────────────────

export interface LanguageAdapter {
  readonly language: SupportedLanguage;
  readonly extensions: readonly string[];
  readonly treeSitterGrammar: string;

  extractSymbols(
    sourceCode: string,
    filePath: RelativePath,
  ): ParsedSymbol[];

  extractImports(
    sourceCode: string,
    filePath: RelativePath,
  ): ParsedImport[];

  detectArchitecturalRole(
    filePath: RelativePath,
    symbols: ParsedSymbol[],
  ): ArchitecturalRole;

  detectApiEndpoints?(
    sourceCode: string,
    filePath: RelativePath,
    symbols: ParsedSymbol[],
  ): DetectedApiEndpoint[];

  extractSqlTables?(
    sourceCode: string,
    filePath: RelativePath,
  ): DetectedSqlTable[];

  extractDockerServices?(
    sourceCode: string,
    filePath: RelativePath,
  ): DetectedDockerService[];

  extractDocSections?(
    sourceCode: string,
    filePath: RelativePath,
  ): DetectedDocSection[];
}

export interface DetectedApiEndpoint {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  readonly path: string;
  readonly handlerName: string;
  readonly filePath: RelativePath;
  readonly location: SourceLocation;
}

export interface DetectedSqlTable {
  readonly tableName: string;
  readonly filePath: RelativePath;
  readonly columns: Array<{ name: string; type: string; isPrimary?: boolean; isNullable?: boolean }>;
  readonly foreignKeys?: Array<{ column: string; referencesTable: string; referencesColumn: string }>;
  readonly location: SourceLocation;
}

export interface DetectedDockerService {
  readonly serviceName: string;
  readonly filePath: RelativePath;
  readonly image?: string;
  readonly buildContext?: string;
  readonly ports?: string[];
  readonly environment?: string[];
  readonly dependsOn?: string[];
  readonly location: SourceLocation;
}

export interface DetectedDocSection {
  readonly title: string;
  readonly level: number;
  readonly filePath: RelativePath;
  readonly location: SourceLocation;
}

function makeLocation(filePath: string, line: number, col: number = 0, endLine: number = line, endCol: number = col + 1): SourceLocation {
  return {
    filePath,
    startLine: line,
    startColumn: col,
    endLine,
    endColumn: endCol,
  };
}

// ─── TypeScript / JavaScript Adapter ────────────────────────────────────────

const typescriptAdapter: LanguageAdapter = {
  language: 'typescript',
  extensions: ['.ts', '.tsx', '.mts', '.cts'],
  treeSitterGrammar: 'typescript',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Classes
      const classMatch = line.match(
        /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w.<>]+))?(?:\s+implements\s+([\w.,\s<>]+))?/,
      );
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: classMatch[2]?.trim(),
          implementsTypes: classMatch[3]?.split(',').map((s) => s.trim().split('<')[0]),
          modifiers: line.includes('export') ? ['export'] : [],
        });
      }

      // Interfaces
      const interfaceMatch = line.match(
        /^\s*(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w.,\s<>]+))?/,
      );
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          qualifiedName: `${filePath}:${interfaceMatch[1]}`,
          kind: 'interface',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: interfaceMatch[2]?.split(',')[0]?.trim().split('<')[0],
          implementsTypes: interfaceMatch[2]?.split(',').map((s) => s.trim().split('<')[0]),
        });
      }

      // Functions (Standard + Async)
      const funcMatch = line.match(
        /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      );
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          qualifiedName: `${filePath}:${funcMatch[1]}`,
          kind: 'function',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
          modifiers: line.includes('export') ? ['export'] : [],
        });
      }

      // Arrow functions / React functional components
      const arrowMatch = line.match(
        /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/,
      );
      if (arrowMatch) {
        symbols.push({
          name: arrowMatch[1],
          qualifiedName: `${filePath}:${arrowMatch[1]}`,
          kind: 'function',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
          modifiers: line.includes('export') ? ['export'] : [],
        });
      }

      // Type aliases
      const typeMatch = line.match(/^\s*(?:export\s+)?type\s+(\w+)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          qualifiedName: `${filePath}:${typeMatch[1]}`,
          kind: 'type-alias',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Enums
      const enumMatch = line.match(/^\s*(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          qualifiedName: `${filePath}:${enumMatch[1]}`,
          kind: 'enum',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];

    // Multiline-aware import regex
    const importRegex = /(?:import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?(?:\*\s+as\s+(\w+))?\s+from\s+['"]([^'"]+)['"])|(?:import\s+['"]([^'"]+)['"])/g;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(sourceCode)) !== null) {
      const defaultImport = match[1];
      const namedImports = match[2];
      const namespaceImport = match[3];
      const modulePath = match[4] || match[5];

      if (!modulePath) continue;

      const line = sourceCode.slice(0, match.index).split('\n').length;
      const specifiers: string[] = [];

      if (defaultImport) specifiers.push(defaultImport);
      if (namespaceImport) specifiers.push(namespaceImport);
      if (namedImports) {
        for (const spec of namedImports.split(',')) {
          const clean = spec.trim().split(/\s+as\s+/)[0].trim();
          if (clean) specifiers.push(clean);
        }
      }

      imports.push({
        source: modulePath,
        specifiers,
        isDefault: !!defaultImport,
        isNamespace: !!namespaceImport,
        location: makeLocation(filePath, line),
      });
    }

    return imports;
  },

  detectArchitecturalRole(filePath, symbols) {
    const lower = filePath.toLowerCase();
    if (lower.includes('controller')) return 'controller';
    if (lower.includes('service') && !lower.includes('.test') && !lower.includes('.spec')) return 'service';
    if (lower.includes('repository') || lower.includes('repo')) return 'repository';
    if (lower.includes('model') || lower.includes('entity')) return 'model';
    if (lower.includes('dto')) return 'dto';
    if (lower.includes('middleware')) return 'middleware';
    if (lower.includes('guard')) return 'guard';
    if (lower.includes('interceptor')) return 'interceptor';
    if (lower.includes('pipe')) return 'pipe';
    if (lower.includes('filter')) return 'filter';
    if (lower.includes('handler')) return 'handler';
    if (lower.includes('resolver')) return 'resolver';
    if (lower.includes('gateway')) return 'gateway';
    if (lower.includes('factory')) return 'factory';
    if (lower.includes('module')) return 'module';
    if (lower.includes('component') || lower.endsWith('.tsx') || lower.endsWith('.jsx')) return 'component';
    if (lower.includes('hook') || lower.match(/\/use\w+/)) return 'hook';
    if (lower.includes('store') || lower.includes('redux') || lower.includes('zustand')) return 'store';
    if (lower.includes('action')) return 'action';
    if (lower.includes('reducer')) return 'reducer';
    if (lower.includes('saga')) return 'saga';
    if (lower.includes('effect')) return 'effect';
    if (lower.includes('util') || lower.includes('helper')) return 'utility';
    if (lower.includes('config') || lower.includes('configuration')) return 'configuration';
    if (lower.includes('migration')) return 'migration';
    if (lower.includes('.test') || lower.includes('.spec') || lower.includes('__test')) return 'test';
    if (lower.includes('fixture') || lower.includes('mock')) return 'test-fixture';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Express / Fastify / Hono
      const expressMatch = line.match(
        /(?:app|router|server)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"]([^'"]+)['"]/i,
      );
      if (expressMatch) {
        endpoints.push({
          method: expressMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: expressMatch[2],
          handlerName: `express:${expressMatch[2]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }

      // NestJS Decorators
      const decoratorMatch = line.match(
        /@(Get|Post|Put|Delete|Patch|Options|Head)\s*\(\s*['"]?([^'"]*?)['"]?\s*\)/i,
      );
      if (decoratorMatch) {
        endpoints.push({
          method: decoratorMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: decoratorMatch[2] ? (decoratorMatch[2].startsWith('/') ? decoratorMatch[2] : `/${decoratorMatch[2]}`) : '/',
          handlerName: `nestjs:${decoratorMatch[2] || 'root'}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return endpoints;
  },
};

const javascriptAdapter: LanguageAdapter = {
  ...typescriptAdapter,
  language: 'javascript',
  extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  treeSitterGrammar: 'javascript',
};

// ─── Java Adapter ────────────────────────────────────────────────────────────

const javaAdapter: LanguageAdapter = {
  language: 'java',
  extensions: ['.java'],
  treeSitterGrammar: 'java',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Package
      const pkgMatch = line.match(/^\s*package\s+([\w.]+)/);
      if (pkgMatch) {
        symbols.push({
          name: pkgMatch[1],
          qualifiedName: pkgMatch[1],
          kind: 'package',
          language: 'java',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Class / Record
      const classMatch = line.match(
        /^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(?:class|record)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w.,\s]+))?/,
      );
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'java',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: classMatch[2],
          implementsTypes: classMatch[3]?.split(',').map((s) => s.trim()),
        });
      }

      // Interface
      const interfaceMatch = line.match(
        /^\s*(?:public\s+)?interface\s+(\w+)(?:\s+extends\s+([\w.,\s]+))?/,
      );
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          qualifiedName: `${filePath}:${interfaceMatch[1]}`,
          kind: 'interface',
          language: 'java',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: interfaceMatch[2]?.split(',')[0]?.trim(),
        });
      }

      // Methods
      const methodMatch = line.match(
        /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:abstract\s+|final\s+)?(?:synchronized\s+)?(?:<[\w,\s]+>\s+)?([\w<>[\]]+)\s+(\w+)\s*\(/,
      );
      if (methodMatch && !line.includes('class ') && !line.includes('interface ')) {
        symbols.push({
          name: methodMatch[2],
          qualifiedName: `${filePath}:${methodMatch[2]}`,
          kind: 'method',
          language: 'java',
          returnType: methodMatch[1],
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const importMatch = line.match(/^\s*import\s+(?:static\s+)?([\w.*]+);/);
      if (importMatch) {
        const source = importMatch[1];
        imports.push({
          source,
          specifiers: [source.split('.').pop() || source],
          isDefault: false,
          isNamespace: source.endsWith('.*'),
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return imports;
  },

  detectArchitecturalRole(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('controller')) return 'controller';
    if (lower.includes('service') && !lower.includes('test')) return 'service';
    if (lower.includes('repository') || lower.includes('dao')) return 'repository';
    if (lower.includes('model') || lower.includes('entity')) return 'model';
    if (lower.includes('dto')) return 'dto';
    if (lower.includes('handler')) return 'handler';
    if (lower.includes('filter')) return 'filter';
    if (lower.includes('config')) return 'configuration';
    if (lower.includes('test')) return 'test';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const springMatch = line.match(
        /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]/i,
      );
      if (springMatch) {
        endpoints.push({
          method: springMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: springMatch[2],
          handlerName: `spring:${springMatch[2]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return endpoints;
  },
};

// ─── C# Adapter ──────────────────────────────────────────────────────────────

const csharpAdapter: LanguageAdapter = {
  language: 'csharp',
  extensions: ['.cs'],
  treeSitterGrammar: 'c_sharp',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Namespace
      const nsMatch = line.match(/^\s*namespace\s+([\w.]+)/);
      if (nsMatch) {
        symbols.push({
          name: nsMatch[1],
          qualifiedName: nsMatch[1],
          kind: 'namespace',
          language: 'csharp',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Class / Record / Struct
      const classMatch = line.match(
        /^\s*(?:public|private|protected|internal)?\s*(?:abstract|sealed|static|partial)?\s*(?:class|record|struct)\s+(\w+)(?:\s*:\s*([\w.,\s]+))?/,
      );
      if (classMatch) {
        const types = classMatch[2]?.split(',').map((s) => s.trim());
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'csharp',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: types?.[0],
          implementsTypes: types?.slice(1),
        });
      }

      // Interface
      const ifaceMatch = line.match(
        /^\s*(?:public|internal)?\s*interface\s+(\w+)/,
      );
      if (ifaceMatch) {
        symbols.push({
          name: ifaceMatch[1],
          qualifiedName: `${filePath}:${ifaceMatch[1]}`,
          kind: 'interface',
          language: 'csharp',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Methods
      const methodMatch = line.match(
        /^\s*(?:public|private|protected|internal)\s+(?:static\s+|async\s+|virtual\s+|override\s+|abstract\s+)*([\w<>[\]]+)\s+(\w+)\s*\(/,
      );
      if (methodMatch && !line.includes('class ') && !line.includes('interface ')) {
        symbols.push({
          name: methodMatch[2],
          qualifiedName: `${filePath}:${methodMatch[2]}`,
          kind: 'method',
          language: 'csharp',
          returnType: methodMatch[1],
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const usingMatch = line.match(/^\s*using\s+(?:static\s+)?([\w.]+);/);
      if (usingMatch) {
        imports.push({
          source: usingMatch[1],
          specifiers: [usingMatch[1].split('.').pop() || usingMatch[1]],
          isDefault: false,
          isNamespace: true,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return imports;
  },

  detectArchitecturalRole(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('controller')) return 'controller';
    if (lower.includes('service')) return 'service';
    if (lower.includes('repository')) return 'repository';
    if (lower.includes('model') || lower.includes('entity')) return 'model';
    if (lower.includes('dto')) return 'dto';
    if (lower.includes('hub')) return 'gateway';
    if (lower.includes('middleware')) return 'middleware';
    if (lower.includes('test')) return 'test';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const aspMatch = line.match(
        /\[Http(Get|Post|Put|Delete|Patch)\s*(?:\(\s*"([^"]*)"?\s*\))?\]/i,
      );
      if (aspMatch) {
        endpoints.push({
          method: aspMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: aspMatch[2] || '',
          handlerName: `aspnet:${aspMatch[2] || 'index'}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return endpoints;
  },
};

// ─── Python Adapter ──────────────────────────────────────────────────────────

const pythonAdapter: LanguageAdapter = {
  language: 'python',
  extensions: ['.py'],
  treeSitterGrammar: 'python',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Class
      const classMatch = line.match(/^class\s+(\w+)(?:\(([^)]+)\))?:/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'python',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: classMatch[2]?.split(',')[0]?.trim(),
        });
      }

      // Functions / Methods
      const funcMatch = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/);
      if (funcMatch) {
        const indent = funcMatch[1].length;
        symbols.push({
          name: funcMatch[2],
          qualifiedName: `${filePath}:${funcMatch[2]}`,
          kind: indent > 0 ? 'method' : 'function',
          language: 'python',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const fromMatch = line.match(/^\s*from\s+([\w.]+)\s+import\s+(.+)/);
      if (fromMatch) {
        imports.push({
          source: fromMatch[1],
          specifiers: fromMatch[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]),
          isDefault: false,
          isNamespace: false,
          location: makeLocation(filePath, i + 1),
        });
        continue;
      }

      const importMatch = line.match(/^\s*import\s+([\w.]+)/);
      if (importMatch) {
        imports.push({
          source: importMatch[1],
          specifiers: [importMatch[1].split('.').pop() || importMatch[1]],
          isDefault: false,
          isNamespace: true,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return imports;
  },

  detectArchitecturalRole(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('views') || lower.includes('controller') || lower.includes('router')) return 'controller';
    if (lower.includes('service')) return 'service';
    if (lower.includes('repository') || lower.includes('dao')) return 'repository';
    if (lower.includes('model') || lower.includes('schema')) return 'model';
    if (lower.includes('serializer')) return 'dto';
    if (lower.includes('middleware')) return 'middleware';
    if (lower.includes('test') || lower.includes('conftest')) return 'test';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // FastAPI / Flask / Blueprint: @router.get('/path'), @app.route('/path')
      const routeMatch = line.match(
        /@(?:app|router|blueprint|api)\.(get|post|put|delete|patch|route)\s*\(\s*['"]([^'"]+)['"]/i,
      );
      if (routeMatch) {
        const method = routeMatch[1] === 'route' ? 'GET' : routeMatch[1].toUpperCase();
        endpoints.push({
          method: method as DetectedApiEndpoint['method'],
          path: routeMatch[2],
          handlerName: `python:${routeMatch[2]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return endpoints;
  },
};

// ─── Go Adapter ──────────────────────────────────────────────────────────────

const goAdapter: LanguageAdapter = {
  language: 'go',
  extensions: ['.go'],
  treeSitterGrammar: 'go',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Package
      const pkgMatch = line.match(/^package\s+(\w+)/);
      if (pkgMatch) {
        symbols.push({
          name: pkgMatch[1],
          qualifiedName: `${filePath}:${pkgMatch[1]}`,
          kind: 'package',
          language: 'go',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Functions
      const funcMatch = line.match(/^func\s+(\w+)\s*\(/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          qualifiedName: `${filePath}:${funcMatch[1]}`,
          kind: 'function',
          language: 'go',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Receiver Methods
      const methodMatch = line.match(/^func\s+\(\w+\s+\*?(\w+)\)\s+(\w+)\s*\(/);
      if (methodMatch) {
        symbols.push({
          name: methodMatch[2],
          qualifiedName: `${filePath}:${methodMatch[1]}.${methodMatch[2]}`,
          kind: 'method',
          language: 'go',
          location: makeLocation(filePath, lineNum),
          filePath,
          parentSymbol: methodMatch[1],
        });
      }

      // Structs
      const structMatch = line.match(/^type\s+(\w+)\s+struct/);
      if (structMatch) {
        symbols.push({
          name: structMatch[1],
          qualifiedName: `${filePath}:${structMatch[1]}`,
          kind: 'struct',
          language: 'go',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Interfaces
      const ifaceMatch = line.match(/^type\s+(\w+)\s+interface/);
      if (ifaceMatch) {
        symbols.push({
          name: ifaceMatch[1],
          qualifiedName: `${filePath}:${ifaceMatch[1]}`,
          kind: 'interface',
          language: 'go',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];
    const blockMatch = sourceCode.match(/import\s*\(([\s\S]*?)\)/);

    if (blockMatch) {
      const matches = blockMatch[1].matchAll(/"([^"]+)"/g);
      for (const m of matches) {
        imports.push({
          source: m[1],
          specifiers: [m[1].split('/').pop() || m[1]],
          isDefault: false,
          isNamespace: true,
          location: makeLocation(filePath, 1),
        });
      }
    } else {
      const singleMatches = sourceCode.matchAll(/^\s*import\s+"([^"]+)"/gm);
      for (const m of singleMatches) {
        imports.push({
          source: m[1],
          specifiers: [m[1].split('/').pop() || m[1]],
          isDefault: false,
          isNamespace: true,
          location: makeLocation(filePath, 1),
        });
      }
    }

    return imports;
  },

  detectArchitecturalRole(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('handler') || lower.includes('controller')) return 'controller';
    if (lower.includes('service')) return 'service';
    if (lower.includes('repository') || lower.includes('store')) return 'repository';
    if (lower.includes('model')) return 'model';
    if (lower.includes('middleware')) return 'middleware';
    if (lower.includes('_test.go')) return 'test';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Gin / Fiber / Chi / Echo: r.GET("/path", handler)
      const ginMatch = line.match(/\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"]([^'"]+)['"]/i);
      if (ginMatch) {
        endpoints.push({
          method: ginMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: ginMatch[2],
          handlerName: `gin:${ginMatch[2]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return endpoints;
  },
};

// ─── Rust Adapter ────────────────────────────────────────────────────────────

const rustAdapter: LanguageAdapter = {
  language: 'rust',
  extensions: ['.rs'],
  treeSitterGrammar: 'rust',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Structs
      const structMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?struct\s+(\w+)/);
      if (structMatch) {
        symbols.push({
          name: structMatch[1],
          qualifiedName: `${filePath}:${structMatch[1]}`,
          kind: 'struct',
          language: 'rust',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Enums
      const enumMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          qualifiedName: `${filePath}:${enumMatch[1]}`,
          kind: 'enum',
          language: 'rust',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Traits
      const traitMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?trait\s+(\w+)/);
      if (traitMatch) {
        symbols.push({
          name: traitMatch[1],
          qualifiedName: `${filePath}:${traitMatch[1]}`,
          kind: 'trait',
          language: 'rust',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Functions
      const fnMatch = line.match(/^\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+(\w+)/);
      if (fnMatch) {
        symbols.push({
          name: fnMatch[1],
          qualifiedName: `${filePath}:${fnMatch[1]}`,
          kind: 'function',
          language: 'rust',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];
    const useMatches = sourceCode.matchAll(/^\s*use\s+([\w:]+(?:\{[^}]+\})?);/gm);

    for (const m of useMatches) {
      const raw = m[1];
      const parts = raw.split('::');
      const base = parts[0];
      imports.push({
        source: base,
        specifiers: [parts[parts.length - 1]],
        isDefault: false,
        isNamespace: false,
        location: makeLocation(filePath, 1),
      });
    }

    return imports;
  },

  detectArchitecturalRole(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('handler') || lower.includes('routes')) return 'controller';
    if (lower.includes('service')) return 'service';
    if (lower.includes('repository') || lower.includes('db')) return 'repository';
    if (lower.includes('model') || lower.includes('schema')) return 'model';
    if (lower.includes('test')) return 'test';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Actix / Axum / Rocket macros: #[get("/path")], #[post("/path")]
      const macroMatch = line.match(/#\[(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/i);
      if (macroMatch) {
        endpoints.push({
          method: macroMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: macroMatch[2],
          handlerName: `rust:${macroMatch[2]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return endpoints;
  },
};

// ─── C++ Adapter ─────────────────────────────────────────────────────────────

const cppAdapter: LanguageAdapter = {
  language: 'cpp',
  extensions: ['.cpp', '.cc', '.cxx', '.c', '.hpp', '.h', '.hxx'],
  treeSitterGrammar: 'cpp',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Namespace
      const nsMatch = line.match(/^\s*namespace\s+(\w+)/);
      if (nsMatch) {
        symbols.push({
          name: nsMatch[1],
          qualifiedName: nsMatch[1],
          kind: 'namespace',
          language: 'cpp',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Class / Struct
      const classMatch = line.match(/^\s*(?:template\s*<[^>]+>\s*)?(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+(\w+))?/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'cpp',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: classMatch[2],
        });
      }

      // Functions / Methods
      const funcMatch = line.match(/^\s*(?:virtual\s+|static\s+|inline\s+)*[\w:*&<>]+\s+(\w+::)?(\w+)\s*\([^)]*\)\s*(?:const)?\s*(?:override|final)?\s*[{;]/);
      if (funcMatch && !line.includes('class ') && !line.includes('struct ')) {
        const name = funcMatch[2];
        symbols.push({
          name,
          qualifiedName: `${filePath}:${name}`,
          kind: 'function',
          language: 'cpp',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const incMatch = line.match(/^\s*#include\s+["<]([^">]+)[">]/);
      if (incMatch) {
        imports.push({
          source: incMatch[1],
          specifiers: [incMatch[1].split('/').pop() || incMatch[1]],
          isDefault: false,
          isNamespace: true,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return imports;
  },

  detectArchitecturalRole(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('service')) return 'service';
    if (lower.includes('model') || lower.includes('entity')) return 'model';
    if (lower.includes('test')) return 'test';
    if (lower.includes('util') || lower.includes('helper')) return 'utility';
    return 'unknown';
  },
};

// ─── SQL Adapter (DDL Tables, Columns, Relations) ────────────────────────────

const sqlAdapter: LanguageAdapter = {
  language: 'sql',
  extensions: ['.sql'],
  treeSitterGrammar: 'sql',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const tables = this.extractSqlTables?.(sourceCode, filePath) ?? [];

    for (const t of tables) {
      symbols.push({
        name: t.tableName,
        qualifiedName: `table:${t.tableName}`,
        kind: 'table',
        language: 'sql',
        location: t.location,
        filePath,
      });

      for (const col of t.columns) {
        symbols.push({
          name: `${t.tableName}.${col.name}`,
          qualifiedName: `column:${t.tableName}.${col.name}`,
          kind: 'column',
          language: 'sql',
          typeAnnotation: col.type,
          location: t.location,
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports() {
    return [];
  },

  detectArchitecturalRole() {
    return 'migration';
  },

  extractSqlTables(sourceCode, filePath) {
    const tables: DetectedSqlTable[] = [];
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\);/gi;

    let match: RegExpExecArray | null;
    while ((match = createTableRegex.exec(sourceCode)) !== null) {
      const tableName = match[2] || match[1];
      const body = match[3];
      const line = sourceCode.slice(0, match.index).split('\n').length;

      const columns: Array<{ name: string; type: string; isPrimary?: boolean; isNullable?: boolean }> = [];
      const foreignKeys: Array<{ column: string; referencesTable: string; referencesColumn: string }> = [];

      const colLines = body.split(',');
      for (const rawCol of colLines) {
        const trimmed = rawCol.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;

        // Table-level foreign key: FOREIGN KEY (col) REFERENCES other_table(other_col)
        const tableFkMatch = trimmed.match(/FOREIGN\s+KEY\s*\(([`"']?\w+[`"']?)\)\s*REFERENCES\s+([`"']?\w+[`"']?)\s*(?:\(([`"']?\w+[`"']?)\))?/i);
        if (tableFkMatch) {
          foreignKeys.push({
            column: tableFkMatch[1].replace(/[`"']/g, ''),
            referencesTable: tableFkMatch[2].replace(/[`"']/g, ''),
            referencesColumn: (tableFkMatch[3] || 'id').replace(/[`"']/g, ''),
          });
          continue;
        }

        // Primary key constraint
        if (/^PRIMARY\s+KEY/i.test(trimmed)) continue;

        // Column with inline REFERENCES constraint: col TYPE ... REFERENCES other_table(col)
        const inlineFkMatch = trimmed.match(/^[`"']?(\w+)[`"']?\s+([A-Za-z0-9_()]+).*?REFERENCES\s+([`"']?\w+[`"']?)\s*(?:\(([`"']?\w+[`"']?)\))?/i);
        if (inlineFkMatch) {
          foreignKeys.push({
            column: inlineFkMatch[1].replace(/[`"']/g, ''),
            referencesTable: inlineFkMatch[3].replace(/[`"']/g, ''),
            referencesColumn: (inlineFkMatch[4] || 'id').replace(/[`"']/g, ''),
          });
        }

        // Standard column: name TYPE [constraints]
        const colMatch = trimmed.match(/^[`"']?(\w+)[`"']?\s+([A-Za-z0-9_()]+)(.*)/);
        if (colMatch) {
          const colName = colMatch[1];
          const colType = colMatch[2];
          const rest = colMatch[3] || '';
          columns.push({
            name: colName,
            type: colType,
            isPrimary: /PRIMARY\s+KEY/i.test(rest),
            isNullable: !/NOT\s+NULL/i.test(rest),
          });
        }
      }

      tables.push({
        tableName,
        filePath,
        columns,
        foreignKeys,
        location: makeLocation(filePath, line),
      });
    }

    return tables;
  },
};

// ─── Docker Adapter (Dockerfile & compose) ───────────────────────────────────

const dockerAdapter: LanguageAdapter = {
  language: 'docker',
  extensions: ['dockerfile', '.dockerfile', 'docker-compose.yml', 'docker-compose.yaml'],
  treeSitterGrammar: 'dockerfile',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const services = this.extractDockerServices?.(sourceCode, filePath) ?? [];

    for (const s of services) {
      symbols.push({
        name: s.serviceName,
        qualifiedName: `docker:${s.serviceName}`,
        kind: 'docker-service',
        language: 'docker',
        location: s.location,
        filePath,
      });
    }

    return symbols;
  },

  extractImports(sourceCode, filePath) {
    const imports: ParsedImport[] = [];
    const fromMatches = sourceCode.matchAll(/^\s*FROM\s+([^\s]+)/gim);
    for (const m of fromMatches) {
      imports.push({
        source: m[1],
        specifiers: [m[1]],
        isDefault: true,
        isNamespace: false,
        location: makeLocation(filePath, 1),
      });
    }
    return imports;
  },

  detectArchitecturalRole() {
    return 'configuration';
  },

  extractDockerServices(sourceCode, filePath) {
    const services: DetectedDockerService[] = [];

    if (filePath.toLowerCase().includes('docker-compose')) {
      const lines = sourceCode.split('\n');
      let currentService: { name: string; line: number; image?: string; ports: string[]; dependsOn: string[] } | null = null;
      let inServices = false;
      let inDependsOn = false;
      let inPorts = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (/^services:\s*$/i.test(trimmed)) {
          inServices = true;
          continue;
        }

        if (inServices) {
          // Top-level key out of services
          if (/^[a-zA-Z0-9_-]+:\s*$/.test(line) && !line.startsWith(' ')) {
            if (currentService) {
              services.push({
                serviceName: currentService.name,
                filePath,
                image: currentService.image,
                ports: currentService.ports,
                dependsOn: currentService.dependsOn,
                location: makeLocation(filePath, currentService.line),
              });
              currentService = null;
            }
            inServices = false;
            continue;
          }

          const RESERVED_COMPOSE_KEYS = new Set([
            'services', 'version', 'networks', 'volumes', 'configs', 'secrets',
            'ports', 'depends_on', 'environment', 'env_file', 'build', 'command',
            'entrypoint', 'volumes_from', 'restart', 'labels', 'expose', 'deploy',
          ]);

          // Service declaration (indented by exactly 2 spaces)
          const svcMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/);
          if (svcMatch && !RESERVED_COMPOSE_KEYS.has(svcMatch[1].toLowerCase())) {
            if (currentService) {
              services.push({
                serviceName: currentService.name,
                filePath,
                image: currentService.image,
                ports: currentService.ports,
                dependsOn: currentService.dependsOn,
                location: makeLocation(filePath, currentService.line),
              });
            }
            currentService = {
              name: svcMatch[1],
              line: i + 1,
              ports: [],
              dependsOn: [],
            };
            inDependsOn = false;
            inPorts = false;
            continue;
          }

          if (currentService) {
            const imageMatch = trimmed.match(/^image:\s*['"]?([^'"]+)['"]?/i);
            if (imageMatch) {
              currentService.image = imageMatch[1];
            }

            if (/^depends_on:\s*$/i.test(trimmed)) {
              inDependsOn = true;
              inPorts = false;
              continue;
            }

            if (/^ports:\s*$/i.test(trimmed)) {
              inPorts = true;
              inDependsOn = false;
              continue;
            }

            if (inDependsOn) {
              const depMatch = trimmed.match(/^-\s*([a-zA-Z0-9_-]+)/);
              if (depMatch) {
                currentService.dependsOn.push(depMatch[1]);
              } else if (!trimmed.startsWith('-')) {
                inDependsOn = false;
              }
            }

            if (inPorts) {
              const portMatch = trimmed.match(/^-\s*['"]?([0-9:]+)['"]?/);
              if (portMatch) {
                currentService.ports.push(portMatch[1]);
              } else if (!trimmed.startsWith('-')) {
                inPorts = false;
              }
            }
          }
        }
      }

      if (currentService) {
        services.push({
          serviceName: currentService.name,
          filePath,
          image: currentService.image,
          ports: currentService.ports,
          dependsOn: currentService.dependsOn,
          location: makeLocation(filePath, currentService.line),
        });
      }
    } else {
      // Dockerfile parser
      let baseImage: string | undefined;
      const ports: string[] = [];
      const lines = sourceCode.split('\n');

      for (const line of lines) {
        const fromMatch = line.match(/^\s*FROM\s+([^\s]+)(?:\s+AS\s+\w+)?/i);
        if (fromMatch && !baseImage) {
          baseImage = fromMatch[1];
        }
        const exposeMatch = line.match(/^\s*EXPOSE\s+([0-9\s]+)/i);
        if (exposeMatch) {
          ports.push(...exposeMatch[1].split(/\s+/).filter(Boolean));
        }
      }

      services.push({
        serviceName: filePath.split('/').pop() || 'Dockerfile',
        filePath,
        image: baseImage,
        ports,
        location: makeLocation(filePath, 1),
      });
    }

    return services;
  },
};

// ─── YAML & JSON Adapter ─────────────────────────────────────────────────────

const yamlAdapter: LanguageAdapter = {
  language: 'yaml',
  extensions: ['.yaml', '.yml'],
  treeSitterGrammar: 'yaml',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < Math.min(lines.length, 200); i++) {
      const line = lines[i];
      const keyMatch = line.match(/^(\w[\w.-]*):/);
      if (keyMatch) {
        symbols.push({
          name: keyMatch[1],
          qualifiedName: `config:${filePath}:${keyMatch[1]}`,
          kind: 'config-item',
          language: 'yaml',
          location: makeLocation(filePath, i + 1),
          filePath,
        });
      }
    }

    return symbols;
  },

  extractImports() {
    return [];
  },

  detectArchitecturalRole() {
    return 'configuration';
  },
};

const jsonAdapter: LanguageAdapter = {
  language: 'json',
  extensions: ['.json'],
  treeSitterGrammar: 'json',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    try {
      const parsed = JSON.parse(sourceCode);
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(parsed)) {
          symbols.push({
            name: key,
            qualifiedName: `config:${filePath}:${key}`,
            kind: 'config-item',
            language: 'json',
            location: makeLocation(filePath, 1),
            filePath,
          });
        }
      }
    } catch {}

    return symbols;
  },

  extractImports() {
    return [];
  },

  detectArchitecturalRole() {
    return 'configuration';
  },
};

// ─── Markdown Adapter ────────────────────────────────────────────────────────

const markdownAdapter: LanguageAdapter = {
  language: 'markdown',
  extensions: ['.md', '.mdx', '.markdown'],
  treeSitterGrammar: 'markdown',

  extractSymbols(sourceCode, filePath) {
    const symbols: ParsedSymbol[] = [];
    const sections = this.extractDocSections?.(sourceCode, filePath) ?? [];

    for (const s of sections) {
      symbols.push({
        name: s.title,
        qualifiedName: `doc:${filePath}#${s.title.toLowerCase().replace(/\s+/g, '-')}`,
        kind: 'doc-section',
        language: 'markdown',
        location: s.location,
        filePath,
      });
    }

    return symbols;
  },

  extractImports() {
    return [];
  },

  detectArchitecturalRole() {
    return 'unknown';
  },

  extractDocSections(sourceCode, filePath) {
    const sections: DetectedDocSection[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        sections.push({
          level: headingMatch[1].length,
          title: headingMatch[2].trim(),
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return sections;
  },
};

// ─── Adapter Registry ────────────────────────────────────────────────────────

const adapterRegistry = new Map<SupportedLanguage, LanguageAdapter>();
adapterRegistry.set('typescript', typescriptAdapter);
adapterRegistry.set('javascript', javascriptAdapter);
adapterRegistry.set('java', javaAdapter);
adapterRegistry.set('csharp', csharpAdapter);
adapterRegistry.set('python', pythonAdapter);
adapterRegistry.set('go', goAdapter);
adapterRegistry.set('rust', rustAdapter);
adapterRegistry.set('cpp', cppAdapter);
adapterRegistry.set('sql', sqlAdapter);
adapterRegistry.set('docker', dockerAdapter);
adapterRegistry.set('yaml', yamlAdapter);
adapterRegistry.set('json', jsonAdapter);
adapterRegistry.set('markdown', markdownAdapter);

export function getLanguageAdapter(language: SupportedLanguage): LanguageAdapter | undefined {
  return adapterRegistry.get(language);
}

export function detectLanguage(filePath: string): SupportedLanguage | undefined {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  if (fileName === 'dockerfile' || fileName.startsWith('dockerfile.') || fileName.includes('docker-compose')) {
    return 'docker';
  }

  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  for (const [language, adapter] of adapterRegistry) {
    if (adapter.extensions.includes(ext) || adapter.extensions.includes(fileName)) {
      return language;
    }
  }
  return undefined;
}

export function getAllAdapters(): LanguageAdapter[] {
  return Array.from(adapterRegistry.values());
}
