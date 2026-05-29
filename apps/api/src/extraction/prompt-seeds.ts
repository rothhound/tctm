/**
 * Seed prompt templates for snooze and resolve purposes.
 * These are the V1 defaults — stored in prompt_versions table on first seed.
 *
 * Note: The extract and judge prompts live in prompts.ts (they have template variables).
 * Snooze and resolve prompts are simpler — no template vars needed.
 */

export const SNOOZE_PROMPT =
  'You parse natural language time expressions into ISO 8601 dates. ' +
  'The current date/time will be provided in the user message. ' +
  'Respond with ONLY valid JSON: {"date": "ISO8601 string or null", "confidence": 0-1, "interpretation": "what you understood"}';

export const RESOLVE_PROMPT =
  'You determine if a new message resolves a waiting-on task. ' +
  'Respond with ONLY valid JSON: {"resolves": true/false, "reason": "short explanation"}';
