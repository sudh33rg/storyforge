/**
 * Semantic Layer — Hybrid Lexical (BM25) & Dense Vector Engine (Layer 2)
 *
 * Implements state-of-the-art Hybrid Search matching top industry engines:
 * - Inverted lexical BM25 ranking for keyword precision & domain synonym expansion
 * - In-memory Subword / N-gram Dense Vector embedding & Cosine Similarity for semantic nuance
 * - Reciprocal Rank Fusion (RRF) combining lexical and dense retrieval channels
 * - Microsecond latency, zero external binaries, 100% self-contained in TypeScript/Node
 */

import type { GraphNode, GraphNodeType } from '../graph/graphNode.js';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('intelligence:semantic:hybrid');

// ─── Domain Synonym & Concept Taxonomy ───────────────────────────────────────

export const DOMAIN_TAXONOMY: Record<string, string[]> = {
  auth: ['authentication', 'authorization', 'login', 'logout', 'signin', 'signout', 'session', 'jwt', 'token', 'oauth', 'credential', 'password', 'guard', 'security', 'mfa'],
  user: ['account', 'profile', 'member', 'customer', 'identity', 'principal', 'tenant', 'user'],
  billing: ['payment', 'invoice', 'checkout', 'subscription', 'price', 'plan', 'charge', 'refund', 'transaction', 'stripe', 'billing'],
  database: ['repository', 'dao', 'store', 'entity', 'model', 'schema', 'table', 'migration', 'sql', 'query', 'postgres', 'mysql', 'sqlite', 'mongo', 'orm'],
  api: ['route', 'endpoint', 'controller', 'handler', 'rest', 'graphql', 'grpc', 'http', 'request', 'response', 'payload', 'router'],
  order: ['checkout', 'cart', 'purchase', 'item', 'fulfillment', 'shipment', 'delivery', 'receipt', 'order'],
  schedule: ['cron', 'job', 'timer', 'periodic', 'interval', 'scheduler', 'task', 'queue', 'delayed', 'worker'],
  cache: ['redis', 'memcached', 'memory', 'ttl', 'store', 'invalidation', 'cached', 'caching'],
  audit: ['staleness', 'log', 'trail', 'telemetry', 'trace', 'history', 'event', 'record', 'logging'],
  test: ['spec', 'unit', 'e2e', 'integration', 'scenario', 'mock', 'stub', 'fixture', 'assertion', 'test'],
  config: ['settings', 'env', 'flag', 'featureflag', 'properties', 'options', 'manifest', 'configuration'],
};

// ─── Code Tokenizer ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'and', 'but', 'or', 'not',
  'this', 'that', 'these', 'those', 'it', 'its', 'we', 'they', 'you',
]);

