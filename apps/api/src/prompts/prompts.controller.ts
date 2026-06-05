import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PromptsService } from './prompts.service';

@Controller('prompts')
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Get()
  list(@Query('purpose') purpose: 'extract' | 'judge') {
    return this.prompts.listVersions(purpose);
  }

  @Get('active/:purpose')
  getActive(@Param('purpose') purpose: 'extract' | 'judge') {
    return this.prompts.getActivePrompt(purpose);
  }

  @Post()
  create(
    @Body() body: {
      purpose: 'extract' | 'judge';
      content: string;
      metadata?: { createdBy?: string; reason?: string };
    },
  ) {
    return this.prompts.createVersion(
      body.purpose,
      body.content,
      { createdBy: body.metadata?.createdBy ?? 'manual', reason: body.metadata?.reason },
    );
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.prompts.activate(id);
  }
}
