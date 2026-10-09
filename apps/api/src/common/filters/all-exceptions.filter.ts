import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ApiError, ErrorCode } from '@staffos/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../errors/app.exception';
import { captureError } from '../../infra/monitoring/sentry';

const CODE_BY_STATUS: Record<number, string> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  422: ErrorCode.BUSINESS_RULE_VIOLATION,
  429: ErrorCode.RATE_LIMITED,
};

const GENERIC_SERVER_MESSAGE = 'An unexpected error occurred.';

/** Errors raised by Express middleware (e.g. body-parser) follow the `http-errors` convention. */
type HttpLikeError = { status: number; expose: boolean; message: string };

function isHttpLikeError(e: unknown): e is HttpLikeError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as HttpLikeError).status === 'number' &&
    (e as HttpLikeError).expose === true
  );
}

type ErrorBody = Omit<ApiError, 'traceId'>;

/**
 * Converts every thrown value into the single API error shape (CLAUDE.md §8):
 * `{ code, message, details, traceId }`. Never leaks stack traces or internal messages.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: unknown }>();
    const res = ctx.getResponse<Response>();
    const traceId = typeof req.id === 'string' ? req.id : randomUUID();

    const { status, body } = toErrorBody(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, traceId }, 'Unhandled error');
      captureError(exception, traceId);
    }

    const payload: ApiError = { ...body, traceId };
    res.status(status).json(payload);
  }
}

function toErrorBody(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      body: { code: exception.code, message: exception.message, details: exception.details },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status >= 500) {
      return serverError(status);
    }
    const response = exception.getResponse();
    const message =
      typeof response === 'object' && response !== null && 'message' in response
        ? String((response as { message: unknown }).message)
        : exception.message;
    return {
      status,
      body: { code: CODE_BY_STATUS[status] ?? ErrorCode.HTTP_ERROR, message, details: {} },
    };
  }

  if (isHttpLikeError(exception) && exception.status >= 400 && exception.status < 500) {
    return {
      status: exception.status,
      body: {
        code: CODE_BY_STATUS[exception.status] ?? ErrorCode.HTTP_ERROR,
        message: exception.message,
        details: {},
      },
    };
  }

  return serverError(HttpStatus.INTERNAL_SERVER_ERROR);
}

function serverError(status: number): { status: number; body: ErrorBody } {
  return {
    status,
    body: { code: ErrorCode.INTERNAL_ERROR, message: GENERIC_SERVER_MESSAGE, details: {} },
  };
}
