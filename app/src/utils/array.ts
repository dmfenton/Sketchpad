/**
 * Pure array utility functions.
 */

/**
 * Push an item to an array with a maximum length, dropping oldest items.
 * This is a pure function - returns a new array.
 */
export const boundedPush = <T>(
  arr: readonly T[],
  item: T,
  maxLen: number
): T[] => {
  const newArr = [...arr, item];
  return newArr.length > maxLen ? newArr.slice(-maxLen) : newArr;
};

/**
 * Push multiple items to an array with a maximum length.
 */
export const boundedConcat = <T>(
  arr: readonly T[],
  items: readonly T[],
  maxLen: number
): T[] => {
  const newArr = [...arr, ...items];
  return newArr.length > maxLen ? newArr.slice(-maxLen) : newArr;
};
