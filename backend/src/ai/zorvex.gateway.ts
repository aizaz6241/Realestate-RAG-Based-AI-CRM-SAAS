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
import * as jwt from 'jsonwebtoken';

// UUID v4 validation regex to block wildcard-style org IDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
})
export class ZorvexGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ZorvexGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`WebSocket client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WebSocket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string; userId?: string; token?: string },
  ) {
    // --- Security Gate 1: Require organizationId ---
    if (!data || !data.organizationId) {
      this.logger.warn(`[WS Security] Client ${client.id} attempted join without organizationId — rejected.`);
      client.disconnect();
      return { status: 'error', message: 'Missing organizationId' };
    }

    // --- Security Gate 2: UUID format validation (block wildcard/glob attacks) ---
    if (!UUID_REGEX.test(data.organizationId)) {
      this.logger.warn(`[WS Security] Client ${client.id} provided malformed organizationId "${data.organizationId}" — rejected.`);
      client.disconnect();
      return { status: 'error', message: 'Invalid organizationId format' };
    }

    // --- Security Gate 3: JWT token validation ---
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      const token = data.token || (client.handshake?.auth as any)?.token;
      if (!token) {
        this.logger.warn(`[WS Security] Client ${client.id} tried to join org ${data.organizationId} without auth token — rejected.`);
        client.disconnect();
        return { status: 'error', message: 'Authentication required' };
      }

      try {
        const decoded = jwt.verify(token, jwtSecret) as any;

        // --- Security Gate 4: Tenant isolation — token org must match requested org ---
        const tokenOrgId = decoded.organizationId || decoded.org;
        if (tokenOrgId && tokenOrgId !== data.organizationId) {
          this.logger.warn(`[WS Security] Cross-tenant violation: Token org="${tokenOrgId}" tried to join org="${data.organizationId}" — BLOCKED.`);
          client.disconnect();
          return { status: 'error', message: 'Cross-tenant access denied' };
        }
      } catch (err) {
        this.logger.warn(`[WS Security] Invalid or expired JWT from client ${client.id}: ${err.message} — rejected.`);
        client.disconnect();
        return { status: 'error', message: 'Invalid or expired auth token' };
      }
    } else {
      this.logger.warn(`[WS Security] JWT_SECRET not configured — WebSocket auth is DISABLED. Set JWT_SECRET in env.`);
    }

    // --- Approved: Join organization room ---
    const roomName = `org_${data.organizationId}`;
    client.join(roomName);
    this.logger.log(`[WS] Client ${client.id} joined room ${roomName}`);

    return { status: 'success', room: roomName };
  }

  broadcastToOrganization(organizationId: string, event: string, payload: any) {
    const roomName = `org_${organizationId}`;
    if (this.server) {
      this.server.to(roomName).emit(event, payload);
    } else {
      this.logger.warn(`[WS] Socket.io server not initialized. Skipping broadcast for event "${event}".`);
    }
  }
}
