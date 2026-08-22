import { describe, it, expect } from 'vitest';
import { IntelligenceEngine } from '../../src/intelligence/engine';
import * as path from 'path';

describe('Real Workspace Scan', () => {
  it('should scan StoryForge workspace without hanging or throwing', async () => {
    const root = path.resolve(__dirname, '../../');
    const engine = new IntelligenceEngine({
      workspaceRoot: root,
      workspaceName: 'storyforge',
      excludePatterns: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/.storyforge/**',
      ],
      maxFileSize: 524288,
      autoScan: false,
    });

    console.log('Starting full scan of:', root);
    const start = Date.now();
    await engine.performFullScan();
    const duration = Date.now() - start;
    console.log('Scan finished in', duration, 'ms');

    const status = engine.getStatus();
    console.log('Status:', status.state, 'Files:', status.fileCount, 'Nodes:', status.graphStats.nodeCount, 'Edges:', status.graphStats.edgeCount);

    expect(status.state).toBe('ready');
    expect(status.fileCount).toBeGreaterThan(10);
  }, 30000);
});