export function tokenizeCode(text: string): string[] {
  if (!text) return [];

  const rawParts = text
    .replace(/[._\-/:\\$#@()[\]{}<>,"'`=;]/g, ' ')
    .split(/\s+/);

  const tokens: string[] = [];

  for (const part of rawParts) {
    if (!part) continue;

    const splitTokens = part
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1 $2')
      .toLowerCase()
      .split(/\s+/);

    for (const t of splitTokens) {
      const clean = t.replace(/[^a-z0-9]/g, '').trim();
      if (clean.length >= 2 && !STOP_WORDS.has(clean)) {
        tokens.push(clean);
      }
    }
  }

  return tokens;
}

// ─── Lightweight In-Memory Dense Vector Embedder ────────────────────────────

const VECTOR_DIM = 256;

/**
 * Fast deterministic hash function to project string tokens into vector coordinates.
 */
function hashString(str: string, seed: number = 0): number {
  let h = seed ^ 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0);
}

/**
 * Compute a normalized Dense Semantic Embedding vector from text.
 * Projects character trigrams & subwords into a normalized vector space.
 */
export function computeDenseEmbedding(text: string): Float32Array {
  const vec = new Float32Array(VECTOR_DIM);
  const tokens = tokenizeCode(text);

  if (tokens.length === 0) return vec;

  for (const token of tokens) {
    // 1. Whole token hash
    const idx1 = hashString(token) % VECTOR_DIM;
    const sign1 = (hashString(token, 1) % 2 === 0) ? 1.0 : -1.0;
    vec[idx1] += sign1 * 1.5;

    // 2. Character trigrams for typo resilience and morphology
    if (token.length >= 3) {
      for (let i = 0; i <= token.length - 3; i++) {
        const trigram = token.slice(i, i + 3);
        const idxT = hashString(trigram, 42) % VECTOR_DIM;
        const signT = (hashString(trigram, 99) % 2 === 0) ? 1.0 : -1.0;
        vec[idxT] += signT * 0.5;
      }
    }
  }

  // L2 normalize
  let sumSq = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    sumSq += vec[i] * vec[i];
  }

  if (sumSq > 0) {
    const norm = Math.sqrt(sumSq);
    for (let i = 0; i < VECTOR_DIM; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Compute cosine similarity between two unit vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, dot);
}

// ─── Scored Match ────────────────────────────────────────────────────────────

export interface ScoredSemanticMatch {
  readonly node: GraphNode;
  readonly score: number;
  readonly bm25Score: number;
  readonly denseScore: number;
  readonly rrfScore: number;
  readonly matchedTerms: string[];
  readonly conceptBoost: number;
}

// ─── Hybrid Semantic Indexer ────────────────────────────────────────────────

export class SemanticIndexer {
  // Lexical channel (BM25)
  private readonly invertedIndex = new Map<string, Set<string>>();
  private readonly docTermFreqs = new Map<string, Map<string, number>>();
  private readonly docLengths = new Map<string, number>();

  // Dense semantic channel (Embeddings)
  private readonly docVectors = new Map<string, Float32Array>();

  // Direct document store
  private readonly documents = new Map<string, GraphNode>();

  private avgDocLength = 0;
  private totalDocCount = 0;

  // BM25 parameters
  private readonly k1 = 1.5;
  private readonly b = 0.75;
  // RRF constant
  private readonly rrfK = 60;

  clear(): void {
    this.invertedIndex.clear();
    this.docTermFreqs.clear();
    this.docLengths.clear();
    this.docVectors.clear();
    this.documents.clear();
    this.avgDocLength = 0;
    this.totalDocCount = 0;
  }

  /**
   * Index a batch of knowledge graph nodes in both Lexical and Dense channels.
   */
  indexNodes(nodes: GraphNode[]): void {
    this.clear();

    let totalLength = 0;

    for (const node of nodes) {
      this.documents.set(node.id, node);

      const textParts: string[] = [
        node.name,
        node.qualifiedName,
        node.description || '',
        node.type,
      ];

      const data = node.data as unknown as Record<string, unknown>;
      if (data) {
        if (typeof data.filePath === 'string') textParts.push(data.filePath);
        if (typeof data.path === 'string') textParts.push(data.path);
        if (typeof data.documentation === 'string') textParts.push(data.documentation);
        if (typeof data.tableName === 'string') textParts.push(data.tableName);
        if (typeof data.serviceName === 'string') textParts.push(data.serviceName);
        if (Array.isArray(data.columns)) {
          textParts.push(data.columns.map((c: any) => c.name).join(' '));
        }
      }

      const fullText = textParts.join(' ');
      const tokens = tokenizeCode(fullText);
      this.docLengths.set(node.id, tokens.length);
      totalLength += tokens.length;

      // 1. Build Lexical Inverted Index
      const termFreq = new Map<string, number>();
      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);

        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token)!.add(node.id);
      }
      this.docTermFreqs.set(node.id, termFreq);

      // 2. Build Dense Embedding Vector
      const denseVec = computeDenseEmbedding(fullText);
      this.docVectors.set(node.id, denseVec);
    }

    this.totalDocCount = nodes.length;
    this.avgDocLength = this.totalDocCount > 0 ? totalLength / this.totalDocCount : 1;

    log.info('Hybrid semantic index built', {
      documents: this.totalDocCount,
      uniqueTerms: this.invertedIndex.size,
      denseVectors: this.docVectors.size,
      avgDocLength: Math.round(this.avgDocLength),
    });
  }

  /**
   * Search for nodes matching query using Hybrid Search (BM25 + Dense + RRF).
   */
  search(
    query: string,
    options: {
      limit?: number;
      nodeTypes?: GraphNodeType[];
      minScore?: number;
      denseWeight?: number;
      bm25Weight?: number;
    } = {},
  ): ScoredSemanticMatch[] {
    const limit = options.limit ?? 20;
    const minScore = options.minScore ?? 0.05;
    const nodeTypes = options.nodeTypes;
    const denseWeight = options.denseWeight ?? 0.4;
    const bm25Weight = options.bm25Weight ?? 0.6;

    const rawTokens = tokenizeCode(query);
    if (rawTokens.length === 0) return [];

    // Query synonym expansion
    const queryTerms = new Set<string>(rawTokens);
    for (const token of rawTokens) {
      for (const [concept, synonyms] of Object.entries(DOMAIN_TAXONOMY)) {
        if (token === concept || synonyms.includes(token)) {
          queryTerms.add(concept);
          for (const syn of synonyms.slice(0, 4)) {
            queryTerms.add(syn);
          }
        }
      }
    }

    // ── Channel 1: BM25 Lexical Retrieval ──
    const candidateDocIds = new Set<string>();
    for (const term of queryTerms) {
      const docIds = this.invertedIndex.get(term);
      if (docIds) {
        for (const id of docIds) {
          candidateDocIds.add(id);
        }
      }
    }

    const bm25Scores = new Map<string, { score: number; terms: string[] }>();

    for (const docId of candidateDocIds) {
      const docLength = this.docLengths.get(docId) || 1;
      const termFreqs = this.docTermFreqs.get(docId);
      if (!termFreqs) continue;

      let score = 0;
      const matchedTerms: string[] = [];

      for (const term of queryTerms) {
        const tf = termFreqs.get(term) || 0;
        if (tf > 0) {
          matchedTerms.push(term);
          const df = this.invertedIndex.get(term)?.size || 1;
          const idf = Math.log(1 + (this.totalDocCount - df + 0.5) / (df + 0.5));
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
          score += idf * (numerator / denominator);
        }
      }

      if (score > 0) {
        bm25Scores.set(docId, { score, terms: matchedTerms });
      }
    }

    // Rank BM25 results
    const rankedBM25 = Array.from(bm25Scores.entries())
      .sort((a, b) => b[1].score - a[1].score);

    const bm25Ranks = new Map<string, number>();
    for (let i = 0; i < rankedBM25.length; i++) {
      bm25Ranks.set(rankedBM25[i][0], i + 1);
    }

    // ── Channel 2: Dense Embedding Vector Cosine Retrieval ──
    const queryVector = computeDenseEmbedding(query);
    const denseScores = new Map<string, number>();

    // Calculate dense cosine similarity over candidate docs (or all docs if small)
    const targetDocIds = this.totalDocCount < 500 ? Array.from(this.documents.keys()) : Array.from(candidateDocIds);

    for (const docId of targetDocIds) {
      const docVec = this.docVectors.get(docId);
      if (docVec) {
        const sim = cosineSimilarity(queryVector, docVec);
        if (sim > 0.05) {
          denseScores.set(docId, sim);
        }
      }
    }

    // Rank Dense results
    const rankedDense = Array.from(denseScores.entries())
      .sort((a, b) => b[1] - a[1]);

    const denseRanks = new Map<string, number>();
    for (let i = 0; i < rankedDense.length; i++) {
      denseRanks.set(rankedDense[i][0], i + 1);
    }

    // ── Reciprocal Rank Fusion (RRF) & Boost Fusion ──
    const allCandidateIds = new Set<string>([...bm25Scores.keys(), ...denseScores.keys()]);
    const scoredMatches: ScoredSemanticMatch[] = [];

    for (const docId of allCandidateIds) {
      const node = this.documents.get(docId);
      if (!node) continue;
      if (nodeTypes && !nodeTypes.includes(node.type)) continue;

      const bm25Rank = bm25Ranks.get(docId) ?? 1000;
      const denseRank = denseRanks.get(docId) ?? 1000;

      const rrfBM25 = bm25Weight / (this.rrfK + bm25Rank);
      const rrfDense = denseWeight / (this.rrfK + denseRank);
      const rawRRF = rrfBM25 + rrfDense;

      // Exact name bonus & architectural boost
      let conceptBoost = 1.0;
      const lowerName = node.name.toLowerCase();
      const lowerQuery = query.toLowerCase();

      if (lowerName === lowerQuery) conceptBoost += 2.5;
      else if (lowerName.includes(lowerQuery) || lowerQuery.includes(lowerName)) conceptBoost += 1.2;

      if (['component', 'api-endpoint', 'service', 'database-table'].includes(node.type)) {
        conceptBoost += 0.3;
      }

      const finalScore = rawRRF * conceptBoost * 100;

      if (finalScore >= minScore) {
        scoredMatches.push({
          node,
          score: finalScore,
          bm25Score: bm25Scores.get(docId)?.score ?? 0,
          denseScore: denseScores.get(docId) ?? 0,
          rrfScore: rawRRF,
          matchedTerms: bm25Scores.get(docId)?.terms ?? [],
          conceptBoost,
        });
      }
    }

    return scoredMatches.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
