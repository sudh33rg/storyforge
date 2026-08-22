import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { IntelligenceStatus, AppSnapshot, ExtensionEvent, ViewName } from '../../src/shared/protocol';
import { vscode } from './vscode';
import { StatusPill } from './components/StatusPill';
import { IntelligenceView } from './components/IntelligenceView';
import { WorkbenchView } from './components/WorkbenchView';
import { CopilotView } from './components/CopilotView';
import { PromptEnricherView } from './components/PromptEnricherView';
import './style.css';
import '@xyflow/react/dist/style.css';

const emptyStatus: IntelligenceStatus = {
  state: 'unavailable',
  workspaceName: 'Workspace',
  generationId: null,
  completedAt: null,
  lastRefresh: null,
  stalePaths: 0,
  stalePathList: [],
  metrics: null,
  coverage: null,
  progress: null,
  error: null,
};

const initialSnapshot: AppSnapshot = {
  activeView: 'intelligence',
  intelligence: emptyStatus,
  discovery: null,
  featureHistory: [],
  storyGeneration: null,
};

declare global {
  interface Window {
    __STORYFORGE_INITIAL_SNAPSHOT__?: AppSnapshot;
  }
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(
    () => window.__STORYFORGE_INITIAL_SNAPSHOT__ ?? initialSnapshot,
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: MessageEvent<ExtensionEvent>): void => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'app/snapshot') setSnapshot(event.data.snapshot);
      if (event.data.type === 'app/error' || event.data.type === 'app/notice') setMessage(event.data.message);
    };
    window.addEventListener('message', listener);

    // The extension can begin scanning before the webview renderer has
    // finished attaching its message listener. Re-request the snapshot a few
    // times during startup so the default "Create Intelligence" screen cannot
    // mask an already-running scan.
    vscode.postMessage({ type: 'app/ready' });
    const readyRetries = [50, 200, 500].map((delay) => window.setTimeout(() => {
      vscode.postMessage({ type: 'app/ready' });
    }, delay));

    return () => {
      window.removeEventListener('message', listener);
      readyRetries.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const navigate = (view: ViewName): void => vscode.postMessage({ type: 'navigation/open', view });
  const workbenchActive = snapshot.activeView === 'workbench' || snapshot.activeView === 'feature'
    || snapshot.activeView === 'discovery' || snapshot.activeView === 'stories';

  return <div className="app-shell">
    <header className="topbar">
      <div>
        <span className="eyebrow">Intelligence-first engineering</span>
        <h1>StoryForge</h1>
      </div>
      <StatusPill status={snapshot.intelligence} />
    </header>

    <nav aria-label="StoryForge workflow">
      {(['intelligence', 'copilot', 'enricher', 'workbench'] as const).map((view) =>
        <button
          key={view}
          className={(view === 'workbench' ? workbenchActive : snapshot.activeView === view) ? 'nav-item active' : 'nav-item'}
          onClick={() => navigate(view)}
        >
          {view === 'workbench' ? 'Feature workspace' : view[0]!.toUpperCase() + view.slice(1)}
        </button>,
      )}
    </nav>

    {message && <div className="notice" role="status">
      <span>{message}</span>
      <button aria-label="Dismiss" onClick={() => setMessage(null)}>×</button>
    </div>}

    <main>
      {snapshot.activeView === 'intelligence' && <IntelligenceView status={snapshot.intelligence} />}

      {snapshot.activeView === 'copilot' && <CopilotView />}

      {snapshot.activeView === 'enricher' && <PromptEnricherView />}

      {workbenchActive && <WorkbenchView snapshot={snapshot} loading={false} />}
    </main>
  </div>;
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);
}
