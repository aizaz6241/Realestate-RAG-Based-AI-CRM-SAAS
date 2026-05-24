import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // Shared In-Memory Meeting Signaling Map Getter
  get meetingStates() {
    return this.calendarService.meetingStates;
  }

  @Post('events')
  create(@Body() data: any, @Request() req) {
    return this.calendarService.create(req.user.id, req.user.organizationId, data);
  }

  @Get('events')
  findAll(@Request() req) {
    return this.calendarService.findAll(req.user.id, req.user.organizationId, req.user.role);
  }

  @Patch('events/:id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.calendarService.update(id, req.user.id, req.user.organizationId, req.user.role, data);
  }

  @Delete('events/:id')
  remove(@Param('id') id: string, @Request() req) {
    return this.calendarService.remove(id, req.user.id, req.user.organizationId, req.user.role);
  }

  // 1. Get Room State (Participants & Messages)
  @Get('events/:id/meeting-state')
  getMeetingState(@Param('id') eventId: string) {
    if (!this.meetingStates.has(eventId)) {
      this.meetingStates.set(eventId, { participants: [], messages: [], signals: [], isTerminated: false, allTimeAttendees: [] });
    }
    const state = this.meetingStates.get(eventId)!;

    // Prune inactive participants (no ping in last 6 seconds)
    const now = Date.now();
    const activeParticipants = state.participants.filter(p => now - p.lastActive < 6000);
    if (activeParticipants.length !== state.participants.length) {
      const left = state.participants.filter(p => !activeParticipants.some(ap => ap.id === p.id));
      left.forEach(p => {
        state.messages.push({
          id: 'sys-' + Math.random(),
          sender: 'System Bot',
          text: `🤖 ${p.name} has disconnected.`,
          isSystem: true,
          time: 'Just now'
        });
      });
      state.participants = activeParticipants;
    }

    return {
      participants: state.participants,
      messages: state.messages,
      isTerminated: state.isTerminated,
      allTimeAttendees: state.allTimeAttendees
    };
  }

  // 2. Ping Participant Presence
  @Post('events/:id/meeting-state/ping')
  pingParticipant(
    @Param('id') eventId: string,
    @Body() body: { id: string; name: string; role: string; isMicMuted: boolean; isCamMuted: boolean }
  ) {
    if (!this.meetingStates.has(eventId)) {
      this.meetingStates.set(eventId, { participants: [], messages: [], signals: [], isTerminated: false, allTimeAttendees: [] });
    }
    const state = this.meetingStates.get(eventId)!;
    const now = Date.now();

    // Prevent pinging a terminated room
    if (state.isTerminated) {
      return { success: false, isTerminated: true };
    }

    const existing = state.participants.find(p => p.id === body.id);
    if (existing) {
      existing.isMicMuted = body.isMicMuted;
      existing.isCamMuted = body.isCamMuted;
      existing.lastActive = now;
    } else {
      state.participants.push({
        id: body.id,
        name: body.name,
        role: body.role,
        isMicMuted: body.isMicMuted,
        isCamMuted: body.isCamMuted,
        lastActive: now
      });
      state.messages.push({
        id: 'sys-' + Math.random(),
        sender: 'System Bot',
        text: `🤖 ${body.name} (${body.role}) has joined the call room.`,
        isSystem: true,
        time: 'Just now'
      });
    }

    // Maintain all-time attendee logs
    const attendee = state.allTimeAttendees.find(a => a.id === body.id);
    if (!attendee) {
      state.allTimeAttendees.push({
        id: body.id,
        name: body.name,
        role: body.role,
        joinedAt: now,
        lastPing: now
      });
    } else {
      attendee.lastPing = now;
    }

    return { success: true };
  }

  // 3. Post Message
  @Post('events/:id/meeting-state/message')
  postMessage(
    @Param('id') eventId: string,
    @Body() body: { sender: string; text: string }
  ) {
    if (!this.meetingStates.has(eventId)) {
      this.meetingStates.set(eventId, { participants: [], messages: [], signals: [], isTerminated: false, allTimeAttendees: [] });
    }
    const state = this.meetingStates.get(eventId)!;
    
    if (state.isTerminated) {
      return { success: false, isTerminated: true };
    }

    const newMsg = {
      id: 'msg-' + Math.random(),
      sender: body.sender,
      text: body.text,
      isSystem: false,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    state.messages.push(newMsg);
    return newMsg;
  }

  // 4. Send WebRTC Signal
  @Post('events/:id/meeting-state/signal')
  sendSignal(
    @Param('id') eventId: string,
    @Body() body: { type: string; senderId: string; targetId: string; payload: any }
  ) {
    if (!this.meetingStates.has(eventId)) {
      this.meetingStates.set(eventId, { participants: [], messages: [], signals: [], isTerminated: false, allTimeAttendees: [] });
    }
    const state = this.meetingStates.get(eventId)!;
    
    if (state.isTerminated) {
      return { success: false, isTerminated: true };
    }

    state.signals.push({
      type: body.type,
      senderId: body.senderId,
      targetId: body.targetId,
      payload: body.payload,
      timestamp: Date.now()
    });
    return { success: true };
  }

  // 5. Get WebRTC Signals
  @Get('events/:id/meeting-state/signals/:peerId')
  getSignals(
    @Param('id') eventId: string,
    @Param('peerId') peerId: string
  ) {
    if (!this.meetingStates.has(eventId)) {
      return [];
    }
    const state = this.meetingStates.get(eventId)!;
    const now = Date.now();

    const targetSignals = state.signals.filter(s => s.targetId === peerId && now - s.timestamp < 15000);
    state.signals = state.signals.filter(s => now - s.timestamp < 30000);

    return targetSignals;
  }

  // 6. Terminate Call Room Session
  @Post('events/:id/meeting-state/terminate')
  terminateMeeting(@Param('id') eventId: string) {
    if (!this.meetingStates.has(eventId)) {
      this.meetingStates.set(eventId, { participants: [], messages: [], signals: [], isTerminated: false, allTimeAttendees: [] });
    }
    const state = this.meetingStates.get(eventId)!;
    state.isTerminated = true;
    state.participants = [];
    state.signals = [];
    state.messages.push({
      id: 'sys-' + Math.random(),
      sender: 'System Bot',
      text: `🤖 Meeting has been permanently closed by the host.`,
      isSystem: true,
      time: 'Just now'
    });
    return { success: true, isTerminated: true };
  }
}
