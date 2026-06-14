import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ZorvexGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ZorvexGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string; userId?: string },
  ) {
    if (!data || !data.organizationId) {
      this.logger.warn(`Client ${client.id} tried to join without organizationId`);
      return { status: 'error', message: 'Missing organizationId' };
    }

    const roomName = `org_${data.organizationId}`;
    client.join(roomName);
    this.logger.log(`Client ${client.id} joined room ${roomName} for organization ${data.organizationId}`);
    
    return { status: 'success', room: roomName };
  }

  broadcastToOrganization(organizationId: string, event: string, payload: any) {
    const roomName = `org_${organizationId}`;
    this.logger.log(`Broadcasting event "${event}" to room "${roomName}"`);
    if (this.server) {
      this.server.to(roomName).emit(event, payload);
    } else {
      this.logger.warn(`Socket.io server not initialized. Skipping broadcast.`);
    }
  }
}
