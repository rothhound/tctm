import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @Query('signalId') signalId?: string,
    @Query('purpose') purpose?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('limit') limit?: string,
  ) {
    if (signalId) {
      return this.auditService.findBySignalId(signalId);
    }
    if (purpose) {
      return this.auditService.findByPurpose(
        purpose,
        since ? new Date(since) : undefined,
        until ? new Date(until) : undefined,
      );
    }
    return this.auditService.findRecent(limit ? parseInt(limit, 10) : 50);
  }
}
