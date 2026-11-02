import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

function fakeHost() {
  const response = {
    headersSent: false,
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ApiExceptionFilter', () => {
  it('把超过请求体上限的错误返回 413，而不是 500', () => {
    const { host, response } = fakeHost();
    const error = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
      statusCode: 413
    });

    new ApiExceptionFilter().catch(error, host);

    expect(response.statusCode).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(response.body).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
  });

  it('限流异常返回 429 和可读中文提示', () => {
    const { host, response } = fakeHost();

    new ApiExceptionFilter().catch(
      new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      host
    );

    expect(response.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.body).toMatchObject({
      error: 'TOO_MANY_REQUESTS',
      message: '操作过于频繁，请稍后再试'
    });
  });
});
