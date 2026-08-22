/**
 * Architecture Analyzer
 *
 * Detects architectural patterns, framework usage, and high-level
 * structural patterns in the repository.
 */

import { createLogger } from '../../shared/logger.js';
import type { ArchitecturalPattern } from '../../shared/types.js';
import type { KnowledgeGraph } from '../graph/knowledgeGraph.js';
import type { FileParseResult } from '../parser/treeSitterParser.js';
import type { ProjectDescriptor } from './structureAnalyzer.js';

const log = createLogger('intelligence:analyzer:architecture');

export interface ArchitectureReport {
  readonly patterns: ArchitecturalPattern[];
  readonly frameworks: FrameworkInfo[];
  readonly languages: LanguageDistribution[];
  readonly layerDistribution: Record<string, number>;
  readonly testCoverage: TestCoverageInfo;
  readonly summary: string;
}

export interface FrameworkInfo {
  readonly name: string;
  readonly version?: string;
  readonly category: 'frontend' | 'backend' | 'fullstack' | 'testing' | 'build' | 'other';
}

export interface LanguageDistribution {
  readonly language: string;
  readonly fileCount: number;
  readonly symbolCount: number;
  readonly percentage: number;
}

export interface TestCoverageInfo {
  readonly testFileCount: number;
  readonly totalFileCount: number;
  readonly testPercentage: number;
  readonly testFrameworks: string[];
}

/**
 * Analyze the architecture of the repository.
 */
export function analyzeArchitecture(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
  projects: ProjectDescriptor[],
): ArchitectureReport {
  log.info('Analyzing architecture');

  const patterns = detectPatterns(graph, parseResults);
  const frameworks = detectFrameworks(projects, parseResults);
  const languages = computeLanguageDistribution(parseResults);
  const layerDistribution = computeLayerDistribution(graph);
  const testCoverage = computeTestCoverage(parseResults);

  const summary = generateSummary(patterns, frameworks, languages, testCoverage);

  log.info('Architecture analysis complete', {
    patterns,
    frameworkCount: frameworks.length,
    languageCount: languages.length,
  });

  return {
    patterns,
    frameworks,
    languages,
    layerDistribution,
    testCoverage,
    summary,
  };
}

function detectPatterns(
  graph: KnowledgeGraph,
  parseResults: FileParseResult[],
): ArchitecturalPattern[] {
  const patterns: ArchitecturalPattern[] = [];

  // Check for MVC pattern
  const hasControllers = parseResults.some((r) =>
    r.filePath.toLowerCase().includes('controller'),
  );
  const hasModels = parseResults.some((r) =>
    r.filePath.toLowerCase().includes('model'),
  );
  const hasViews = parseResults.some((r) =>
    r.filePath.toLowerCase().includes('view') ||
    r.filePath.endsWith('.tsx') ||
    r.filePath.endsWith('.jsx'),
  );

  if (hasControllers && hasModels && hasViews) {
    patterns.push('mvc');
  }

  // Check for layered architecture
  const hasServices = parseResults.some((r) =>
    r.filePath.toLowerCase().includes('service'),
  );
  const hasRepositories = parseResults.some((r) =>
    r.filePath.toLowerCase().includes('repository') ||
    r.filePath.toLowerCase().includes('dao'),
  );

  if (hasControllers && hasServices && hasRepositories) {
    patterns.push('layered');
  }

  // Check for microservices
  const projectCount = graph.getNodesByType('project').length;
  const serviceCount = graph.getNodesByType('service').length;
  if (projectCount > 3 || serviceCount > 2) {
    patterns.push('microservices');
  }

  // Check for event-driven
  const hasQueues = parseResults.some((r) =>
    r.symbols.some((s) =>
      s.name.toLowerCase().includes('queue') ||
      s.name.toLowerCase().includes('event') ||
      s.name.toLowerCase().includes('subscriber') ||
      s.name.toLowerCase().includes('publisher'),
    ),
  );
  if (hasQueues) {
    patterns.push('event-driven');
  }

  if (patterns.length === 0) {
    patterns.push('unknown');
  }

  return patterns;
}

