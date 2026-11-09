import { Logger } from '@nestjs/common';
import { SafeTypeOrmLogger } from './safe-typeorm-logger';

describe('SafeTypeOrmLogger', () => {
  it('never logs query parameters or the driver detail', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const logger = new SafeTypeOrmLogger();
    const err = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "UQ_users_loginEmail"',
      ),
      {
        code: '23505',
        constraint: 'UQ_users_loginEmail',
        detail: 'Key ("loginEmail")=(secret.person@gmail.com) already exists.',
      },
    );
    logger.logQueryError(
      err,
      'INSERT INTO "users"("loginEmail","mobile") VALUES ($1, $2)',
    );
    const line = String(error.mock.calls[0][0]);
    expect(line).toContain('23505 UQ_users_loginEmail');
    expect(line).toContain('VALUES ($1, $2)');
    expect(line).not.toContain('secret.person@gmail.com');
    error.mockRestore();
  });

  it('is silent for normal queries', () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    new SafeTypeOrmLogger().logQuery();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
