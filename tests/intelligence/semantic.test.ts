/**
 * Semantic Layer Tests (Layer 2)
 *
 * Tests lexical BM25 ranking, dense vector embeddings, cosine similarity,
 * Reciprocal Rank Fusion (RRF), and domain taxonomy synonym expansion.
 */

import { describe, it, expect } from 'vitest';
import {
  SemanticIndexer,
  tokenizeCode,
  computeDenseEmbedding,
  cosineSimilarity,
  DOMAIN_TAXONOMY,
} from '../../src/intelligence/semantic/semanticIndexer.js';
import { createGraphNode } from '../../src/intelligence/graph/graphNode.js';

describe('Semantic Layer (Layer 2)', () => {
  it('should accurately split code tokens across styles', () => {
    expect(tokenizeCode('UserController')).toEqual(['user', 'controller']);
    expect(tokenizeCode('handle_stripe_webhook')).toEqual(['handle', 'stripe', 'webhook']);
    expect(tokenizeCode('parseHTTPResponse')).toEqual(['parse', 'http', 'response']);
    expect(tokenizeCode('auth-guard.service.ts')).toEqual(['auth', 'guard', 'service', 'ts']);
  });

  it('should compute normalized dense vectors and cosine similarity', () => {
    const vec1 = computeDenseEmbedding('UserController authentication login');
    const vec2 = computeDenseEmbedding('UserAuth login handler');
    const vec3 = computeDenseEmbedding('DatabasePostgresMigration table');

    const sim12 = cosineSimilarity(vec1, vec2);
    const sim13 = cosineSimilarity(vec1, vec3);

    expect(sim12).toBeGreaterThan(sim13);
  });

  it('should perform Hybrid BM25 + Dense RRF search with synonym expansion', () => {
    const indexer = new SemanticIndexer();

    const node1 = createGraphNode('component', 'comp:auth', 'AuthService', 'src/auth/AuthService.ts', {
      filePath: 'src/auth/AuthService.ts',
      documentation: 'Handles user login, JWT tokens, and session credentials',
    }, 1);

    const node2 = createGraphNode('component', 'comp:billing', 'PaymentProcessor', 'src/billing/PaymentProcessor.ts', {
      filePath: 'src/billing/PaymentProcessor.ts',
      documentation: 'Processes credit cards, stripe webhooks, and customer refunds',
    }, 1);

    const node3 = createGraphNode('database-table', 'table:orders', 'orders', 'migrations/001_orders.sql', {
      tableName: 'orders',
      columns: [{ name: 'id', type: 'VARCHAR' }, { name: 'user_id', type: 'VARCHAR' }, { name: 'total_amount', type: 'DECIMAL' }],
    }, 1);

    indexer.indexNodes([node1, node2, node3]);

    // Query for "login" should match AuthService via hybrid synonym & dense expansion
    const loginMatches = indexer.search('login');
    expect(loginMatches.length).toBeGreaterThan(0);
    expect(loginMatches[0].node.id).toBe('comp:auth');
    expect(loginMatches[0].rrfScore).toBeGreaterThan(0);

    // Query for "refund" should match PaymentProcessor
    const refundMatches = indexer.search('refund customer charge');
    expect(refundMatches.length).toBeGreaterThan(0);
    expect(refundMatches[0].node.id).toBe('comp:billing');

    // Query for "table" or "schema" should match orders table
    const tableMatches = indexer.search('orders table columns');
    expect(tableMatches.length).toBeGreaterThan(0);
    expect(tableMatches[0].node.id).toBe('table:orders');
  });

  it('should score exact matches higher than partial matches', () => {
    const indexer = new SemanticIndexer();

    const node1 = createGraphNode('component', 'comp:1', 'UserService', 'src/UserService.ts', {}, 1);
    const node2 = createGraphNode('component', 'comp:2', 'UserSettingModalHelper', 'src/UserSettingModalHelper.ts', {}, 1);

    indexer.indexNodes([node1, node2]);

    const results = indexer.search('UserService');
    expect(results[0].node.id).toBe('comp:1');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});
