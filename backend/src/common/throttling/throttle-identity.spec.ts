import { Controller, ExecutionContext, Get } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AppRequest } from '../types/auth-user';
import { ThrottleByIp, ThrottleIdentity } from './throttle-identity';

const SECRET = 'a'.repeat(40);
const LIMITS = { perIp: 100, perUser: 300 };
const USER_ID = '6f1c2b1e-3d4a-4f5b-9c8d-7e6f5a4b3c2d';

@Controller()
class DemoController {
  @Get()
  normal(): void {}

  @ThrottleByIp()
  @Get('login')
  login(): void {}
}

function request(token?: string, where: 'cookie' | 'bearer' = 'cookie'): AppRequest {
  return {
    ip: '10.0.0.7',
    headers:
      token && where === 'bearer' ? { authorization: `Bearer ${token}` } : {},
    cookies: token && where === 'cookie' ? { access_token: token } : {},
  } as unknown as AppRequest;
}

function context(
  req: AppRequest,
  handler: keyof DemoController = 'normal',
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => DemoController.prototype[handler],
    getClass: () => DemoController,
  } as unknown as ExecutionContext;
}

const sign = (payload: object, secret = SECRET, expiresIn = 900) =>
  new JwtService({}).sign(payload, { secret, algorithm: 'HS256', expiresIn });

describe('ThrottleIdentity', () => {
  const identity = () => new ThrottleIdentity(SECRET, LIMITS);

  it('counts a request with a valid access cookie per user, with the user limit', () => {
    const req = request(sign({ sub: USER_ID, typ: 'access' }));
    const id = identity();
    expect(id.trackerFor(req, context(req))).toBe(`user:${USER_ID}`);
    expect(id.limitFor(context(req))).toBe(300);
  });

  it('accepts the Bearer header too', () => {
    const req = request(sign({ sub: USER_ID, typ: 'access' }), 'bearer');
    expect(identity().trackerFor(req, context(req))).toBe(`user:${USER_ID}`);
  });

  it('counts requests without a token per IP, with the IP limit', () => {
    const req = request();
    const id = identity();
    expect(id.trackerFor(req, context(req))).toBe('ip:10.0.0.7');
    expect(id.limitFor(context(req))).toBe(100);
  });

  it.each([
    ['a forged token (wrong secret)', sign({ sub: USER_ID, typ: 'access' }, 'b'.repeat(40))],
    ['an expired token', sign({ sub: USER_ID, typ: 'access' }, SECRET, -10)],
    ['a refresh token', sign({ sub: USER_ID, typ: 'refresh' })],
    ['garbage', 'not-a-jwt'],
  ])('falls back to the IP for %s', (_label, token) => {
    const req = request(token);
    expect(identity().trackerFor(req, context(req))).toBe('ip:10.0.0.7');
  });

  it('keeps @ThrottleByIp() routes per IP even with a valid session', () => {
    const req = request(sign({ sub: USER_ID, typ: 'access' }));
    const id = identity();
    expect(id.trackerFor(req, context(req, 'login'))).toBe('ip:10.0.0.7');
    expect(id.limitFor(context(req, 'login'))).toBe(100);
  });

  it('checks the token once per request', () => {
    const req = request(sign({ sub: USER_ID, typ: 'access' }));
    const id = identity();
    const verify = jest.spyOn(JwtService.prototype, 'verify');
    id.limitFor(context(req));
    id.trackerFor(req, context(req));
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });
});
