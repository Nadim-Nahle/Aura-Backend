import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    method: 'GET',
    originalUrl: '/test',
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('preserves safe validation messages', () => {
    const { host, response } = createHost();

    filter.catch(new BadRequestException(['name must be a string']), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['name must be a string'],
      }),
    );
  });

  it('does not expose unexpected internal error messages', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const { host, response } = createHost();

    filter.catch(new Error('sensitive internal detail'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
    expect(response.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'sensitive internal detail' }),
    );
    consoleError.mockRestore();
  });

  it('maps known Firebase conflicts to safe HTTP errors', () => {
    const { host, response } = createHost();

    filter.catch({ code: 'auth/email-already-exists' }, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Email address is already in use',
      }),
    );
  });
});
