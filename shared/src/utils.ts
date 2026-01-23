/**
 * Pure utility functions shared across platforms.
 */

import type { AgentMessage, ToolName } from './types';

/**
 * Format a timestamp as a short time string (e.g., "10:30 AM").
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Extract code from tool_input metadata for preview.
 */
export function getCodeFromInput(toolInput: Record<string, unknown> | null | undefined): string | null {
  if (!toolInput) return null;
  const code = toolInput.code;
  if (typeof code === 'string') {
    return code;
  }
  return null;
}

/**
 * Push an item to an array with a maximum length, dropping oldest items.
 * This is a pure function - returns a new array.
 */
export const boundedPush = <T>(arr: readonly T[], item: T, maxLen: number): T[] => {
  const newArr = [...arr, item];
  return newArr.length > maxLen ? newArr.slice(-maxLen) : newArr;
};

/**
 * Push multiple items to an array with a maximum length.
 */
export const boundedConcat = <T>(arr: readonly T[], items: readonly T[], maxLen: number): T[] => {
  const newArr = [...arr, ...items];
  return newArr.length > maxLen ? newArr.slice(-maxLen) : newArr;
};

/**
 * Generate a unique message ID.
 */
let messageIdCounter = 0;
export const generateMessageId = (): string => `msg_${++messageIdCounter}_${Date.now()}`;

/**
 * Bionic reading types and utilities.
 * Bionic reading bolds the first ~40% of each word to guide eye movement.
 */

/** Time between word chunks in ms */
export const BIONIC_CHUNK_INTERVAL_MS = 150;

/** Number of words per chunk */
export const BIONIC_CHUNK_SIZE = 3;

export interface BionicWord {
  bold: string;
  regular: string;
}

/**
 * Split a word into bold and regular parts for bionic reading.
 * - 1 char: all regular
 * - 2-3 chars: first char bold
 * - 4 chars: first 2 bold
 * - 5+ chars: first ~40% bold
 */
export const bionicWord = (word: string): BionicWord => {
  const len = word.length;
  if (len <= 1) return { bold: '', regular: word };
  // Safe: we've verified len >= 2, so word[0] exists
  if (len <= 3) return { bold: word[0]!, regular: word.slice(1) };
  if (len === 4) return { bold: word.slice(0, 2), regular: word.slice(2) };
  const boldLen = Math.ceil(len * 0.4);
  return { bold: word.slice(0, boldLen), regular: word.slice(boldLen) };
};

/**
 * Split text into an array of non-empty words.
 * @param text - Text to split on whitespace
 * @returns Array of words (empty strings filtered out)
 */
export const splitWords = (text: string): string[] => {
  return text.split(/\s+/).filter((w) => w.length > 0);
};

/**
 * Split text into chunks of words.
 * @param text - Text to split
 * @param chunkSize - Number of words per chunk (default 2-3)
 * @returns Array of word arrays
 */
export const chunkWords = (text: string, chunkSize: number = 2): string[][] => {
  const words = splitWords(text);
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize));
  }
  return chunks;
};

/**
 * Get the most recent code_execution message to find the current tool.
 */
export const getLastToolCall = (messages: AgentMessage[]): ToolName | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.type === 'code_execution' && msg.metadata?.tool_name) {
      return msg.metadata.tool_name;
    }
  }
  return null;
};
