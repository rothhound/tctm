import { Module } from '@nestjs/common';
import { SourceConfigController } from './source-config.controller';

@Module({
  controllers: [SourceConfigController],
})
export class SourceConfigModule {}
