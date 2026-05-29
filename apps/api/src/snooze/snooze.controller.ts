import { Body, Controller, Post } from '@nestjs/common';
import { SnoozeService } from './snooze.service';

@Controller('snooze')
export class SnoozeController {
  constructor(private readonly snoozeService: SnoozeService) {}

  @Post('parse')
  parse(@Body() body: { text: string }) {
    return this.snoozeService.parseNaturalLanguage(body.text);
  }
}
