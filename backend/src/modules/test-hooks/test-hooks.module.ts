import { Module } from '@nestjs/common';
import { TestHooksController } from './test-hooks.controller';

/** Test-only routes; loaded only through ConditionalModule + testHooksEnabled() (app.module.ts). */
@Module({ controllers: [TestHooksController] })
export class TestHooksModule {}
