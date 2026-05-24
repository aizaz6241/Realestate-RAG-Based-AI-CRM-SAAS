import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  getRooms(@Request() req) {
    return this.chatService.getRooms(req.user.id, req.user.organizationId);
  }

  @Get('rooms/:id/messages')
  getMessages(@Param('id') id: string, @Request() req) {
    return this.chatService.getMessages(id, req.user.organizationId);
  }

  @Post('rooms/:id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body('content') content: string,
    @Request() req,
  ) {
    return this.chatService.sendMessage(id, req.user.id, content);
  }

  @Post('rooms/direct')
  startDirectChat(
    @Body('targetUserId') targetUserId: string,
    @Request() req,
  ) {
    return this.chatService.startDirectChat(
      req.user.id,
      targetUserId,
      req.user.organizationId,
    );
  }
}
