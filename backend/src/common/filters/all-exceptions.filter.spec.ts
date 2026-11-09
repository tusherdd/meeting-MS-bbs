import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import {
  GENERIC_SERVER_ERROR_MESSAGE,
  toErrorBody,
} from './all-exceptions.filter';

describe('toErrorBody', () => {
  const sqlError = new QueryFailedError(
    'SELECT * FROM users WHERE id = $1',
    ['x'],
    new Error('relation "users" does not exist'),
  );

  it('keeps validation messages (array) for 400', () => {
    const ex = new BadRequestException(['title should not be empty']);
    expect(toErrorBody(ex, true)).toEqual({
      statusCode: 400,
      message: ['title should not be empty'],
      error: 'Bad Request',
    });
  });

  it('keeps a Bangla client error message', () => {
    expect(
      toErrorBody(new NotFoundException('সভা পাওয়া যায়নি'), true),
    ).toEqual({
      statusCode: 404,
      message: 'সভা পাওয়া যায়নি',
      error: 'Not Found',
    });
  });

  it('keeps an object message payload such as a conflict list', () => {
    const body = toErrorBody(new ConflictException('সময় সংঘাত আছে'), true);
    expect(body).toEqual({
      statusCode: 409,
      message: 'সময় সংঘাত আছে',
      error: 'Conflict',
    });
  });

  it('hides SQL errors in production', () => {
    const body = toErrorBody(sqlError, true);
    expect(body).toEqual({
      statusCode: 500,
      message: GENERIC_SERVER_ERROR_MESSAGE,
      error: 'Internal Server Error',
    });
    expect(JSON.stringify(body)).not.toMatch(/SELECT|relation|users/);
  });

  it('hides the message of an explicit 5xx HttpException in production', () => {
    const body = toErrorBody(
      new InternalServerErrorException('db password wrong'),
      true,
    );
    expect(body.message).toBe(GENERIC_SERVER_ERROR_MESSAGE);
  });

  it('shows the real message in development but never a stack', () => {
    const err = new Error('boom');
    const body = toErrorBody(err, false);
    expect(body).toEqual({
      statusCode: 500,
      message: 'boom',
      error: 'Internal Server Error',
    });
    expect(JSON.stringify(body)).not.toContain('at ');
  });

  it('passes through exposed client errors from middleware (e.g. bad JSON)', () => {
    const parseError = Object.assign(
      new SyntaxError('Unexpected token } in JSON'),
      {
        status: 400,
        expose: true,
      },
    );
    expect(toErrorBody(parseError, true)).toEqual({
      statusCode: 400,
      message: 'Unexpected token } in JSON',
      error: 'Bad Request',
    });
  });

  it('handles non-Error throwables', () => {
    expect(toErrorBody('weird', true).statusCode).toBe(500);
    expect(toErrorBody(undefined, false).message).toBe(
      GENERIC_SERVER_ERROR_MESSAGE,
    );
  });

  it('keeps structured details of a 4xx (e.g. meeting 409 blocking list)', () => {
    const ex = new ConflictException({
      message: 'সংঘাত',
      blocking: [{ meetingId: 'm1' }],
    });
    expect(toErrorBody(ex, true)).toEqual({
      statusCode: 409,
      message: 'সংঘাত',
      error: 'Conflict',
      blocking: [{ meetingId: 'm1' }],
    });
  });

  it('never adds details to a 5xx', () => {
    const ex = new InternalServerErrorException({
      message: 'x',
      sql: 'SELECT secret',
    });
    expect(toErrorBody(ex, false)).not.toHaveProperty('sql');
  });
});
