/**
 * Error handling utilities
 *
 * Shared error handling functions used throughout the worker application
 */

/**
 * Extracts a readable error message from various error types
 *
 * @param e - The error to extract a message from
 * @returns A string representation of the error
 */
export const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
