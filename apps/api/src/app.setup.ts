import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Env } from './common/config/env';
import { APP_VERSION } from './common/config/version';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/**
 * HTTP-level setup shared by main.ts and the integration tests, so tests exercise the same
 * prefix, headers and CORS policy as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  // Proxies in front of the API: production has two (Vercel's rewrite, then Render's proxy), so
  // req.ip is the visitor's address for rate limits and the audit log. Vercel overwrites
  // X-Forwarded-For, so visitors can't spoof it through the web app.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  // Express 5 defaults to the 'simple' parser; list endpoints need nested filter[status]=X.
  app.set('query parser', 'extended');
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.use(
    helmet({
      // security.md §5: the API is never meant to be framed.
      contentSecurityPolicy: { directives: { frameAncestors: ["'none'"] } },
      frameguard: { action: 'deny' },
    }),
  );
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();

  const swaggerEnabled =
    config.get('SWAGGER_ENABLED', { infer: true }) ??
    config.get('NODE_ENV', { infer: true }) !== 'production';
  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('StaffOS API')
        .setDescription('Workforce and recruitment platform. Contract: docs/api-contract.md')
        .setVersion(APP_VERSION)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }
}
