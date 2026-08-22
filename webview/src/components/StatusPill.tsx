import React from 'react';
import type { IntelligenceStatus } from '../../../src/shared/protocol';

export function StatusPill({ status }: { status: IntelligenceStatus }): React.JSX.Element {
  const label = status.state === 'indexing'
    ? `Refreshing${status.progress?.phase ? ` (${status.progress.phase})` : ''}`
    : status.state === 'cancelling'
      ? 'Cancelling'
      : status.state === 'stale'
        ? `Stale (${status.stalePaths} changed)`
        : status.state === 'degraded'
          ? 'Degraded'
          : status.state === 'partial'
            ? 'Partial'
            : status.state === 'fresh'
              ? 'Fresh'
              : status.state === 'failed'
                ? 'Failed'
                : status.state === 'cancelled'
                  ? 'Cancelled'
                  : 'Unavailable';

  const badgeClass = status.state === 'indexing' || status.state === 'cancelling'
    ? 'status-pill indexing'
    : status.state === 'stale'
      ? 'status-pill stale'
      : status.state === 'degraded' || status.state === 'failed'
        ? 'status-pill degraded'
        : status.state === 'partial'
          ? 'status-pill partial'
          : status.state === 'fresh'
            ? 'status-pill fresh'
            : 'status-pill';

  return <div className={badgeClass}>
    <span className="dot" />
    <span>{label}</span>
  </div>;
}
