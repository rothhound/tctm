import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Partial<AuthService>;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns token on successful login', async () => {
    const mockResult = { token: 'jwt-token', expiresAt: '2026-05-20T00:00:00Z' };
    (authService.login as jest.Mock).mockResolvedValue(mockResult);

    const result = await controller.login({ password: 'correct' });

    expect(result).toEqual(mockResult);
    expect(authService.login).toHaveBeenCalledWith('correct');
  });

  it('propagates UnauthorizedException for wrong password', async () => {
    (authService.login as jest.Mock).mockRejectedValue(new UnauthorizedException('Invalid password'));

    await expect(controller.login({ password: 'wrong' })).rejects.toThrow(UnauthorizedException);
  });
});
