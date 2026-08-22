/**
 * Language Adapters Registry
 *
 * Defines the interface for language-specific parsing adapters and
 * registers adapters for all supported languages.
 *
 * Each adapter knows how to extract symbols, imports, call sites,
 * and structural information from AST nodes of its language.
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

  /**
   * Tree-sitter grammar name for loading WASM grammar.
   */
  readonly treeSitterGrammar: string;

  /**
   * Extract symbols from a Tree-sitter AST root node.
   * When Tree-sitter is unavailable, uses regex-based fallback.
   */
  extractSymbols(
    sourceCode: string,
    filePath: RelativePath,
    rootNode?: unknown,
  ): ParsedSymbol[];

  /**
   * Extract imports from source code.
   */
  extractImports(
    sourceCode: string,
    filePath: RelativePath,
    rootNode?: unknown,
  ): ParsedImport[];

  /**
   * Detect the architectural role of a file based on its symbols and path.
   */
  detectArchitecturalRole(
    filePath: RelativePath,
    symbols: ParsedSymbol[],
  ): ArchitecturalRole;

  /**
   * Detect API endpoints (routes, handlers) from source code.
   */
  detectApiEndpoints?(
    sourceCode: string,
    filePath: RelativePath,
    symbols: ParsedSymbol[],
  ): DetectedApiEndpoint[];
}

export interface DetectedApiEndpoint {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  readonly path: string;
  readonly handlerName: string;
  readonly filePath: RelativePath;
  readonly location: SourceLocation;
}

// ─── Regex-Based Fallback Extractors ─────────────────────────────────────────

// These are used when Tree-sitter WASM grammars are unavailable.
// They extract the most important structural information.