function detectFrameworks(
  projects: ProjectDescriptor[],
  parseResults: FileParseResult[],
): FrameworkInfo[] {
  const frameworks: FrameworkInfo[] = [];
  const seen = new Set<string>();

  for (const project of projects) {
    if (project.framework && !seen.has(project.framework)) {
      seen.add(project.framework);
      frameworks.push({
        name: project.framework,
        version: project.frameworkVersion,
        category: categorizeFramework(project.framework),
      });
    }
  }

  // Detect test frameworks from imports
  const testFrameworkPatterns: Array<{ pattern: string; name: string }> = [
    { pattern: 'jest', name: 'Jest' },
    { pattern: 'vitest', name: 'Vitest' },
    { pattern: 'mocha', name: 'Mocha' },
    { pattern: 'pytest', name: 'pytest' },
    { pattern: 'junit', name: 'JUnit' },
    { pattern: 'xunit', name: 'xUnit' },
    { pattern: 'nunit', name: 'NUnit' },
    { pattern: 'testing', name: 'Go testing' },
  ];

  for (const result of parseResults) {
    for (const imp of result.imports) {
      for (const tf of testFrameworkPatterns) {
        if (imp.source.includes(tf.pattern) && !seen.has(tf.name)) {
          seen.add(tf.name);
          frameworks.push({
            name: tf.name,
            category: 'testing',
          });
        }
      }
    }
  }

  return frameworks;
}

function categorizeFramework(name: string): FrameworkInfo['category'] {
  const frontendFrameworks = ['React', 'Angular', 'Vue', 'Nuxt', 'Next.js', 'Svelte'];
  const backendFrameworks = ['Express', 'NestJS', 'Fastify', 'Spring', 'ASP.NET', 'Django', 'Flask', 'Gin'];

  if (frontendFrameworks.includes(name)) return 'frontend';
  if (backendFrameworks.includes(name)) return 'backend';
  return 'other';
}

function computeLanguageDistribution(parseResults: FileParseResult[]): LanguageDistribution[] {
  const langStats = new Map<string, { fileCount: number; symbolCount: number }>();

  for (const result of parseResults) {
    const existing = langStats.get(result.language) || { fileCount: 0, symbolCount: 0 };
    existing.fileCount++;
    existing.symbolCount += result.symbols.length;
    langStats.set(result.language, existing);
  }

  const totalFiles = parseResults.length;

  return Array.from(langStats.entries()).map(([language, stats]) => ({
    language,
    fileCount: stats.fileCount,
    symbolCount: stats.symbolCount,
    percentage: totalFiles > 0 ? Math.round((stats.fileCount / totalFiles) * 100) : 0,
  })).sort((a, b) => b.fileCount - a.fileCount);
}

function computeLayerDistribution(graph: KnowledgeGraph): Record<string, number> {
  const dist: Record<string, number> = {};
  const files = graph.getNodesByType('file');

  for (const file of files) {
    const layer = (file.data as { layer?: string }).layer || 'unknown';
    dist[layer] = (dist[layer] || 0) + 1;
  }

  return dist;
}

function computeTestCoverage(parseResults: FileParseResult[]): TestCoverageInfo {
  const testFiles = parseResults.filter((r) => {
    const lower = r.filePath.toLowerCase();
    return lower.includes('.test.') || lower.includes('.spec.') || lower.includes('_test.') || lower.includes('/test/');
  });

  const testFrameworks = new Set<string>();
  for (const tf of testFiles) {
    for (const imp of tf.imports) {
      if (imp.source.includes('jest')) testFrameworks.add('Jest');
      if (imp.source.includes('vitest')) testFrameworks.add('Vitest');
      if (imp.source.includes('mocha')) testFrameworks.add('Mocha');
      if (imp.source.includes('pytest')) testFrameworks.add('pytest');
      if (imp.source.includes('junit')) testFrameworks.add('JUnit');
    }
  }

  return {
    testFileCount: testFiles.length,
    totalFileCount: parseResults.length,
    testPercentage: parseResults.length > 0
      ? Math.round((testFiles.length / parseResults.length) * 100)
      : 0,
    testFrameworks: Array.from(testFrameworks),
  };
}

function generateSummary(
  patterns: ArchitecturalPattern[],
  frameworks: FrameworkInfo[],
  languages: LanguageDistribution[],
  testCoverage: TestCoverageInfo,
): string {
  const parts: string[] = [];

  if (languages.length > 0) {
    const primary = languages[0];
    parts.push(`Primary language: ${primary.language} (${primary.percentage}% of files)`);
  }

  if (patterns.length > 0 && patterns[0] !== 'unknown') {
    parts.push(`Architecture: ${patterns.join(', ')}`);
  }

  if (frameworks.length > 0) {
    parts.push(`Frameworks: ${frameworks.map((f) => f.name).join(', ')}`);
  }

  parts.push(`Test coverage: ${testCoverage.testPercentage}% (${testCoverage.testFileCount} test files)`);

  return parts.join('. ') + '.';
}
