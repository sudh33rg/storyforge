/**
 * StoryForge JSON Repair Engine
 *
 * Extracts and repairs JSON from LLM output which frequently contains:
 * - Markdown code fences (```json ... ```)
 * - Conversational preambles/postambles
 * - Trailing commas
 * - Unclosed strings, arrays, and objects (from token limit truncation)
 * - Single-quoted property names
 * - Control characters
 */

/**
 * Extract and repair JSON from potentially malformed LLM output.
 * Returns the parsed object/array, or throws if no valid JSON can be recovered.
 */
export function parseAndRepairJson<T = unknown>(raw: string): T {
  // Step 1: Try direct parse (fast path)
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Continue to repair
  }

  // Step 2: Strip markdown code fences
  let cleaned = stripMarkdownFences(raw);

  // Step 3: Extract the outermost JSON structure
  cleaned = extractJsonStructure(cleaned);

  // Step 4: Fix common issues
  cleaned = fixTrailingCommas(cleaned);
  cleaned = fixSingleQuotes(cleaned);
  cleaned = fixControlCharacters(cleaned);

  // Step 5: Try parsing the cleaned version
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Continue to auto-close
  }

  // Step 6: Auto-close unclosed structures
  cleaned = autoCloseStructures(cleaned);

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse or repair JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Attempt to extract multiple JSON objects from a response.
 * Useful when LLM outputs partial arrays.
 */
export function extractJsonObjects<T = unknown>(raw: string): T[] {
  const results: T[] = [];
  const cleaned = stripMarkdownFences(raw);

  // If input is a valid array, return all elements
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
  } catch {
    // Continue
  }

  // Find all top-level { ... } structures
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{' && depth === 0) {
      start = i;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.substring(start, i + 1);
        try {
          results.push(parseAndRepairJson<T>(candidate));
        } catch {
          // Skip malformed
        }
        start = -1;
      }
    }
  }

  return results.length > 0 ? results : [parseAndRepairJson<T>(cleaned)];
}

/**
 * Strip markdown code fences: ```json ... ``` or ``` ... ```
 */
function stripMarkdownFences(input: string): string {
  // Remove fenced code blocks
  let result = input.replace(/```(?:json|JSON|jsonc)?\s*\n?([\s\S]*?)```/g, '$1');

  // If no fences found, try to find JSON start
  if (result === input) {
    const jsonStart = input.search(/[\[{]/);
    if (jsonStart > 0) {
      // Check if there's preamble text before the JSON
      const preamble = input.substring(0, jsonStart).trim();
      if (preamble.length > 0 && !preamble.endsWith(':')) {
        result = input.substring(jsonStart);
      }
    }
  }

  return result.trim();
}

/**
 * Extract the outermost JSON object or array from the input.
 */
function extractJsonStructure(input: string): string {
  // Find the first { or [
  const objStart = input.indexOf('{');
  const arrStart = input.indexOf('[');

  let start: number;
  let openChar: string;
  let closeChar: string;

  if (objStart === -1 && arrStart === -1) {
    return input;
  } else if (objStart === -1) {
    start = arrStart;
    openChar = '[';
    closeChar = ']';
  } else if (arrStart === -1) {
    start = objStart;
    openChar = '{';
    closeChar = '}';
  } else {
    if (objStart < arrStart) {
      start = objStart;
      openChar = '{';
      closeChar = '}';
    } else {
      start = arrStart;
      openChar = '[';
      closeChar = ']';
    }
  }

  // Find the matching closing character
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = input.length;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return input.substring(start, end);
}

/**
 * Remove trailing commas before closing braces/brackets.
 */
function fixTrailingCommas(input: string): string {
  return input.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Replace single-quoted JSON property names with double-quoted ones.
 */
function fixSingleQuotes(input: string): string {
  // Only attempt if there are no double quotes (pure single-quote JSON)
  if (input.includes('"')) {
    return input;
  }
  return input.replace(/'/g, '"');
}

/**
 * Remove or escape invalid control characters within strings.
 */
function fixControlCharacters(input: string): string {
  // Replace literal newlines/tabs inside strings
  return input.replace(
    /"([^"\\]|\\.)*"/g,
    (match) => match.replace(/[\x00-\x1f]/g, (ch) => {
      switch (ch) {
        case '\n': return '\\n';
        case '\r': return '\\r';
        case '\t': return '\\t';
        default: return '';
      }
    }),
  );
}

/**
 * Auto-close unclosed JSON structures (for truncated LLM output).
 */
function autoCloseStructures(input: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }

  // If we're inside an unclosed string, close it
  let result = input;
  if (inString) {
    result += '"';
  }

  // Remove any trailing comma before closing
  result = result.replace(/,\s*$/, '');

  // Close all unclosed structures
  while (stack.length > 0) {
    result += stack.pop();
  }

  return result;
}
