import { join } from 'path';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DbModule } from './db/db.module';
import { QueuesModule } from './shared/queues.module';
import { AnthropicModule } from './shared/anthropic.module';
import { LlmModule } from './shared/llm/llm.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { RefreshInterceptor } from './auth/refresh.interceptor';
import { HealthModule } from './health/health.module';
import { SignalsModule } from './signals/signals.module';
import { EntitiesModule } from './entities/entities.module';
import { TasksModule } from './tasks/tasks.module';
import { ExtractionModule } from './extraction/extraction.module';
import { SlackModule } from './ingestion/slack/slack.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GmailModule } from './ingestion/gmail/gmail.module';
import { NotionModule } from './ingestion/notion/notion.module';
import { GranolaModule } from './ingestion/granola/granola.module';
import { WaitingOnModule } from './waiting-on/waiting-on.module';
import { SnoozeModule } from './snooze/snooze.module';
import { BriefModule } from './brief/brief.module';
import { SourceConfigModule } from './config/config.module';
import { MetricsModule } from './metrics/metrics.module';
import { PromptsModule } from './prompts/prompts.module';
import { CalibrationModule } from './calibration/calibration.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*path}'],
    }),
    ScheduleModule.forRoot(),
    DbModule,
    QueuesModule,
    AnthropicModule,
    LlmModule,
    AuthModule,
    HealthModule,
    SignalsModule,
    EntitiesModule,
    TasksModule,
    ExtractionModule,
    SlackModule,
    AuditModule,
    NotificationsModule,
    GmailModule,
    NotionModule,
    GranolaModule,
    WaitingOnModule,
    SnoozeModule,
    BriefModule,
    SourceConfigModule,
    MetricsModule,
    PromptsModule,
    CalibrationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RefreshInterceptor },
  ],
})
export class AppModule {}
