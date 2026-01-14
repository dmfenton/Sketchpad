/**
 * Pure utility functions shared across platforms.
 */

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
  if (len <= 3) return { bold: word[0], regular: word.slice(1) };
  if (len === 4) return { bold: word.slice(0, 2), regular: word.slice(2) };
  const boldLen = Math.ceil(len * 0.4);
  return { bold: word.slice(0, boldLen), regular: word.slice(boldLen) };
};

/**
 * Split text into chunks of words.
 * @param text - Text to split
 * @param chunkSize - Number of words per chunk (default 2-3)
 * @returns Array of word arrays
 */
export const chunkWords = (text: string, chunkSize: number = 2): string[][] => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize));
  }
  return chunks;
};
