import React, { useState } from 'react';
import type { SqlTableDto, DockerServiceDto } from '../../../src/shared/protocol';
import { vscode } from '../vscode';

export function SchemaAndInfraView({
  sqlTables = [],
  dockerServices = [],
}: {
  sqlTables?: SqlTableDto[];
  dockerServices?: DockerServiceDto[];
}): React.JSX.Element {
  const [subTab, setSubTab] = useState<'sql' | 'docker'>('sql');

  return (
    <div className="schema-infra-card">
      <div className="schema-header">
        <div>
          <span className="eyebrow">Multi-Modal Infrastructure & Relational Schemas</span>
          <h3>Database Schema & Container Topology</h3>
          <p>Direct inspection of SQL DDL tables, foreign key relationships, and Docker service dependencies.</p>
        </div>
        <div className="subtab-toggle">
          <button className={`toggle-btn ${subTab === 'sql' ? 'active' : ''}`} onClick={() => setSubTab('sql')}>
            🗄️ SQL Tables ({sqlTables.length})
          </button>
          <button className={`toggle-btn ${subTab === 'docker' ? 'active' : ''}`} onClick={() => setSubTab('docker')}>
            🐳 Docker Services ({dockerServices.length})
          </button>
        </div>
      </div>

      {subTab === 'sql' && (
        <>
          {sqlTables.length === 0 ? (
            <div className="empty-state">
              <p>No SQL DDL tables detected in this workspace. Add <code>.sql</code> migration or schema files to index relational entities.</p>
            </div>
          ) : (
            <div className="table-grid">
              {sqlTables.map((table) => (
                <div key={table.id || table.name} className="sql-table-card">
                  <div className="table-card-header">
                    <div>
                      <span className="table-badge">TABLE</span>
                      <h4>{table.name}</h4>
                    </div>
                    {table.filePath && (
                      <button
                        className="link-button"
                        onClick={() => vscode.postMessage({ type: 'evidence/open', path: table.filePath, line: table.line || 1 })}
                      >
                        {table.filePath} ↗
                      </button>
                    )}
                  </div>

                  <div className="column-list">
                    {table.columns.map((col) => (
                      <div key={col.name} className="column-row">
                        <span className="column-name">
                          {col.name} {col.isPrimary ? '🔑' : ''}
                        </span>
                        <span className="column-type">{col.type}</span>
                      </div>
                    ))}
                  </div>

                  {table.foreignKeys && table.foreignKeys.length > 0 && (
                    <div className="foreign-keys-box">
                      <span className="fk-label">Foreign Keys:</span>
                      {table.foreignKeys.map((fk) => (
                        <span key={fk.column} className="fk-badge">
                          {fk.column} ➔ {fk.targetTable}.{fk.targetColumn}
                        </span>
                      ))}
                    </div>
                  )}

                  {table.mappedModels && table.mappedModels.length > 0 && (
                    <div className="mapped-models-box">
                      <span className="models-label">Mapped Models:</span>
                      {table.mappedModels.map((m) => (
                        <span key={m} className="model-chip">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === 'docker' && (
        <>
          {dockerServices.length === 0 ? (
            <div className="empty-state">
              <p>No Dockerfile or Docker Compose services detected in this workspace.</p>
            </div>
          ) : (
            <div className="docker-grid">
              {dockerServices.map((svc) => (
                <div key={svc.id || svc.name} className="docker-service-card">
                  <div className="service-card-header">
                    <div>
                      <span className="docker-badge">CONTAINER</span>
                      <h4>{svc.name}</h4>
                    </div>
                    {svc.filePath && (
                      <button
                        className="link-button"
                        onClick={() => vscode.postMessage({ type: 'evidence/open', path: svc.filePath, line: svc.line || 1 })}
                      >
                        {svc.filePath}:{svc.line || 1} ↗
                      </button>
                    )}
                  </div>

                  <div className="service-details">
                    <div className="detail-field">
                      <span>Image:</span>
                      <code>{svc.image || 'Built from Dockerfile'}</code>
                    </div>
                    <div className="detail-field">
                      <span>Exposed Ports:</span>
                      <div className="port-chips">
                        {svc.ports.length > 0 ? (
                          svc.ports.map((p) => <span key={p} className="port-chip">{p}</span>)
                        ) : (
                          <span className="none-text">None specified</span>
                        )}
                      </div>
                    </div>
                    <div className="detail-field">
                      <span>Depends On:</span>
                      <div className="dep-chips">
                        {svc.dependsOn.length > 0 ? (
                          svc.dependsOn.map((d) => <span key={d} className="dep-chip">➔ {d}</span>)
                        ) : (
                          <span className="none-text">None (Standalone)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
