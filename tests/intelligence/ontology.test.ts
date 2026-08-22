/**
 * Ontology Layer Tests (Layer 1)
 *
 * Validates domain metamodel, entity hierarchy rules, and architectural boundary constraints.
 */

import { describe, it, expect } from 'vitest';
import {
  ONTOLOGY_CONCEPTS,
  ONTOLOGY_RELATIONSHIPS,
  ALLOWED_LAYER_DEPENDENCIES,
  validateRelationship,
  isLayerDependencyAllowed,
  getValidTargetConcepts,
} from '../../src/intelligence/ontology/ontology.js';

describe('Ontology Layer (Layer 1)', () => {
  it('should define all 16 core structural and architectural concepts', () => {
    expect(Object.keys(ONTOLOGY_CONCEPTS).length).toBe(16);
    expect(ONTOLOGY_CONCEPTS['repository']).toBeDefined();
    expect(ONTOLOGY_CONCEPTS['database-table']).toBeDefined();
    expect(ONTOLOGY_CONCEPTS['docker-service']).toBeDefined();
    expect(ONTOLOGY_CONCEPTS['documentation']).toBeDefined();
    expect(ONTOLOGY_CONCEPTS['component']).toBeDefined();
  });

  it('should enforce parent hierarchy invariants', () => {
    expect(ONTOLOGY_CONCEPTS['repository'].allowedParents).toEqual([]);
    expect(ONTOLOGY_CONCEPTS['project'].allowedParents).toContain('repository');
    expect(ONTOLOGY_CONCEPTS['module'].allowedParents).toContain('project');
    expect(ONTOLOGY_CONCEPTS['component'].allowedParents).toContain('file');
  });

  it('should validate relationship edge constraints', () => {
    const validImport = validateRelationship('file', 'file', 'imports');
    expect(validImport.valid).toBe(true);

    const validApiFlow = validateRelationship('api-endpoint', 'component', 'api-flow');
    expect(validApiFlow.valid).toBe(true);

    const invalidContainment = validateRelationship('symbol', 'repository', 'contains');
    expect(invalidContainment.valid).toBe(false);
  });

  it('should enforce clean architectural layer boundary rules', () => {
    // Presentation can call API or Business Logic
    expect(isLayerDependencyAllowed('presentation', 'api')).toBe(true);
    expect(isLayerDependencyAllowed('presentation', 'business-logic')).toBe(true);

    // Presentation should NOT directly access Data Access
    expect(isLayerDependencyAllowed('presentation', 'data-access')).toBe(false);

    // Business Logic can call Data Access
    expect(isLayerDependencyAllowed('business-logic', 'data-access')).toBe(true);

    // Data Access should NOT call Presentation
    expect(isLayerDependencyAllowed('data-access', 'presentation')).toBe(false);
  });

  it('should return valid target concepts for a given relationship', () => {
    const targets = getValidTargetConcepts('imports');
    expect(targets).toContain('file');
    expect(targets).toContain('module');
  });
});
