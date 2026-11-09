import type { NextFunction, Response } from 'express';
import {
  requestIdMiddleware,
  type RequestWithId,
} from './request-id.middleware';

function run(header?: string) {
  const req = {
    headers: header ? { 'x-request-id': header } : {},
  } as RequestWithId;
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  const next = jest.fn() as NextFunction;
  requestIdMiddleware(req, res, next);
  return { req, setHeader, next };
}

describe('requestIdMiddleware', () => {
  it('keeps a valid client id and echoes it', () => {
    const { req, setHeader, next } = run('abc-12345-XYZ');
    expect(req.requestId).toBe('abc-12345-XYZ');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc-12345-XYZ');
    expect(next).toHaveBeenCalled();
  });

  it.each([
    'short',
    'evil\ninjected log line',
    'x'.repeat(100),
    '<script>alert(1)</script>',
  ])('replaces an unsafe id (%s) with a UUID', (bad) => {
    expect(run(bad).req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('creates an id when none is sent', () => {
    expect(run().req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
