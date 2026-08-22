/**
 * Structure Analyzer
 *
 * Detects and builds the structural hierarchy of the repository:
 * Repository → Projects → Applications/Services → Modules → Components → Files → Symbols, Tables, Docker Services, Docs
 *
 * Populates the Knowledge Graph with full multi-language structural entities.
 */

import * as path from 'path';
import { createLogger } from '../../shared/logger.js';
import type { RelativePath, SupportedLanguage, ArchitecturalLayer } from '../../shared/types.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import { createGraphNode } from '../graph/graphNode.js';
import type { FileParseResult } from '../parser/treeSitterParser.js';
import type { FileMetadata } from '../../shared/types.js';
import { getLanguageAdapter } from '../parser/languageAdapters.js';

const log = createLogger('intelligence:analyzer:structure');

export interface ProjectDescriptor {
  readonly path: RelativePath;
  readonly name: string;
  readonly type: string; // 'npm', 'maven', 'gradle', 'dotnet', 'go-module', 'pip', 'cargo'
  readonly framework?: string;
  readonly frameworkVersion?: string;
}

// ─── Project Detection ───────────────────────────────────────────────────────

const PROJECT_MARKERS: Array<{
  file: string;
  type: string;
  frameworkDetector?: (content: string) => { framework: string; version?: string } | undefined;
}> = [
  {
    file: 'package.json',
    type: 'npm',
    frameworkDetector: (content) => {
      try {
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['next']) return { framework: 'Next.js', version: deps['next'] };
        if (deps['nuxt']) return { framework: 'Nuxt', version: deps['nuxt'] };
        if (deps['@angular/core']) return { framework: 'Angular', version: deps['@angular/core'] };
        if (deps['react']) return { framework: 'React', version: deps['react'] };
        if (deps['vue']) return { framework: 'Vue', version: deps['vue'] };
        if (deps['express']) return { framework: 'Express', version: deps['express'] };
        if (deps['@nestjs/core']) return { framework: 'NestJS', version: deps['@nestjs/core'] };
        if (deps['fastify']) return { framework: 'Fastify', version: deps['fastify'] };
      } catch {}
      return undefined;
    },
  },
  { file: 'pom.xml', type: 'maven' },
  { file: 'build.gradle', type: 'gradle' },
  { file: 'build.gradle.kts', type: 'gradle' },
  { file: '*.csproj', type: 'dotnet' },
  { file: '*.sln', type: 'dotnet' },
  { file: 'go.mod', type: 'go-module' },
  { file: 'Cargo.toml', type: 'cargo' },
  { file: 'CMakeLists.txt', type: 'cmake' },
  { file: 'requirements.txt', type: 'pip' },
  { file: 'setup.py', type: 'pip' },
  { file: 'pyproject.toml', type: 'pip' },
];

/**
 * Detect projects within the file tree.
 */
export function detectProjects(files: FileMetadata[]): ProjectDescriptor[] {
  const projects: ProjectDescriptor[] = [];
  const dirs = new Set<string>();

  for (const file of files) {
    dirs.add(path.dirname(file.path));
  }

  const filePaths = new Set(files.map((f) => f.path));

  for (const marker of PROJECT_MARKERS) {
    if (marker.file.includes('*')) {
      const ext = marker.file.replace('*', '');
      for (const fp of filePaths) {
        if (fp.endsWith(ext)) {
          projects.push({
            path: path.dirname(fp),
            name: path.basename(path.dirname(fp)) || path.basename(fp, ext),
            type: marker.type,
          });
        }
      }
    } else {
      for (const dir of dirs) {
        const candidatePath = dir === '.' ? marker.file : `${dir}/${marker.file}`;
        if (filePaths.has(candidatePath)) {
          projects.push({
            path: dir,
            name: path.basename(dir) || 'root',
            type: marker.type,
          });
        }
      }

      if (filePaths.has(marker.file)) {
        const existing = projects.find((p) => p.path === '.');
        if (!existing) {
          projects.push({
            path: '.',
            name: 'root',
            type: marker.type,
          });
        }
      }
    }
  }

  return projects;
}

