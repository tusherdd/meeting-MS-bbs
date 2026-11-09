/**
 * npm run openapi:export → docs/openapi.json
 * Builds the OpenAPI document from the real controllers and DTOs. Nest "preview" mode only
 * reads metadata — no providers are created, so no database connection is needed.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { API_PREFIX, createSwaggerDocument } from '../src/app.setup';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false, abortOnError: false });
  app.setGlobalPrefix(API_PREFIX);
  const document = createSwaggerDocument(app);
  const outDir = join(__dirname, '..', '..', 'docs');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, 'openapi.json');
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  const operations = Object.values(document.paths).reduce((n, ops) => n + Object.keys(ops).length, 0);
  console.log(`Wrote ${file} (${Object.keys(document.paths).length} paths, ${operations} operations)`);
  await app.close();
}

void main();
