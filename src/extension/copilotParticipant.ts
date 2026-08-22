/**
 * StoryForge Copilot Chat Participant
 *
 * Registers @storyforge in the Copilot Chat panel with slash commands:
 *   /discover     — Start feature discovery & build repository understanding
 *   /stories      — Generate user stories (with Gherkin ACs) & QA stories
 *   /audit        — Audit active stories for generational staleness
 *   /intelligence — Query the repository knowledge graph
 *   /impact       — Analyze the impact of a proposed change
 *   /status       — Show intelligence engine status
 */

import * as vscode from 'vscode';
import type { IntelligenceEngine } from '../intelligence/engine.js';
import type { WorkflowEngine } from '../core/workflow/workflowEngine.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('extension:copilot');

export function registerCopilotParticipant(
  context: vscode.ExtensionContext,
  engine: IntelligenceEngine,
  workflowEngine: WorkflowEngine,
): void {
  const participant = vscode.chat.createChatParticipant(
    'storyforge.participant',
    async (
      request: vscode.ChatRequest,
      chatContext: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken,
    ) => {
      const command = request.command;

      try {
        switch (command) {
          case 'status':
            await handleStatus(engine, stream);
            break;
          case 'intelligence':
            await handleIntelligence(engine, request, stream);
            break;
          case 'impact':
            await handleImpact(engine, request, stream);
            break;
          case 'discover':
            await handleDiscover(engine, workflowEngine, request, stream, token);
            break;
          case 'stories':
            await handleStories(workflowEngine, request, stream, token);
            break;
          case 'audit':
            await handleAudit(workflowEngine, stream);
            break;
          default:
            await handleDefault(engine, request, stream, token);
            break;
        }
      } catch (err) {
        log.error('Chat participant error', err);
        stream.markdown(`**Error:** ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  participant.iconPath = new vscode.ThemeIcon('beaker');

  context.subscriptions.push(participant);
  log.info('Copilot Chat participant registered: @storyforge');
}

// ─── Command Handlers ────────────────────────────────────────────────────────

async function handleStatus(
  engine: IntelligenceEngine,
  stream: vscode.ChatResponseStream,
): Promise<void> {
  const status = engine.getStatus();

  stream.markdown('## 🧪 StoryForge Intelligence Status\n\n');
  stream.markdown(`| Property | Value |\n`);
  stream.markdown(`| --- | --- |\n`);
  stream.markdown(`| **State** | ${status.state} |\n`);
  stream.markdown(`| **Generation** | ${status.generation} |\n`);
  stream.markdown(`| **Nodes** | ${status.graphStats.nodeCount} |\n`);
  stream.markdown(`| **Edges** | ${status.graphStats.edgeCount} |\n`);
  stream.markdown(`| **Files Indexed** | ${status.fileCount} |\n`);

  if (status.lastScanDuration) {
    stream.markdown(`| **Last Scan** | ${(status.lastScanDuration / 1000).toFixed(1)}s |\n`);
  }

  // Node breakdown
  if (Object.keys(status.graphStats.nodesByType).length > 0) {
    stream.markdown('\n### Node Breakdown\n\n');
    for (const [type, count] of Object.entries(status.graphStats.nodesByType)) {
      stream.markdown(`- **${type}**: ${count}\n`);
    }
  }

  // Architecture report
  if (status.architectureReport) {
    const arch = status.architectureReport;
    stream.markdown('\n### Architecture\n\n');
    stream.markdown(`${arch.summary}\n`);

    if (arch.languages.length > 0) {
      stream.markdown('\n**Languages:**\n');
      for (const lang of arch.languages) {
        stream.markdown(`- ${lang.language}: ${lang.fileCount} files (${lang.percentage}%)\n`);
      }
    }
  }
}

async function handleIntelligence(
  engine: IntelligenceEngine,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
): Promise<void> {
  const query = request.prompt.trim();

  if (!query) {
    stream.markdown('Please provide a search query. Example: `@storyforge /intelligence authentication`');
    return;
  }

  stream.markdown(`## 🔍 Intelligence Query: "${query}"\n\n`);

  const results = engine.searchGraph(query);

  if (results.nodes.length === 0) {
    stream.markdown('No matching nodes found in the knowledge graph.\n\n');
    stream.markdown('*Note: If intelligence has not been built yet, use `@storyforge /status` to check.*');
    return;
  }

  stream.markdown(`Found **${results.nodes.length}** matching node(s):\n\n`);

  const grouped = new Map<string, typeof results.nodes>();
  for (const node of results.nodes.slice(0, 20)) {
    const type = node.type;
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(node);
  }

  for (const [type, nodes] of grouped) {
    stream.markdown(`### ${type} (${nodes.length})\n\n`);
    for (const node of nodes.slice(0, 5)) {
      const data = node.data as { filePath?: string; path?: string };
      const filePath = data.filePath || data.path || '';
      stream.markdown(`- **${node.name}** — \`${node.qualifiedName}\`${filePath ? ` (${filePath})` : ''}\n`);
    }
    stream.markdown('\n');
  }

  if (results.nodes.length > 20) {
    stream.markdown(`*...and ${results.nodes.length - 20} more results.*\n`);
  }
}

async function handleImpact(
  engine: IntelligenceEngine,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
): Promise<void> {
  const query = request.prompt.trim();

  if (!query) {
    stream.markdown('Please specify what to analyze. Example: `@storyforge /impact UserController`');
    return;
  }

  stream.markdown(`## 💥 Impact Analysis: "${query}"\n\n`);

  const results = engine.searchGraph(query);
  if (results.nodes.length === 0) {
    stream.markdown(`No matching component found for "${query}".`);
    return;
  }

  const targetNode = results.nodes[0];
  stream.markdown(`Analyzing impact of changes to **${targetNode.name}** (${targetNode.type})...\n\n`);

  const graph = engine.getGraph();
  const deps = graph.getDependencies(targetNode.id);
  const dependents = graph.getDependents(targetNode.id);
  const callers = graph.getCallers(targetNode.id);
  const callees = graph.getCallees(targetNode.id);

  if (dependents.length > 0) {
    stream.markdown(`### ⬆️ What depends on this (${dependents.length})\n\n`);
    for (const d of dependents.slice(0, 10)) {
      stream.markdown(`- **${d.name}** (${d.type})\n`);
    }
    stream.markdown('\n');
  }

  if (deps.length > 0) {
    stream.markdown(`### ⬇️ What this depends on (${deps.length})\n\n`);
    for (const d of deps.slice(0, 10)) {
      stream.markdown(`- **${d.name}** (${d.type})\n`);
    }
    stream.markdown('\n');
  }

  if (callers.length > 0) {
    stream.markdown(`### 📞 Callers (${callers.length})\n\n`);
    for (const c of callers.slice(0, 10)) {
      stream.markdown(`- **${c.name}** (${c.type})\n`);
    }
    stream.markdown('\n');
  }

  if (callees.length > 0) {
    stream.markdown(`### 📤 Callees (${callees.length})\n\n`);
    for (const c of callees.slice(0, 10)) {
      stream.markdown(`- **${c.name}** (${c.type})\n`);
    }
  }

  const totalImpact = dependents.length + callers.length;
  if (totalImpact === 0) {
    stream.markdown('No dependencies or dependents found for this node.\n');
  }
}

async function handleDiscover(
  engine: IntelligenceEngine,
  workflowEngine: WorkflowEngine,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const featureRequest = request.prompt.trim();

  if (!featureRequest) {
    stream.markdown('Please describe the feature you want to discover. Example:\n\n');
    stream.markdown('`@storyforge /discover Add load test scheduling to LoadRunner Cloud`');
    return;
  }

  const keywords = extractKeywords(featureRequest);

  stream.markdown(`## 🔬 Feature Discovery: "${featureRequest}"\n\n`);
  stream.markdown(`**Keywords extracted:** ${keywords.join(', ')}\n\n`);

  // Start workflow session
  const workflow = await workflowEngine.startDiscovery(
    featureRequest,
    featureRequest,
    keywords,
    'chat',
  );

  const discovery = workflow.discoveryContext!;
  const repo = discovery.repositoryUnderstanding;

  // 1. Affected Areas
  stream.markdown('### 🏛️ Affected Repository Areas\n\n');
  if (discovery.affectedAreas.length > 0) {
    for (const area of discovery.affectedAreas) {
      stream.markdown(`**${area.name}** (${area.impactLevel}):\n`);
      for (const comp of area.components.slice(0, 8)) {
        stream.markdown(`- \`${comp.filePath}\` — **${comp.name}** (${comp.role})\n`);
      }
      stream.markdown('\n');
    }
  } else {
    stream.markdown('*No existing components identified for this capability.*');
  }

  // 2. 11-Stage Capability Reasoning Flow
  const capabilityChain = engine.buildCapabilityChain(featureRequest, keywords);
  stream.markdown('### ⛓️ 11-Stage Capability Reasoning Flow\n\n');
  stream.markdown('| Stage | Layer | Identified Component / Evidence | Conf |\n');
  stream.markdown('| :--- | :--- | :--- | :---: |\n');
  for (const s of capabilityChain.stages) {
    const target = s.filePath ? `\`${s.filePath}\`` : s.entityName ? `**${s.entityName}**` : s.description;
    stream.markdown(`| ${s.stageNumber} | ${s.label} | ${target} | ${(s.confidence * 100).toFixed(0)}% |\n`);
  }
  stream.markdown('\n');

  // 3. API Endpoints & Tests
  if (repo.apis.existingEndpoints.length > 0) {
    stream.markdown('### 🌐 Related API Endpoints\n\n');
    for (const api of repo.apis.existingEndpoints.slice(0, 5)) {
      stream.markdown(`- \`${api.method} ${api.path}\` (handler in \`${api.handlerFile}\`)\n`);
    }
    stream.markdown('\n');
  }

  if (repo.tests.existingCoverage.length > 0) {
    stream.markdown('### 🧪 Related Test Suites\n\n');
    for (const test of repo.tests.existingCoverage.slice(0, 5)) {
      stream.markdown(`- \`${test.filePath}\` (${test.testCount ?? 0} tests)\n`);
    }
    stream.markdown('\n');
  }

  // 4. Gaps & Open Questions
  if (repo.components.potentialGaps.length > 0) {
    stream.markdown('### ⚠️ Identified Capability Gaps\n\n');
    for (const gap of repo.components.potentialGaps) {
      stream.markdown(`- ${gap.description} *(confidence: ${(gap.confidence * 100).toFixed(0)}%)*\n`);
    }
    stream.markdown('\n');
  }

  if (repo.unresolvedQuestions.length > 0) {
    stream.markdown('### ❓ Questions for Clarification\n\n');
    for (const q of repo.unresolvedQuestions) {
      stream.markdown(`- **${q.question}**\n  *${q.context}*\n\n`);
    }
  }

  // Next steps call to action
  stream.markdown(`---\n`);
  stream.markdown(`*Session \`${workflow.id}\` initialized at Gen ${repo.generation} (Overall Confidence: ${(repo.confidence.overall * 100).toFixed(0)}%).*\n\n`);
  stream.markdown(`👉 To approve this discovery and generate engineering stories, run: \`@storyforge /stories\``);
}

async function handleStories(
  workflowEngine: WorkflowEngine,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const activeWf = workflowEngine.getActiveWorkflow();

  if (!activeWf || !activeWf.discoveryContext) {
    stream.markdown('## 📝 Story Generation\n\n');
    stream.markdown('No active discovery session found. Please run `@storyforge /discover <feature>` first.');
    return;
  }

  stream.markdown(`## 📝 Generating Stories for: "${activeWf.featureInput?.title || activeWf.id}"\n\n`);
  stream.markdown('Grounding stories in repository knowledge graph and synthesizing Acceptance Criteria...\n\n');

  // Auto-approve discovery if in review
  if (activeWf.discoveryContext.approvalStatus !== 'approved') {
    await workflowEngine.approveDiscovery(activeWf.id);
  }

  // Generate stories
  const { stories, qaStories } = await workflowEngine.generateStories(activeWf.id);

  stream.markdown(`### 📋 Generated User Stories (${stories.length})\n\n`);
  for (const story of stories) {
    stream.markdown(`#### [${story.id}] ${story.title} (${story.storyPoints ?? 3} Story Points)\n\n`);
    stream.markdown(`- **As a:** ${story.asA}\n`);
    stream.markdown(`- **I want:** ${story.iWant}\n`);
    stream.markdown(`- **So that:** ${story.soThat}\n\n`);

    stream.markdown(`**Acceptance Criteria (Gherkin):**\n`);
    for (const ac of story.acceptanceCriteria) {
      stream.markdown(`- **${ac.id}:** Given ${ac.given}, When ${ac.when}, Then ${ac.then}\n`);
    }
    stream.markdown('\n');

    if (story.affectedComponents.length > 0) {
      stream.markdown(`**Affected Components:**\n`);
      for (const comp of story.affectedComponents) {
        stream.markdown(`- \`${comp}\`\n`);
      }
      stream.markdown('\n');
    }
  }

  stream.markdown(`### 🧪 Generated QA Stories & Scenarios (${qaStories.length})\n\n`);
  for (const qa of qaStories) {
    stream.markdown(`#### [${qa.id}] ${qa.title}\n`);
    stream.markdown(`*Related User Story: ${qa.relatedUserStoryId} | Type: ${qa.testType}*\n\n`);

    for (const sc of qa.scenarios) {
      stream.markdown(`- **${sc.id} (${sc.testType}):** ${sc.name}\n`);
      for (const st of sc.steps) {
        stream.markdown(`  1. ${st}\n`);
      }
      stream.markdown(`  *Expected:* ${sc.expectedResult}\n`);
    }
    stream.markdown('\n');
  }

  stream.markdown(`---\n*Stories populated in the StoryForge sidebar tree. All items linked to Generation ${activeWf.featureContext?.generation}.*`);
}

async function handleAudit(
  workflowEngine: WorkflowEngine,
  stream: vscode.ChatResponseStream,
): Promise<void> {
  stream.markdown('## 🔍 Generational Staleness Audit\n\n');

  const report = workflowEngine.auditWorkflows([]);

  stream.markdown(`${report.summary}\n\n`);

  if (report.staleItems.length > 0) {
    stream.markdown('### ⚠️ Stale Artifacts Flagged\n\n');
    for (const item of report.staleItems) {
      stream.markdown(`- **[${item.storyId}] ${item.title}** (${item.type})\n`);
      stream.markdown(`  - *Reason:* ${item.reason}\n`);
      stream.markdown(`  - *Action:* ${item.suggestedAction}\n\n`);
    }
  }
}

async function handleDefault(
  engine: IntelligenceEngine,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const prompt = request.prompt.trim();

  if (!prompt) {
    stream.markdown('## 🧪 StoryForge\n\n');
    stream.markdown('**Intelligence-first engineering system**\n\n');
    stream.markdown('Available commands:\n\n');
    stream.markdown('- `/status` — Show intelligence engine status\n');
    stream.markdown('- `/discover <feature>` — Start feature discovery & capability tracing\n');
    stream.markdown('- `/stories` — Generate user stories & QA stories from approved discovery\n');
    stream.markdown('- `/audit` — Audit active stories for generational code staleness\n');
    stream.markdown('- `/intelligence <query>` — Search the knowledge graph\n');
    stream.markdown('- `/impact <component>` — Analyze change impact blast radius\n');
    return;
  }

  // Default: treat as an intelligence query
  await handleIntelligence(engine, request, stream);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
    'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
    'some', 'such', 'than', 'too', 'very', 'just', 'also', 'add',
    'new', 'feature', 'request', 'want', 'need', 'like', 'please',
    'i', 'we', 'you', 'it', 'this', 'that', 'these', 'those',
  ]);

  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase())
    .filter((word) => word.length > 2 && !stopWords.has(word));
}
