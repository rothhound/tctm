import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '25', 10) || 25));
    return this.tasks.listActive(p, l);
  }

  @Get('counts')
  counts() {
    return this.tasks.getCounts();
  }

  @Get('archived')
  archived() {
    return this.tasks.listArchived();
  }

  @Get('filtered')
  filtered() {
    return this.tasks.listFiltered();
  }

  @Get('reported')
  reported() {
    return this.tasks.listReported();
  }

  @Get('snoozed')
  snoozed() {
    return this.tasks.listSnoozed();
  }

  @Get('done')
  done() {
    return this.tasks.listDone();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Get(':id/subtasks')
  subtasks(@Param('id') id: string) {
    return this.tasks.getSubtasks(id);
  }

  @Patch(':id')
  edit(@Param('id') id: string, @Body() body: any) {
    const { reason, ...updates } = body;
    return this.tasks.edit(id, updates, reason);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.tasks.complete(id);
  }

  @Post(':id/uncomplete')
  uncomplete(@Param('id') id: string) {
    return this.tasks.uncomplete(id);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.tasks.archive(id);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id') id: string) {
    return this.tasks.unarchive(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.tasks.restore(id);
  }

  @Post(':id/report')
  report(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.tasks.report(id, body.reason);
  }

  @Post(':id/unreport')
  unreport(@Param('id') id: string) {
    return this.tasks.unreport(id);
  }

  @Post(':id/remind')
  setReminder(@Param('id') id: string, @Body() body: { reminderAt: string }) {
    return this.tasks.setReminder(id, body.reminderAt);
  }

  @Delete(':id/remind')
  @HttpCode(204)
  clearReminder(@Param('id') id: string) {
    return this.tasks.clearReminder(id);
  }

  @Post(':id/subtasks')
  createSubtask(
    @Param('id') id: string,
    @Body() body: { title: string; description?: string; priority?: 'high' | 'mid' | 'low'; dueAt?: string },
  ) {
    return this.tasks.createSubtask(id, body);
  }

  @Get(':id/notes')
  getTaskNotes(@Param('id') id: string) {
    return this.tasks.getTaskNotes(id);
  }

  @Post(':id/notes')
  createTaskNote(@Param('id') id: string, @Body() body: { content: string }) {
    return this.tasks.createTaskNote(id, body.content);
  }

  @Delete('notes/:noteId')
  @HttpCode(204)
  deleteTaskNote(@Param('noteId') noteId: string) {
    return this.tasks.deleteTaskNote(noteId);
  }
}