// ─── Layer Detection ─────────────────────────────────────────────────────────

export function detectLayer(filePath: RelativePath): ArchitecturalLayer {
  const lower = filePath.toLowerCase();

  // Test layer
  if (
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.includes('/__tests__/') ||
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('_test.')
  ) {
    return 'test';
  }

  // Build/deployment layer
  if (
    lower.includes('/build/') ||
    lower.includes('/dist/') ||
    lower.includes('/deploy/') ||
    lower.includes('dockerfile') ||
    lower.includes('docker-compose') ||
    lower.includes('.github/') ||
    lower.includes('jenkinsfile')
  ) {
    return 'build';
  }

  // Presentation layer
  if (
    lower.includes('/ui/') ||
    lower.includes('/frontend/') ||
    lower.includes('/client/') ||
    lower.includes('/pages/') ||
    lower.includes('/views/') ||
    lower.includes('/components/') ||
    lower.includes('/screens/') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.jsx')
  ) {
    return 'presentation';
  }

  // API layer
  if (
    lower.includes('/api/') ||
    lower.includes('/routes/') ||
    lower.includes('/endpoints/') ||
    lower.includes('/controllers/') ||
    lower.includes('controller.')
  ) {
    return 'api';
  }

  // Business logic layer
  if (
    lower.includes('/services/') ||
    lower.includes('/domain/') ||
    lower.includes('/business/') ||
    lower.includes('/logic/') ||
    lower.includes('/core/') ||
    lower.includes('service.')
  ) {
    return 'business-logic';
  }

  // Data access layer
  if (
    lower.includes('/data/') ||
    lower.includes('/repositories/') ||
    lower.includes('/repo/') ||
    lower.includes('/models/') ||
    lower.includes('/entities/') ||
    lower.includes('/database/') ||
    lower.includes('/migrations/') ||
    lower.includes('/schema/') ||
    lower.includes('/dao/') ||
    lower.includes('repository.') ||
    lower.endsWith('.sql')
  ) {
    return 'data-access';
  }

  // Infrastructure layer
  if (
    lower.includes('/infrastructure/') ||
    lower.includes('/infra/') ||
    lower.includes('/config/') ||
    lower.includes('/middleware/') ||
    lower.includes('/interceptors/')
  ) {
    return 'infrastructure';
  }

  // Shared layer
  if (
    lower.includes('/shared/') ||
    lower.includes('/common/') ||
    lower.includes('/utils/') ||
    lower.includes('/helpers/') ||
    lower.includes('/lib/')
  ) {
    return 'shared';
  }

  return 'unknown';
}

// ─── Module Detection ────────────────────────────────────────────────────────

export function detectModules(files: FileMetadata[]): Map<string, RelativePath[]> {
  const modules = new Map<string, RelativePath[]>();

  for (const file of files) {
    const parts = file.path.split('/');

    if (parts.length >= 2) {
      let modulePath: string;
      const topLevel = parts[0].toLowerCase();
      if (['src', 'app', 'lib', 'packages'].includes(topLevel) && parts.length >= 3) {
        modulePath = parts.slice(0, 3).join('/');
      } else {
        modulePath = parts.slice(0, 2).join('/');
      }

      if (!modules.has(modulePath)) {
        modules.set(modulePath, []);
      }
      modules.get(modulePath)!.push(file.path);
    }
  }

  return modules;
}

// ─── Graph Population ────────────────────────────────────────────────────────

