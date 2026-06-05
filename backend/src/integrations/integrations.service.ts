import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZorvexGateway } from '../ai/zorvex.gateway';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  constructor(
    private prisma: PrismaService,
    private zorvexGateway: ZorvexGateway
  ) {}


  // -----------------------------------------------------------------------------
  // Configs & Settings Management
  // -----------------------------------------------------------------------------

  async getConfigs(organizationId: string) {
    const configs = await this.prisma.integrationConfig.findMany({
      where: { organizationId },
    });
    
    // Fallback stub configurations list for catalog visibility
    const types = ['EMAIL', 'WHATSAPP', 'SMS', 'VOICE', 'PORTAL_FEED', 'GOOGLE_DRIVE', 'GOOGLE_MAPS'];
    const results = types.map((type) => {
      const existing = configs.find((c) => c.type === type);
      return existing || {
        id: '',
        type,
        isEnabled: false,
        credentials: {},
        organizationId,
      };
    });

    return results;
  }

  async saveConfig(organizationId: string, type: string, isEnabled: boolean, credentials: any) {
    const existing = await this.prisma.integrationConfig.findUnique({
      where: {
        organizationId_type: { organizationId, type },
      },
    });

    if (existing) {
      return this.prisma.integrationConfig.update({
        where: { id: existing.id },
        data: { isEnabled, credentials },
      });
    }

    return this.prisma.integrationConfig.create({
      data: {
        type,
        isEnabled,
        credentials,
        organizationId,
      },
    });
  }

  // -----------------------------------------------------------------------------
  // Communication Templates Management
  // -----------------------------------------------------------------------------

  async getTemplates(organizationId: string) {
    return this.prisma.communicationTemplate.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(organizationId: string, data: any) {
    const { name, subject, content, channel } = data;
    if (!name || !content || !channel) {
      throw new BadRequestException('Missing template parameters (name, content, channel)');
    }
    return this.prisma.communicationTemplate.create({
      data: {
        name,
        subject,
        content,
        channel: channel.toUpperCase(),
        organizationId,
      },
    });
  }

  // -----------------------------------------------------------------------------
  // Integration Logs Audit
  // -----------------------------------------------------------------------------

  async getLogs(organizationId: string) {
    return this.prisma.integrationLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100, // Top 100 logs
    });
  }

  async writeLog(organizationId: string, channel: string, direction: string, status: string, payload: any, errorMessage?: string | null, leadId?: string | null) {
    return this.prisma.integrationLog.create({
      data: {
        channel: channel.toUpperCase(),
        direction: direction.toUpperCase(),
        status: status.toUpperCase(),
        payload: payload || {},
        errorMessage: errorMessage || null,
        leadId: leadId || null,
        organizationId,
      },
    });
  }

  // -----------------------------------------------------------------------------
  // Messaging Dispatching Sandbox (Email, WhatsApp, SMS)
  // -----------------------------------------------------------------------------

  async compileTemplate(content: string, lead: any, agent?: any) {
    let compiled = content;
    compiled = compiled.replace(/\{\{leadName\}\}/g, lead?.name || 'Client');
    compiled = compiled.replace(/\{\{leadEmail\}\}/g, lead?.email || 'N/A');
    compiled = compiled.replace(/\{\{leadPhone\}\}/g, lead?.phone || 'N/A');
    compiled = compiled.replace(/\{\{agentName\}\}/g, agent?.firstName ? `${agent.firstName} ${agent.lastName || ''}`.trim() : 'Zorvex Representative');
    compiled = compiled.replace(/\{\{agentEmail\}\}/g, agent?.email || 'support@zorvex.com');
    return compiled;
  }

  async simulateEmail(organizationId: string, leadId: string, templateId: string, customSubject?: string, customBody?: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { assignedTo: true },
    });
    if (!lead) throw new NotFoundException('Lead profile not found');

    let subject = customSubject || 'Zorvex Real Estate';
    let body = customBody || '';

    if (templateId) {
      const template = await this.prisma.communicationTemplate.findFirst({
        where: { id: templateId, organizationId },
      });
      if (template) {
        subject = template.subject || subject;
        body = await this.compileTemplate(template.content, lead, lead.assignedTo);
      }
    }

    // Dynamic variable compilation if body is custom
    if (!templateId && body) {
      body = await this.compileTemplate(body, lead, lead.assignedTo);
    }

    const payload = {
      to: lead.email || 'unknown@client.com',
      from: lead.assignedTo?.email || 'agent@zorvex.com',
      subject,
      body,
    };

    try {
      // Stub SMTP connection: always simulate success
      await this.writeLog(organizationId, 'EMAIL', 'OUTBOUND', 'SUCCESS', payload, null, lead.id);
      
      // Push timeline activity
      await this.prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'EMAIL',
          description: `Outbound Email Sent: "${subject}". Preview: "${body.substring(0, 100)}..."`,
        },
      });

      return { success: true, message: 'Simulated email sent successfully', payload };
    } catch (err) {
      await this.writeLog(organizationId, 'EMAIL', 'OUTBOUND', 'FAILED', payload, err.message, lead.id);
      throw err;
    }
  }

  async simulateWhatsApp(organizationId: string, leadId: string, text: string, mediaUrl?: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { assignedTo: true },
    });
    if (!lead) throw new NotFoundException('Lead profile not found');

    const compiledText = await this.compileTemplate(text, lead, lead.assignedTo);
    const payload = {
      recipient: lead.phone || 'N/A',
      message: compiledText,
      mediaUrl: mediaUrl || null,
    };

    try {
      await this.writeLog(organizationId, 'WHATSAPP', 'OUTBOUND', 'SUCCESS', payload, null, lead.id);
      
      await this.prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'NOTES',
          description: `WhatsApp Message Sent: "${compiledText}" ${mediaUrl ? `with attachment (${mediaUrl})` : ''}`,
        },
      });

      return { success: true, message: 'WhatsApp message simulated successfully', payload };
    } catch (err) {
      await this.writeLog(organizationId, 'WHATSAPP', 'OUTBOUND', 'FAILED', payload, err.message, lead.id);
      throw err;
    }
  }

  async simulateSMS(organizationId: string, leadId: string, text: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { assignedTo: true },
    });
    if (!lead) throw new NotFoundException('Lead profile not found');

    const compiledText = await this.compileTemplate(text, lead, lead.assignedTo);
    const payload = {
      recipient: lead.phone || 'N/A',
      message: compiledText,
    };

    try {
      await this.writeLog(organizationId, 'SMS', 'OUTBOUND', 'SUCCESS', payload, null, lead.id);
      
      await this.prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'NOTES',
          description: `SMS Alert Sent: "${compiledText}"`,
        },
      });

      return { success: true, message: 'SMS notification simulated successfully', payload };
    } catch (err) {
      await this.writeLog(organizationId, 'SMS', 'OUTBOUND', 'FAILED', payload, err.message, lead.id);
      throw err;
    }
  }

  async getVapiPublicConfig(organizationId: string) {
    const config = await this.prisma.integrationConfig.findUnique({
      where: { organizationId_type: { organizationId, type: 'VOICE' } },
    });
    if (!config || !config.isEnabled) {
      return { isEnabled: false };
    }
    const creds = config.credentials as any || {};
    return {
      isEnabled: true,
      publicKey: creds.publicKey || null,
      assistantId: creds.assistantId || null,
    };
  }

  // -----------------------------------------------------------------------------
  // Vapi.ai Voice Call Engine Implementation
  // -----------------------------------------------------------------------------

  async triggerVapiCall(organizationId: string, leadId: string, isAutomated = false) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { assignedTo: true },
    });
    if (!lead) throw new NotFoundException('Lead profile not found');
    if (!lead.phone) throw new BadRequestException('Lead phone number is required to trigger a voice call');

    const vapiConfig = await this.prisma.integrationConfig.findUnique({
      where: { organizationId_type: { organizationId, type: 'VOICE' } },
    });

    const isLive = vapiConfig && vapiConfig.isEnabled && (vapiConfig.credentials as any)?.apiKey;
    const creds = isLive ? (vapiConfig.credentials as any) : null;

    const payload = {
      customer: {
        number: lead.phone,
        name: lead.name,
      },
      assistantId: creds?.assistantId || 'simulated-assistant-id',
      phoneNumberId: creds?.phoneNumberId || 'simulated-phone-id',
      variableValues: {
        leadName: lead.name,
        agentName: lead.assignedTo?.firstName || 'Zorvex Representative',
      },
    };

    if (isLive) {
      try {
        const response = await fetch('https://api.vapi.ai/call', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Vapi API Call Failed: ${errText}`);
        }

        const data = await response.json();
        await this.writeLog(organizationId, 'VOICE', 'OUTBOUND', 'SUCCESS', { ...payload, vapiResponse: data }, null, lead.id);
        
        await this.prisma.leadActivity.create({
          data: {
            leadId: lead.id,
            type: 'CALL',
            description: `Outbound Vapi.ai Call Triggered (Live). Call ID: ${data.id || 'Pending'}`,
          },
        });

        return { success: true, live: true, data };
      } catch (err) {
        await this.writeLog(organizationId, 'VOICE', 'OUTBOUND', 'FAILED', payload, err.message, lead.id);
        return { success: false, live: true, error: err.message };
      }
    } else {
      // SIMULATION FALLBACK
      // Generate highly realistic mock conversation
      const transcripts = [
        `[Vapi AI]: Hello, am I speaking with ${lead.name}?`,
        `[Lead]: Yes, speaking. Who is this?`,
        `[Vapi AI]: Hi, this is the AI assistant calling on behalf of Zorvex Real Estate Ecosystem. I saw you recently showed interest in our active listings in Dubai. I wanted to ask if you are actively looking to buy or rent?`,
        `[Lead]: Ah yes! I am actually looking to buy a 3-bedroom apartment or villa in Dubai Marina or Palm Jumeirah. My budget is around 4.5 million Dirhams.`,
        `[Vapi AI]: Beautiful! Palm Jumeirah is an exceptional choice. Are you planning to move in immediately, or is this an investment?`,
        `[Lead]: It is for personal use, so immediate move-in is preferred.`,
        `[Vapi AI]: Perfect! I have flagged your preference. An elite Realtor from Zorvex, ${lead.assignedTo?.firstName || 'our agent team'}, will send you exclusive, unlisted options directly to your email shortly. Does that work?`,
        `[Lead]: Yes, absolutely! Thank you.`,
        `[Vapi AI]: Wonderful, thank you for your time and have a fantastic day! Goodbye.`,
      ];

      const simulatedWebhookPayload = {
        message: {
          type: 'call-ended',
          call: {
            id: `call-sim-${Math.random().toString(36).substring(7)}`,
            customer: { number: lead.phone, name: lead.name },
            transcript: transcripts.join('\n'),
            recordingUrl: 'https://actions.google.com/sounds/v1/ambiences/morning_birds.ogg', // Realistic audio fallback
            summary: `Lead ${lead.name} is looking to BUY a 3-bedroom property in Palm Jumeirah/Dubai Marina for personal use. Budget: 4.5M AED. Warm lead, highly responsive.`,
            analysis: {
              structuredData: {
                isQualified: true,
                budget: 4500000,
                interestLevel: 'HIGH',
              },
            },
          },
        },
      };

      // In simulation mode, we immediately log the trigger
      await this.writeLog(organizationId, 'VOICE', 'OUTBOUND', 'SUCCESS', { ...payload, simulation: true }, null, lead.id);
      
      await this.prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'CALL',
          description: 'Outbound Vapi.ai Call Simulated. Virtual Agent connected.',
        },
      });

      // If triggered automatically (not from integrations frontend playground), 
      // trigger the webhook process on the backend after a small delay
      if (isAutomated) {
        setTimeout(() => {
          this.handleVapiWebhook(simulatedWebhookPayload).catch(err => {
            this.logger.error(`Automated simulated webhook trigger failed: ${err.message}`);
          });
        }, 1000);
      }

      // To make the sandbox incredibly engaging, we will return the simulated payload
      // so the frontend can display the transcript, save to DB, and play the waveform instantly!
      return { success: true, live: false, simulatedWebhookPayload };
    }
  }

  private async findLeadByPhone(cleanPhone: string) {
    const leads = await this.prisma.lead.findMany();
    return leads.find((l) => {
      if (!l.phone) return false;
      const lp = l.phone.replace(/\D/g, '');
      return cleanPhone.endsWith(lp) || lp.endsWith(cleanPhone);
    });
  }

  private async resolveOrgIdFromCall(callDetails: any): Promise<string> {
    const metadata = callDetails?.metadata || {};
    if (metadata.organizationId) return metadata.organizationId;
    if (metadata.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: metadata.leadId } });
      if (lead) return lead.organizationId;
    }
    const customerPhone = callDetails?.customer?.number;
    if (customerPhone) {
      const cleanPhone = customerPhone.replace(/\D/g, '');
      const lead = await this.findLeadByPhone(cleanPhone);
      if (lead) return lead.organizationId;
    }
    const org = await this.prisma.organization.findFirst();
    return org?.id || '';
  }

  async handleVapiWebhook(payload: any) {
    const message = payload?.message || payload;
    if (!message) {
      return { success: false, message: 'Empty payload received' };
    }

    const type = message.type;
    this.logger.log(`Received Vapi Webhook event of type: "${type}"`);

    // 1. HANDLE REAL-TIME TRANSCRIPTS
    if (type === 'transcript') {
      const callDetails = message.call;
      const customerPhone = callDetails?.customer?.number;
      if (customerPhone) {
        const cleanPhone = customerPhone.replace(/\D/g, '');
        const targetLead = await this.findLeadByPhone(cleanPhone);
        if (targetLead) {
          this.zorvexGateway.broadcastToOrganization(targetLead.organizationId, 'vapi_call_sync', {
            leadId: targetLead.id,
            role: message.role, // 'customer' or 'assistant'
            transcript: message.transcript,
            transcriptType: message.transcriptType // 'partial' or 'final'
          });
        }
      }
      return { success: true, message: 'Transcript stream processed' };
    }

    // 2. HANDLE TOOL CALLS (get_property_details, search_properties, schedule_viewing)
    if (type === 'tool-calls') {
      const results: any[] = [];
      const toolCallList = message.toolCallList || message.toolCalls || [];
      this.logger.log(`Processing ${toolCallList.length} tool calls from Vapi`);

      for (const toolCall of toolCallList) {
        const funcName = toolCall.function?.name;
        let args = toolCall.function?.arguments || {};
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            this.logger.warn(`Failed to parse tool call arguments string: ${args}`);
            args = {};
          }
        }
        const callDetails = message.call;

        if (funcName === 'get_property_details') {
          const propertyId = args.propertyId;
          this.logger.log(`Tool call 'get_property_details' for ID: ${propertyId}`);
          try {
            const property = await this.prisma.property.findUnique({
              where: { id: propertyId }
            });
            results.push({
              toolCallId: toolCall.id,
              result: property ? {
                title: property.title,
                description: property.description || '',
                type: property.type,
                listingType: property.listingType,
                price: property.price,
                location: property.location,
                bedrooms: property.bedrooms,
                bathrooms: property.bathrooms,
                areaSqft: property.areaSqft,
                amenities: property.amenities
              } : { error: 'Property not found' }
            });
          } catch (err) {
            results.push({
              toolCallId: toolCall.id,
              result: { error: `Failed to fetch property details: ${err.message}` }
            });
          }
        }

        else if (funcName === 'search_properties') {
          this.logger.log(`Tool call 'search_properties' with arguments: ${JSON.stringify(args)}`);
          try {
            const organizationId = callDetails?.metadata?.organizationId || (await this.resolveOrgIdFromCall(callDetails));
            const matches = await this.prisma.property.findMany({
              where: {
                organizationId,
                status: 'PUBLISHED',
                location: args.location ? { contains: args.location, mode: 'insensitive' } : undefined,
                listingType: args.listingType ? args.listingType.toUpperCase() : undefined,
                price: args.maxBudget ? { lte: parseFloat(args.maxBudget) } : undefined,
                bedrooms: args.bedrooms ? parseInt(args.bedrooms) : undefined,
              },
              take: 3
            });
            results.push({
              toolCallId: toolCall.id,
              result: matches.map(p => ({
                title: p.title,
                price: p.price,
                location: p.location,
                bedrooms: p.bedrooms,
                listingType: p.listingType,
                amenities: p.amenities
              }))
            });
          } catch (err) {
            results.push({
              toolCallId: toolCall.id,
              result: { error: `Search failed: ${err.message}` }
            });
          }
        }

        else if (funcName === 'schedule_viewing') {
          const { leadId, title, startTime, endTime, location, description, eventId } = args;
          this.logger.log(`Tool call 'schedule_viewing' for lead ${leadId}`);
          try {
            const organizationId = callDetails?.metadata?.organizationId || (await this.resolveOrgIdFromCall(callDetails));
            
            let targetLead: any = null;
            if (leadId && leadId !== 'lead_123') {
              targetLead = await this.prisma.lead.findUnique({
                where: { id: leadId }
              });
            }

            const start = startTime ? new Date(startTime) : new Date();
            const end = endTime ? new Date(endTime) : new Date(start.getTime() + 30 * 60 * 1000);

            // Resolve a valid createdById user to satisfy database foreign key constraint
            let createdById = targetLead?.assignedToId;
            if (!createdById) {
              const firstUser = await this.prisma.user.findFirst({
                where: { organizationId }
              });
              createdById = firstUser?.id;
            }
            if (!createdById) {
              const anyUser = await this.prisma.user.findFirst();
              createdById = anyUser?.id;
            }
            if (!createdById) {
              createdById = 'system-uuid';
            }

            const callId = callDetails?.id;
            const eventDescription = description 
              ? `${description}\n\n[VAPI_CALL_ID: ${callId || ''}]`
              : `Automated viewing booked via Renz Properties AI.\n\n[VAPI_CALL_ID: ${callId || ''}]`;

            // Try to find an existing event by eventId first, then fallback to callId description check
            let existingEvent: any = null;
            if (eventId) {
              try {
                existingEvent = await this.prisma.calendarEvent.findUnique({
                  where: { id: eventId }
                });
              } catch (e) {
                this.logger.warn(`Failed to retrieve event by eventId: ${eventId}. Falling back to callId search.`);
              }
            }

            if (!existingEvent && callId) {
              const matches = await this.prisma.calendarEvent.findMany({
                where: {
                  organizationId: targetLead?.organizationId || organizationId,
                  description: {
                    contains: `[VAPI_CALL_ID: ${callId}]`
                  }
                }
              });
              if (matches && matches.length > 0) {
                existingEvent = matches[0];
              }
            }

            let event;
            const rolesList = ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'HR', 'LOGISTICS', 'FINANCE', 'RECEPTIONIST', 'VIEWER'];
            
            if (existingEvent) {
              // Reschedule existing event
              event = await this.prisma.calendarEvent.update({
                where: { id: existingEvent.id },
                data: {
                  title: title || `Viewing with ${targetLead?.name || 'Customer'}`,
                  description: eventDescription,
                  startTime: start,
                  endTime: end,
                  location: location || 'Dubai Marina',
                  targetRoles: rolesList,
                }
              });
            } else {
              // Create new event
              event = await this.prisma.calendarEvent.create({
                data: {
                  title: title || `Viewing with ${targetLead?.name || 'Customer'}`,
                  description: eventDescription,
                  startTime: start,
                  endTime: end,
                  location: location || 'Dubai Marina',
                  isPrivate: false,
                  targetRoles: rolesList,
                  targetUserIds: targetLead?.assignedToId ? [targetLead.assignedToId] : [],
                  organizationId: targetLead?.organizationId || organizationId,
                  createdById: createdById, 
                }
              });
            }

            if (targetLead) {
              await this.prisma.leadActivity.create({
                data: {
                  leadId: targetLead.id,
                  type: 'NOTES',
                  description: existingEvent
                    ? `📅 Viewing Appointment Rescheduled via AI: "${event.title}" to ${new Date(event.startTime).toLocaleString()} at ${event.location || 'N/A'}.`
                    : `📅 Viewing Appointment Scheduled via AI: "${event.title}" on ${new Date(event.startTime).toLocaleString()} at ${event.location || 'N/A'}.`,
                }
              });

              // Trigger WebSocket calendar reload notification
              this.zorvexGateway.broadcastToOrganization(targetLead.organizationId, 'calendar_sync', {
                action: existingEvent ? 'update' : 'create',
                event
              });
            } else {
              this.zorvexGateway.broadcastToOrganization(organizationId, 'calendar_sync', {
                action: existingEvent ? 'update' : 'create',
                event
              });
            }

            results.push({
              toolCallId: toolCall.id,
              result: { status: 'success', message: existingEvent ? 'Viewing rescheduled in CRM calendar' : 'Viewing scheduled in CRM calendar', eventId: event.id }
            });
          } catch (err) {
            this.logger.error(`Failed to schedule viewing: ${err.message}`);
            results.push({
              toolCallId: toolCall.id,
              result: { error: `Scheduling failed: ${err.message}` }
            });
          }
        }
      }
      return { results };
    }

    // 3. HANDLE END OF CALL REPORT
    if (type === 'end-of-call-report' || type === 'call-ended') {
      const callDetails = message.call;
      const customerPhone = callDetails?.customer?.number;
      if (!customerPhone) {
        return { success: false, message: 'Missing customer phone number in webhook payload' };
      }

      const cleanPhone = customerPhone.replace(/\D/g, '');
      const targetLead = await this.findLeadByPhone(cleanPhone);
      if (!targetLead) {
        return { success: false, message: `Could not find any Lead matching phone: ${customerPhone}` };
      }

      const transcript = callDetails.transcript || 'No transcript available.';
      const recordingUrl = callDetails.recordingUrl || '';
      const summary = callDetails.summary || 'AI Voice call completed.';
      const isQualified = callDetails.analysis?.structuredData?.isQualified ?? true;

      const orgId = targetLead.organizationId;

      // Log inbound call completion in IntegrationsLog
      await this.writeLog(orgId, 'VOICE', 'INBOUND', 'SUCCESS', payload, null, targetLead.id);

      // Create Call Activity Timeline Log
      await this.prisma.leadActivity.create({
        data: {
          leadId: targetLead.id,
          type: 'CALL',
          description: `Vapi.ai Voice Call Completed. Recording: ${recordingUrl || 'N/A'}\n\nSummary: ${summary}\n\nTranscript Preview: "${transcript.substring(0, 150)}..."`,
        },
      });

      // Update Lead Status & Quality Score based on qualification structured details
      let updatedStatus = targetLead.status;
      let scoreBump = 0;
      if (isQualified) {
        updatedStatus = 'ENGAGED';
        scoreBump = 35;
      } else {
        updatedStatus = 'DISQUALIFIED';
        scoreBump = -20;
      }
      const newScore = Math.min(100, Math.max(0, targetLead.score + scoreBump));

      await this.prisma.lead.update({
        where: { id: targetLead.id },
        data: {
          status: updatedStatus,
          score: newScore,
        },
      });

      // Status change log entry
      await this.prisma.leadActivity.create({
        data: {
          leadId: targetLead.id,
          type: 'STATUS_CHANGE',
          description: `Lead status updated to ${updatedStatus} and AI quality score adjusted to ${newScore}% based on Vapi.ai voice analysis.`,
        },
      });

      // Send WebSocket notification trigger to frontend
      this.zorvexGateway.broadcastToOrganization(orgId, 'lead_sync', {
        action: 'update',
        lead: { id: targetLead.id, name: targetLead.name, score: newScore, status: updatedStatus }
      });

      return {
        success: true,
        message: 'Vapi call-ended report processed successfully',
        leadId: targetLead.id,
        updatedStatus,
        newScore,
      };
    }

    return { success: true, message: `Ignored unhandled webhook message type: ${type}` };
  }


  // -----------------------------------------------------------------------------
  // UAE Property Portals Feed Generator & Inbound Sync (Bayut & Dubizzle)
  // -----------------------------------------------------------------------------

  async getPortalsXmlFeed(organizationId: string) {
    const properties = await this.prisma.property.findMany({
      where: {
        organizationId,
        status: 'PUBLISHED', // Sync only active listings
      },
      include: { owner: true, assignedTo: true },
    });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rexml created_at="${new Date().toISOString()}">\n`;

    properties.forEach((prop) => {
      xml += `  <property>\n`;
      xml += `    <reference_number>Zorvex-${prop.id.substring(0, 8).toUpperCase()}</reference_number>\n`;
      xml += `    <title><![CDATA[${prop.title}]]></title>\n`;
      xml += `    <description><![CDATA[${prop.description || ''}]]></description>\n`;
      xml += `    <property_type>${prop.type}</property_type>\n`;
      xml += `    <listing_type>${prop.listingType}</listing_type>\n`;
      xml += `    <price>${prop.price}</price>\n`;
      xml += `    <location><![CDATA[${prop.location}]]></location>\n`;
      xml += `    <bedrooms>${prop.bedrooms || 0}</bedrooms>\n`;
      xml += `    <bathrooms>${prop.bathrooms || 0}</bathrooms>\n`;
      xml += `    <size>${prop.areaSqft || 0}</size>\n`;
      xml += `    <amenities>${(prop.amenities || []).join(', ')}</amenities>\n`;
      xml += `    <agent>\n`;
      xml += `      <name>${prop.assignedTo?.firstName || 'Zorvex Team'} ${prop.assignedTo?.lastName || ''}</name>\n`;
      xml += `      <email>${prop.assignedTo?.email || 'info@zorvex.com'}</email>\n`;
      xml += `    </agent>\n`;
      xml += `    <owner>\n`;
      xml += `      <name><![CDATA[${prop.owner?.name || 'Private landlord'}]]></name>\n`;
      xml += `      <phone>${prop.owner?.phone || ''}</phone>\n`;
      xml += `    </owner>\n`;
      xml += `  </property>\n`;
    });

    xml += `</rexml>\n`;
    return xml;
  }

  async simulateIncomingPortalLead(organizationId: string, portal: string, leadData: any) {
    const { name, email, phone, propertyRef, message } = leadData;

    // Create a new Lead inside the CRM representing a portal referral
    // LeadsModule core logic will trigger automated round-robin agent assignment!
    const leadPayload = {
      name,
      email,
      phone,
      source: portal.toUpperCase(), // BAYUT or DUBIZZLE
      description: `Inbound Portal Interest on Reference: ${propertyRef || 'General'}. Client Message: "${message || ''}"`,
      status: 'NEW',
    };

    // Auto scoring algorithm
    let score = 30; // High baseline because portal leads have high intent
    if (phone) score += 30;
    if (email) score += 15;
    if (message && message.length > 10) score += 25;
    score = Math.min(100, score);

    // Auto round-robin active agent query
    const agents = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: { in: ['AGENT', 'SALES_MANAGER', 'ADMIN'] },
        isActive: true,
      },
      include: { assignedLeads: true },
    });

    let assignedToId: string | null = null;
    if (agents.length > 0) {
      const sorted = agents.sort((a, b) => a.assignedLeads.length - b.assignedLeads.length);
      assignedToId = sorted[0].id;
    }

    const newLead = await this.prisma.lead.create({
      data: {
        name,
        email,
        phone,
        source: portal.toUpperCase(),
        status: 'NEW',
        score,
        organizationId,
        assignedToId,
      },
    });

    // 1. Log transaction
    await this.writeLog(organizationId, 'PORTAL', 'INBOUND', 'SUCCESS', { portal, leadData, assignedToId }, null, newLead.id);

    // 2. Log Initial Lead Timeline log
    await this.prisma.leadActivity.create({
      data: {
        leadId: newLead.id,
        type: 'NOTES',
        description: `Lead synced directly from UAE portal: ${portal.toUpperCase()} referencing: ${propertyRef || 'General'}. AI scoring evaluated at: ${score}%. Assigned to Agent: ${agents.find(a => a.id === assignedToId)?.firstName || 'Office Pool'}.`,
      },
    });

    // Auto-trigger Vapi Call if integration is active
    this.triggerVapiCall(organizationId, newLead.id, true).catch(err => {
      this.logger.error(`Automated Vapi outbound trigger failed: ${err.message}`);
    });

    return {
      success: true,
      message: `Lead successfully injected from ${portal}`,
      lead: newLead,
    };
  }

  // -----------------------------------------------------------------------------
  // Google Drive & Google Maps Geocoding Simulations
  // -----------------------------------------------------------------------------

  async simulateDriveSync(organizationId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!document) throw new NotFoundException('Document profile not found');

    const payload = {
      fileId: document.id,
      fileName: document.name,
      category: document.category,
      driveFolder: `Zorvex_ERP_SYNC/${document.category.toUpperCase()}`,
    };

    try {
      await this.writeLog(organizationId, 'GOOGLE_DRIVE', 'OUTBOUND', 'SUCCESS', payload);
      return { success: true, message: 'File synced to Google Drive folder successfully', payload };
    } catch (err) {
      await this.writeLog(organizationId, 'GOOGLE_DRIVE', 'OUTBOUND', 'FAILED', payload, err.message);
      throw err;
    }
  }

  async simulateMapsGeocoding(organizationId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });
    if (!property) throw new NotFoundException('Property profile not found');

    // Simulate geocoding Palm Jumeirah or Marina properties
    const loc = property.location.toLowerCase();
    let coordinates = { lat: 25.2048, lng: 55.2708 }; // Dubai Center default

    if (loc.includes('palm jumeirah')) {
      coordinates = { lat: 25.1124, lng: 55.1390 };
    } else if (loc.includes('marina')) {
      coordinates = { lat: 25.0819, lng: 55.1367 };
    } else if (loc.includes('downtown') || loc.includes('khalifa')) {
      coordinates = { lat: 25.1972, lng: 55.2744 };
    }

    const payload = {
      address: property.location,
      coordinates,
      formattedAddress: `${property.location}, Dubai, United Arab Emirates`,
    };

    try {
      await this.writeLog(organizationId, 'GOOGLE_MAPS', 'OUTBOUND', 'SUCCESS', payload);
      return { success: true, coordinates, payload };
    } catch (err) {
      await this.writeLog(organizationId, 'GOOGLE_MAPS', 'OUTBOUND', 'FAILED', payload, err.message);
      throw err;
    }
  }
}