function makeLocation(filePath: string, line: number, col: number = 0): SourceLocation {
  return {
    filePath,
    startLine: line,
    startColumn: col,
    endLine: line,
    endColumn: col + 1,
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
        /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+(.+?))?/,
      );
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: classMatch[2],
          implementsTypes: classMatch[3]?.split(',').map((s) => s.trim()),
          modifiers: line.includes('export') ? ['export'] : [],
        });
      }

      // Interfaces
      const interfaceMatch = line.match(
        /^\s*(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+(.+?))?/,
      );
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          qualifiedName: `${filePath}:${interfaceMatch[1]}`,
          kind: 'interface',
          language: 'typescript',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: interfaceMatch[2],
        });
      }

      // Functions
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
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // import { x, y } from 'module'
      const namedMatch = line.match(
        /^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
      );
      if (namedMatch) {
        imports.push({
          source: namedMatch[2],
          specifiers: namedMatch[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]),
          isDefault: false,
          isNamespace: false,
          location: makeLocation(filePath, lineNum),
        });
        continue;
      }

      // import Default from 'module'
      const defaultMatch = line.match(
        /^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      );
      if (defaultMatch) {
        imports.push({
          source: defaultMatch[2],
          specifiers: [defaultMatch[1]],
          isDefault: true,
          isNamespace: false,
          location: makeLocation(filePath, lineNum),
        });
        continue;
      }

      // import * as name from 'module'
      const namespaceMatch = line.match(
        /^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      );
      if (namespaceMatch) {
        imports.push({
          source: namespaceMatch[2],
          specifiers: [namespaceMatch[1]],
          isDefault: false,
          isNamespace: true,
          location: makeLocation(filePath, lineNum),
        });
      }

      // import type { x } from 'module'
      const typeImportMatch = line.match(
        /^\s*import\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
      );
      if (typeImportMatch) {
        imports.push({
          source: typeImportMatch[2],
          specifiers: typeImportMatch[1].split(',').map((s) => s.trim()),
          isDefault: false,
          isNamespace: false,
          location: makeLocation(filePath, lineNum),
        });
      }
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

  detectApiEndpoints(sourceCode, filePath, symbols) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Express-style: app.get('/path', handler)  or router.post('/path', handler)
      const expressMatch = line.match(
        /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i,
      );
      if (expressMatch) {
        endpoints.push({
          method: expressMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: expressMatch[2],
          handlerName: `handler:${expressMatch[2]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }

      // Decorator-style: @Get('/path'), @Post('/path'), etc.
      const decoratorMatch = line.match(
        /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]*)['"]\s*\)/i,
      );
      if (decoratorMatch) {
        endpoints.push({
          method: decoratorMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: decoratorMatch[2],
          handlerName: `decorator:${decoratorMatch[2]}`,
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

      // Classes
      const classMatch = line.match(
        /^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+(.+?))?/,
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

      // Interfaces
      const interfaceMatch = line.match(
        /^\s*(?:public\s+)?interface\s+(\w+)/,
      );
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          qualifiedName: `${filePath}:${interfaceMatch[1]}`,
          kind: 'interface',
          language: 'java',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Methods
      const methodMatch = line.match(
        /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:abstract\s+)?(?:final\s+)?(?:synchronized\s+)?\S+\s+(\w+)\s*\(/,
      );
      if (methodMatch && !line.includes('class ') && !line.includes('interface ')) {
        symbols.push({
          name: methodMatch[1],
          qualifiedName: `${filePath}:${methodMatch[1]}`,
          kind: 'method',
          language: 'java',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Enums
      const enumMatch = line.match(/^\s*(?:public\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          qualifiedName: `${filePath}:${enumMatch[1]}`,
          kind: 'enum',
          language: 'java',
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
      const importMatch = line.match(/^\s*import\s+(?:static\s+)?([\w.*]+)/);
      if (importMatch) {
        imports.push({
          source: importMatch[1],
          specifiers: [importMatch[1].split('.').pop() || importMatch[1]],
          isDefault: false,
          isNamespace: importMatch[1].endsWith('.*'),
          location: makeLocation(filePath, i + 1),
        });
      }
    }

    return imports;
  },

  detectArchitecturalRole(filePath, symbols) {
    const lower = filePath.toLowerCase();
    if (lower.includes('controller')) return 'controller';
    if (lower.includes('service') && !lower.includes('test')) return 'service';
    if (lower.includes('repository') || lower.includes('dao')) return 'repository';
    if (lower.includes('model') || lower.includes('entity')) return 'model';
    if (lower.includes('dto')) return 'dto';
    if (lower.includes('handler')) return 'handler';
    if (lower.includes('filter')) return 'filter';
    if (lower.includes('interceptor')) return 'interceptor';
    if (lower.includes('factory')) return 'factory';
    if (lower.includes('config') || lower.includes('configuration')) return 'configuration';
    if (lower.includes('test') || lower.includes('spec')) return 'test';
    if (lower.includes('util') || lower.includes('helper')) return 'utility';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Spring-style: @GetMapping, @PostMapping, @RequestMapping
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

      const requestMatch = line.match(
        /@RequestMapping\s*\(\s*(?:.*method\s*=\s*RequestMethod\.(\w+))?.*(?:value\s*=\s*)?['"]([^'"]*)['"]/i,
      );
      if (requestMatch) {
        endpoints.push({
          method: (requestMatch[1] || 'GET').toUpperCase() as DetectedApiEndpoint['method'],
          path: requestMatch[2],
          handlerName: `spring:${requestMatch[2]}`,
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

      // Namespaces
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

      // Classes
      const classMatch = line.match(
        /^\s*(?:public|private|protected|internal)?\s*(?:abstract|sealed|static|partial)?\s*class\s+(\w+)/,
      );
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'csharp',
          location: makeLocation(filePath, lineNum),
          filePath,
        });
      }

      // Interfaces
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
        /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:virtual\s+)?(?:override\s+)?(?:abstract\s+)?\S+\s+(\w+)\s*\(/,
      );
      if (methodMatch && !line.includes('class ') && !line.includes('interface ')) {
        symbols.push({
          name: methodMatch[1],
          qualifiedName: `${filePath}:${methodMatch[1]}`,
          kind: 'method',
          language: 'csharp',
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
      const usingMatch = line.match(/^\s*using\s+(?:static\s+)?([\w.]+)/);
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

  detectArchitecturalRole(filePath, symbols) {
    const lower = filePath.toLowerCase();
    if (lower.includes('controller')) return 'controller';
    if (lower.includes('service') && !lower.includes('test')) return 'service';
    if (lower.includes('repository')) return 'repository';
    if (lower.includes('model') || lower.includes('entity')) return 'model';
    if (lower.includes('dto') || lower.includes('viewmodel')) return 'dto';
    if (lower.includes('handler')) return 'handler';
    if (lower.includes('middleware')) return 'middleware';
    if (lower.includes('filter')) return 'filter';
    if (lower.includes('hub')) return 'gateway';
    if (lower.includes('config') || lower.includes('startup')) return 'configuration';
    if (lower.includes('test')) return 'test';
    if (lower.includes('util') || lower.includes('helper') || lower.includes('extension')) return 'utility';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ASP.NET Core: [HttpGet("path")], [HttpPost("path")]
      const aspMatch = line.match(
        /\[Http(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]*)"?\s*\)\]/i,
      );
      if (aspMatch) {
        endpoints.push({
          method: aspMatch[1].toUpperCase() as DetectedApiEndpoint['method'],
          path: aspMatch[2],
          handlerName: `aspnet:${aspMatch[2]}`,
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

      // Classes
      const classMatch = line.match(/^class\s+(\w+)(?:\(([^)]+)\))?/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          qualifiedName: `${filePath}:${classMatch[1]}`,
          kind: 'class',
          language: 'python',
          location: makeLocation(filePath, lineNum),
          filePath,
          extendsType: classMatch[2],
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

      // from module import x, y
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

      // import module
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

  detectArchitecturalRole(filePath, symbols) {
    const lower = filePath.toLowerCase();
    if (lower.includes('view') || lower.includes('controller')) return 'controller';
    if (lower.includes('service')) return 'service';
    if (lower.includes('repository') || lower.includes('dao')) return 'repository';
    if (lower.includes('model')) return 'model';
    if (lower.includes('serializer') || lower.includes('schema')) return 'dto';
    if (lower.includes('handler')) return 'handler';
    if (lower.includes('middleware')) return 'middleware';
    if (lower.includes('config') || lower.includes('settings')) return 'configuration';
    if (lower.includes('test') || lower.includes('conftest')) return 'test';
    if (lower.includes('fixture')) return 'test-fixture';
    if (lower.includes('util') || lower.includes('helper')) return 'utility';
    if (lower.includes('migration')) return 'migration';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Flask/FastAPI decorators: @app.route('/path'), @app.get('/path')
      const flaskMatch = line.match(
        /@(?:app|router|blueprint)\.(get|post|put|delete|patch|route)\s*\(\s*['"]([^'"]+)['"]/i,
      );
      if (flaskMatch) {
        const method = flaskMatch[1] === 'route' ? 'GET' : flaskMatch[1].toUpperCase();
        endpoints.push({
          method: method as DetectedApiEndpoint['method'],
          path: flaskMatch[2],
          handlerName: `python:${flaskMatch[2]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }

      // Django URL patterns: path('route/', view)
      const djangoMatch = line.match(/path\s*\(\s*['"]([^'"]+)['"]/);
      if (djangoMatch) {
        endpoints.push({
          method: 'GET',
          path: djangoMatch[1],
          handlerName: `django:${djangoMatch[1]}`,
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

      // Methods (receiver functions)
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

    // Single imports: import "path"
    const singleMatches = sourceCode.matchAll(/^\s*import\s+"([^"]+)"/gm);
    for (const match of singleMatches) {
      imports.push({
        source: match[1],
        specifiers: [match[1].split('/').pop() || match[1]],
        isDefault: false,
        isNamespace: true,
        location: makeLocation(filePath, 1),
      });
    }

    // Block imports: import ( "path1" "path2" )
    const blockMatch = sourceCode.match(/import\s*\(([\s\S]*?)\)/);
    if (blockMatch) {
      const importLines = blockMatch[1].matchAll(/"([^"]+)"/g);
      for (const imp of importLines) {
        imports.push({
          source: imp[1],
          specifiers: [imp[1].split('/').pop() || imp[1]],
          isDefault: false,
          isNamespace: true,
          location: makeLocation(filePath, 1),
        });
      }
    }

    return imports;
  },

  detectArchitecturalRole(filePath, symbols) {
    const lower = filePath.toLowerCase();
    if (lower.includes('handler')) return 'handler';
    if (lower.includes('controller')) return 'controller';
    if (lower.includes('service')) return 'service';
    if (lower.includes('repository') || lower.includes('store')) return 'repository';
    if (lower.includes('model')) return 'model';
    if (lower.includes('middleware')) return 'middleware';
    if (lower.includes('config')) return 'configuration';
    if (lower.includes('_test.go')) return 'test';
    if (lower.includes('util') || lower.includes('helper')) return 'utility';
    return 'unknown';
  },

  detectApiEndpoints(sourceCode, filePath) {
    const endpoints: DetectedApiEndpoint[] = [];
    const lines = sourceCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Go HTTP mux: r.HandleFunc("/path", handler).Methods("GET")
      const muxMatch = line.match(
        /\.(?:HandleFunc|Handle)\s*\(\s*['"]([^'"]+)['"]/,
      );
      if (muxMatch) {
        const methodMatch = line.match(/Methods\s*\(\s*['"](\w+)['"]/);
        endpoints.push({
          method: (methodMatch?.[1] || 'GET').toUpperCase() as DetectedApiEndpoint['method'],
          path: muxMatch[1],
          handlerName: `go:${muxMatch[1]}`,
          filePath,
          location: makeLocation(filePath, i + 1),
        });
      }

      // Gin: r.GET("/path", handler)
      const ginMatch = line.match(
        /\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"]([^'"]+)['"]/,
      );
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

// ─── Adapter Registry ────────────────────────────────────────────────────────

const adapterRegistry = new Map<SupportedLanguage, LanguageAdapter>();
adapterRegistry.set('typescript', typescriptAdapter);
adapterRegistry.set('javascript', javascriptAdapter);
adapterRegistry.set('java', javaAdapter);
adapterRegistry.set('csharp', csharpAdapter);
adapterRegistry.set('python', pythonAdapter);
adapterRegistry.set('go', goAdapter);

/**
 * Get the language adapter for a supported language.
 */
export function getLanguageAdapter(language: SupportedLanguage): LanguageAdapter | undefined {
  return adapterRegistry.get(language);
}

/**
 * Detect the language of a file by its extension.
 */
export function detectLanguage(filePath: string): SupportedLanguage | undefined {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  for (const [language, adapter] of adapterRegistry) {
    if (adapter.extensions.includes(ext)) {
      return language;
    }
  }
  return undefined;
}

/**
 * Get all registered language adapters.
 */
export function getAllAdapters(): LanguageAdapter[] {
  return Array.from(adapterRegistry.values());
}
