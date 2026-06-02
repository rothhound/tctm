import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { IntegrationHealthService } from './integration-health.service';

@Module({
  controllers: [HealthController],
  providers: [IntegrationHealthService],
})
export class HealthModule {}
