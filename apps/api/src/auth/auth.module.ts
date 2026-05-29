import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { RefreshInterceptor } from './refresh.interceptor';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RefreshInterceptor],
  exports: [AuthService, AuthGuard, RefreshInterceptor],
})
export class AuthModule {}
