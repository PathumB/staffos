import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/infra/prisma/prisma.service';

export type TestAppOptions = {
  /** Replaces PrismaService (for HTTP-layer tests that don't need a real database). */
  prisma?: Partial<PrismaService>;
  /** Extra controllers/providers mounted next to AppModule (e.g. probe controllers). */
  controllers?: ModuleMetadata['controllers'];
};

/** Boots the real AppModule with the production HTTP setup (prefix, helmet, CORS, filters, pipes). */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });
  if (options.prisma) {
    builder = builder.overrideProvider(PrismaService).useValue(options.prisma);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
