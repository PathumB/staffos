import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throw this from services for every expected failure so the client gets a stable `code`, e.g.
 * `new AppException(HttpStatus.CONFLICT, 'INVALID_TRANSITION', 'Cannot move…', { from, to })`.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super({ code, message, details }, status);
  }
}
