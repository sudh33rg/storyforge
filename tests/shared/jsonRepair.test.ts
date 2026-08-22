/**
 * JSON Repair Tests
 */

import { describe, it, expect } from 'vitest';
import { parseAndRepairJson, extractJsonObjects } from '../../src/shared/jsonRepair';

describe('JSON Repair', () => {
  it('should parse valid JSON directly', () => {
    const result = parseAndRepairJson<{ name: string }>('{"name": "test"}');
    expect(result.name).toBe('test');
  });

  it('should strip markdown code fences', () => {
    const input = '```json\n{"name": "test"}\n```';
    const result = parseAndRepairJson<{ name: string }>(input);
    expect(result.name).toBe('test');
  });

  it('should strip preamble text', () => {
    const input = 'Here is the JSON output:\n{"name": "test"}';
    const result = parseAndRepairJson<{ name: string }>(input);
    expect(result.name).toBe('test');
  });

  it('should fix trailing commas', () => {
    const input = '{"name": "test", "items": [1, 2, 3,],}';
    const result = parseAndRepairJson<{ name: string; items: number[] }>(input);
    expect(result.name).toBe('test');
    expect(result.items).toEqual([1, 2, 3]);
  });

  it('should auto-close truncated JSON', () => {
    const input = '{"name": "test", "items": [1, 2';
    const result = parseAndRepairJson<{ name: string; items: number[] }>(input);
    expect(result.name).toBe('test');
    expect(result.items).toEqual([1, 2]);
  });

  it('should handle nested truncated structures', () => {
    const input = '{"data": {"users": [{"name": "Alice"';
    const result = parseAndRepairJson<{ data: { users: Array<{ name: string }> } }>(input);
    expect(result.data.users[0].name).toBe('Alice');
  });

  it('should extract multiple JSON objects', () => {
    const input = '{"id": 1} some text {"id": 2}';
    const results = extractJsonObjects<{ id: number }>(input);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe(1);
    expect(results[1].id).toBe(2);
  });

  it('should handle arrays', () => {
    const input = '[{"name": "a"}, {"name": "b"}]';
    const result = parseAndRepairJson<Array<{ name: string }>>(input);
    expect(result.length).toBe(2);
  });

  it('should throw on completely invalid input', () => {
    expect(() => parseAndRepairJson('not json at all')).toThrow();
  });
});