export function buildStructure(
  graph: KnowledgeGraph,
  workspaceName: string,
  files: FileMetadata[],
  parseResults: FileParseResult[],
  projects: ProjectDescriptor[],
  generation: number,
): void {
  log.info('Building structural hierarchy', {
    files: files.length,
    parseResults: parseResults.length,
    projects: projects.length,
  });

  // Level 1: Repository
  const repoId = 'repo:root';
  const detectedLanguages = [...new Set(files.map((f) => f.language))];
  const totalSymbols = parseResults.reduce((sum, r) => sum + r.symbols.length, 0);

  graph.addNode(
    createGraphNode('repository', repoId, workspaceName, workspaceName, {
      rootPath: '.',
      detectedLanguages,
      totalFiles: files.length,
      totalSymbols,
    }, generation),
  );

  // Level 2: Projects
  for (const project of projects) {
    const projectId = `project:${project.path}`;
    graph.addNode(
      createGraphNode('project', projectId, project.name, `project:${project.path}`, {
        path: project.path,
        projectType: project.type,
        framework: project.framework,
        frameworkVersion: project.frameworkVersion,
      }, generation),
    );

    graph.addEdge(repoId, projectId, 'contains', 'confirmed', 1.0, [{
      type: 'structural-proximity',
      source: project.path,
      description: `Project detected at ${project.path}`,
      resolution: 'confirmed',
      confidence: 1.0,
    }]);
  }

  // Level 4: Modules
  const modules = detectModules(files);
  for (const [modulePath] of modules) {
    const moduleId = `module:${modulePath}`;
    const moduleName = modulePath.split('/').pop() || modulePath;
    const layer = detectLayer(modulePath);

    graph.addNode(
      createGraphNode('module', moduleId, moduleName, `module:${modulePath}`, {
        path: modulePath,
        layer,
      }, generation),
    );

    const parentProject = projects.find((p) =>
      modulePath.startsWith(p.path) || p.path === '.',
    );
    if (parentProject) {
      const parentId = `project:${parentProject.path}`;
      graph.addEdge(parentId, moduleId, 'contains', 'confirmed', 1.0, [{
        type: 'structural-proximity',
        source: modulePath,
        description: `Module ${moduleName} in project ${parentProject.name}`,
        resolution: 'confirmed',
        confidence: 1.0,
      }]);
    }
  }

  // Level 6: Files
  const parseResultMap = new Map(parseResults.map((r) => [r.filePath, r]));

  for (const file of files) {
    const fileId = `file:${file.path}`;
    const fileName = path.basename(file.path);
    const layer = detectLayer(file.path);

    graph.addNode(
      createGraphNode('file', fileId, fileName, `file:${file.path}`, {
        path: file.path,
        language: file.language,
        size: file.size,
        hash: file.hash,
        lastModified: file.lastModified,
        lastAnalyzed: file.lastAnalyzed,
        symbolCount: file.symbolCount,
        layer,
      }, generation),
    );

    // Link file to module
    const fileDir = path.dirname(file.path);
    for (const [modulePath] of modules) {
      if (fileDir.startsWith(modulePath) || file.path.startsWith(modulePath)) {
        const moduleId = `module:${modulePath}`;
        graph.addEdge(moduleId, fileId, 'contains', 'confirmed', 1.0, [{
          type: 'structural-proximity',
          source: file.path,
          description: `File ${file.path} belongs to module ${modulePath}`,
          resolution: 'confirmed',
          confidence: 1.0,
        }]);
        break;
      }
    }

    const parseResult = parseResultMap.get(file.path);
    if (parseResult) {
      // Symbols & Components
      for (const symbol of parseResult.symbols) {
        const isComponent = ['class', 'interface', 'struct', 'trait', 'impl', 'enum'].includes(symbol.kind);
        const adapter = getLanguageAdapter(file.language);
        const role = adapter?.detectArchitecturalRole(file.path, [symbol]) ?? 'unknown';

        if (isComponent) {
          const componentId = `component:${symbol.qualifiedName}`;
          graph.addNode(
            createGraphNode('component', componentId, symbol.name, symbol.qualifiedName, {
              filePath: file.path,
              location: symbol.location,
              language: file.language,
              symbolKind: symbol.kind,
              architecturalRole: role,
              modifiers: symbol.modifiers,
              decorators: symbol.decorators,
            }, generation),
          );

          graph.addEdge(fileId, componentId, 'contains', 'confirmed', 1.0, [{
            type: 'structural-proximity',
            source: symbol.location,
            description: `Component ${symbol.name} is defined in ${file.path}`,
            resolution: 'confirmed',
            confidence: 1.0,
          }]);
        } else {
          const symbolId = `symbol:${symbol.qualifiedName}`;
          graph.addNode(
            createGraphNode('symbol', symbolId, symbol.name, symbol.qualifiedName, {
              filePath: file.path,
              location: symbol.location,
              language: file.language,
              symbolKind: symbol.kind,
              returnType: symbol.returnType,
              parameters: symbol.parameters?.map((p) => ({ name: p.name, type: p.type })),
              documentation: symbol.documentation,
            }, generation),
          );

          graph.addEdge(fileId, symbolId, 'defined-in', 'confirmed', 1.0, [{
            type: 'structural-proximity',
            source: symbol.location,
            description: `Symbol ${symbol.name} is defined in ${file.path}`,
            resolution: 'confirmed',
            confidence: 1.0,
          }]);
        }
      }

      // API Endpoints
      for (const endpoint of parseResult.apiEndpoints) {
        const endpointId = `api:${endpoint.method}:${endpoint.path}`;
        graph.addNode(
          createGraphNode('api-endpoint', endpointId, `${endpoint.method} ${endpoint.path}`, endpointId, {
            method: endpoint.method,
            path: endpoint.path,
            filePath: endpoint.filePath,
            handlerSymbol: endpoint.handlerName,
          }, generation),
        );

        graph.addEdge(fileId, endpointId, 'contains', 'confirmed', 0.9, [{
          type: 'api-route',
          source: endpoint.location,
          description: `API endpoint ${endpoint.method} ${endpoint.path}`,
          resolution: 'confirmed',
          confidence: 0.9,
        }]);
      }

      // SQL Tables
      for (const table of parseResult.sqlTables || []) {
        const tableId = `table:${table.tableName}`;
        graph.addNode(
          createGraphNode('database-table', tableId, table.tableName, `table:${table.tableName}`, {
            tableName: table.tableName,
            filePath: table.filePath,
            columns: table.columns,
            foreignKeys: table.foreignKeys,
          }, generation),
        );

        graph.addEdge(fileId, tableId, 'contains', 'confirmed', 1.0, [{
          type: 'sql-query',
          source: table.location,
          description: `SQL schema table ${table.tableName}`,
          resolution: 'confirmed',
          confidence: 1.0,
        }]);
      }

      // Docker Services
      for (const dockerSvc of parseResult.dockerServices || []) {
        const dockerId = `docker:${dockerSvc.serviceName}`;
        graph.addNode(
          createGraphNode('docker-service', dockerId, dockerSvc.serviceName, `docker:${dockerSvc.serviceName}`, {
            serviceName: dockerSvc.serviceName,
            filePath: dockerSvc.filePath,
            image: dockerSvc.image,
            ports: dockerSvc.ports,
            environment: dockerSvc.environment,
            dependsOn: dockerSvc.dependsOn,
          }, generation),
        );

        graph.addEdge(fileId, dockerId, 'contains', 'confirmed', 1.0, [{
          type: 'docker-binding',
          source: dockerSvc.location,
          description: `Container infrastructure service ${dockerSvc.serviceName}`,
          resolution: 'confirmed',
          confidence: 1.0,
        }]);
      }

      // Documentation Sections
      for (const doc of parseResult.docSections || []) {
        const docId = `doc:${file.path}#${doc.title.toLowerCase().replace(/\s+/g, '-')}`;
        graph.addNode(
          createGraphNode('documentation', docId, doc.title, docId, {
            title: doc.title,
            filePath: doc.filePath,
            sections: [{ heading: doc.title, level: doc.level }],
          }, generation),
        );

        graph.addEdge(fileId, docId, 'contains', 'confirmed', 0.95, [{
          type: 'markdown-doc',
          source: doc.location,
          description: `Documentation heading "${doc.title}"`,
          resolution: 'confirmed',
          confidence: 0.95,
        }]);
      }
    }
  }

  log.info('Structural hierarchy built', { stats: graph.getStats() });
}
