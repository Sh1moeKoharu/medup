import { FetchError } from '@medusajs/js-sdk';
import Toast from 'react-native-toast-message';

/**
 * Network error that occurs during fetch operations
 */
export interface NetworkError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  hostname?: string;
}

/**
 * Type guard to check if error is a Medusa FetchError
 */
export const isFetchError = (error: unknown): error is FetchError => {
  return error instanceof FetchError;
};

/**
 * Type guard to check if error is a network error
 */
export const isNetworkError = (error: unknown): error is NetworkError => {
  return error instanceof Error && ('code' in error || 'errno' in error || 'syscall' in error);
};

/**
 * Check if error is an unauthorized error (401)
 */
export const isUnauthorizedError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 401;
};

/**
 * Check if error is a forbidden error (403)
 */
export const isForbiddenError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 403;
};

/**
 * Check if error is a not found error (404)
 */
export const isNotFoundError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 404;
};

/**
 * Check if error is a server error (500)
 */
export const isServerError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 500;
};

/**
 * Get error message from any error type
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const e = error as any;
    if (e.response?.data?.message) return e.response.data.message;
    if (e.body?.message) return e.body.message;
    if (e.message) return e.message;
    
    try {
      const safeError = {
        message: e.message,
        name: e.name,
        status: e.status,
        body: e.body,
        responseData: e.response?.data
      };
      return JSON.stringify(safeError, null, 2);
    } catch (err) {
      // ignore
    }
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
};

export const showErrorToast = (error: unknown) => {
  if (isUnauthorizedError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Unauthorized',
      text2: 'You need to log in to access this resource.',
    });
    return;
  }

  if (isForbiddenError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Forbidden',
      text2: 'You do not have permission to access this resource.',
    });
    return;
  }

  if (isNotFoundError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Not Found',
      text2: 'The requested resource could not be found.',
    });
    return;
  }

  if (isServerError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Server Error',
      text2: getErrorMessage(error) || 'An unexpected error occurred on the server.',
    });
    return;
  }

  if (isNetworkError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Network Error',
      text2: 'Please check your internet connection and try again.',
    });
    return;
  }

  Toast.show({
    type: 'error',
    text1: 'Something went wrong',
    text2: getErrorMessage(error),
  });
};
