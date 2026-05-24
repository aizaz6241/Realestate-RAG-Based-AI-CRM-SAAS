import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    // Basic assignment logic - assign to the creator by default if not specified
    const assignedTo = data.assignedToId || req.user.id;
    return this.tasksService.create(data, req.user.organizationId, assignedTo, req.user.id);
  }

  @Get()
  findAll(@Request() req) {
    return this.tasksService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.tasksService.findOne(id, req.user.organizationId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.tasksService.update(id, req.user.organizationId, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.tasksService.remove(id, req.user.organizationId);
  }
}
