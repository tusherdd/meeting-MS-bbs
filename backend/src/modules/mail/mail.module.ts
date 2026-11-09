import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailOutbox } from './entities/email-outbox.entity';
import { MailAdminController } from './mail-admin.controller';
import { MailAdminService } from './mail-admin.service';
import { MAIL_TRANSPORT, SmtpMailTransport } from './mail-transport';
import { MailWorkerService } from './mail-worker.service';
import { MailService } from './mail.service';

/** Global: any module may enqueue mail. The worker sends it (SPEC.md §6.5). */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EmailOutbox])],
  controllers: [MailAdminController],
  providers: [
    MailService,
    MailAdminService,
    MailWorkerService,
    { provide: MAIL_TRANSPORT, useClass: SmtpMailTransport },
  ],
  exports: [MailService, MailWorkerService],
})
export class MailModule {}
