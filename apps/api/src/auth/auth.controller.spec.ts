import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Partial<AuthService>;

  beforeEach(async () => {
    authService = {
      loginWithGoogle: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns token on successful Google login', async () => {
    const mockResult = { token: 'jwt-token', expiresAt: '2026-05-20T00:00:00Z' };
    (authService.loginWithGoogle as jest.Mock).mockResolvedValue(mockResult);

    const result = await controller.loginWithGoogle({ idToken: 'google-id-token' });

    expect(result).toEqual(mockResult);
    expect(authService.loginWithGoogle).toHaveBeenCalledWith('google-id-token');
  });

  it('propagates UnauthorizedException for invalid Google credentials', async () => {
    (authService.loginWithGoogle as jest.Mock).mockRejectedValue(new UnauthorizedException('Invalid Google credentials'));

    await expect(controller.loginWithGoogle({ idToken: 'bad-token' })).rejects.toThrow(UnauthorizedException);
  });
});
