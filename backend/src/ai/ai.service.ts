import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';

// Bulletproof require for pdf-parse to avoid TypeScript build issues
const pdfParser = require('pdf-parse');

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService
  ) {}

  // -----------------------------------------------------------------------------
  // Helpers: API Key Retrieval
  // -----------------------------------------------------------------------------
  private getGeminiKey(): string {
    const key = process.env.GEMINI_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  private getOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  // -----------------------------------------------------------------------------
  // Embeddings Generator (Gemini Primary, OpenAI Fallback)
  // -----------------------------------------------------------------------------
  async generateEmbedding(text: string): Promise<number[]> {
    const geminiKey = this.getGeminiKey();
    const openaiKey = this.getOpenAIKey();

    if (!text.trim()) {
      return new Array(3072).fill(0); // Return empty dummy vector if text empty
    }

    // Try Gemini gemini-embedding-001 first, falling back to gemini-embedding-2
    if (geminiKey) {
      for (const model of ['gemini-embedding-001', 'gemini-embedding-2']) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: `models/${model}`,
                content: { parts: [{ text }] },
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data?.embedding?.values) {
              return data.embedding.values;
            }
          } else {
            this.logger.warn(`Gemini embedding with ${model} failed with status ${response.status}.`);
          }
        } catch (err) {
          this.logger.warn(`Gemini embedding error with ${model}: ${err.message}`);
        }
      }
    }

    // Fallback to OpenAI text-embedding-3-small
    if (openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            input: text,
            model: 'text-embedding-3-small',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.data?.[0]?.embedding) {
            return data.data[0].embedding;
          }
        }
      } catch (err) {
        this.logger.error(`OpenAI embedding fallback failed: ${err.message}`);
      }
    }

    // If both failed, return a basic dummy embedding to prevent crash
    this.logger.error('Failed to generate embeddings via both Gemini and OpenAI APIs.');
    return new Array(3072).fill(0);
  }

  // -----------------------------------------------------------------------------
  // PDF Parsing & Text Chunking Utilities
  // -----------------------------------------------------------------------------
  async parsePdf(fileBuffer: Buffer): Promise<string> {
    try {
      const data = await pdfParser(fileBuffer);
      return data.text || '';
    } catch (err) {
      this.logger.error(`Failed to parse PDF document: ${err.message}`);
      throw new Error(`PDF Parsing Error: ${err.message}`);
    }
  }

  chunkText(text: string, chunkSize = 600, overlap = 100): string[] {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (!cleanText) return [];

    const chunks: string[] = [];
    let index = 0;

    while (index < cleanText.length) {
      let end = index + chunkSize;
      if (end >= cleanText.length) {
        chunks.push(cleanText.substring(index));
        break;
      }

      // Try to end chunk at a space to avoid cutting words
      const lastSpace = cleanText.lastIndexOf(' ', end);
      if (lastSpace > index + chunkSize / 2) {
        end = lastSpace;
      }

      chunks.push(cleanText.substring(index, end));
      index = end - overlap; // Sliding window overlap
    }

    return chunks;
  }

  // Cosine Similarity calculation (JS math)
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    // If dimensions are different, adjust or pad (Gemini returns 768, OpenAI text-embedding-3-small 1536)
    // We adjust both to the minimum length to make it completely safe and robust
    const minLength = Math.min(vecA.length, vecB.length);
    if (minLength === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLength; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // -----------------------------------------------------------------------------
  // Unstructured RAG Search
  // -----------------------------------------------------------------------------
  async searchUnstructuredKnowledge(
    query: string,
    organizationId: string,
    limit = 5
  ): Promise<any[]> {
    try {
      const queryVector = await this.generateEmbedding(query);
      
      // Fetch all chunks for the organization from the DB
      const chunks = await this.prisma.aiDocumentChunk.findMany({
        where: {
          document: {
            organizationId,
          },
        },
        include: {
          document: {
            select: { id: true, name: true, fileType: true },
          },
        },
      });

      // Calculate similarities in memory (highly efficient for thousands of chunks, zero pgvector installation issues)
      const scoredChunks = chunks
        .map((chunk) => {
          const score = this.cosineSimilarity(queryVector, chunk.embedding);
          return {
            id: chunk.id,
            content: chunk.content,
            documentId: chunk.documentId,
            documentName: chunk.document.name,
            fileType: chunk.document.fileType,
            score,
          };
        })
        .filter((chunk) => chunk.score > 0.3) // Similarity threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scoredChunks;
    } catch (err) {
      this.logger.error(`Error in unstructured similarity search: ${err.message}`);
      return [];
    }
  }

  // -----------------------------------------------------------------------------
  // Resilient LLM Text Generation with Fallback (Gemini API with OpenAI backup)
  // -----------------------------------------------------------------------------
  async callLLM(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): Promise<string> {
    const geminiKey = this.getGeminiKey();
    const openaiKey = this.getOpenAIKey();

    // 1. Try Google Gemini first, falling back across the flash suite to bypass 429 rate limits
    if (geminiKey) {
      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite']) {
        try {
          // Construct standard contents format with optional history and systemInstruction
          const contents: any[] = [];
          
          // Map history to Gemini API format
          for (const h of history) {
            contents.push({
              role: h.role === 'user' ? 'user' : 'model',
              parts: [{ text: h.content }],
            });
          }

          // Add user prompt
          contents.push({
            role: 'user',
            parts: [{ text: userPrompt }],
          });

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents,
                systemInstruction: {
                  parts: [{ text: systemPrompt }],
                },
                generationConfig: {
                  temperature: 0.1, // High determinism for analytical queries
                },
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              return text;
            }
          } else {
            this.logger.warn(`Gemini generation with ${model} failed with status ${response.status}. trying next...`);
          }
        } catch (err) {
          this.logger.warn(`Gemini generation error with ${model}: ${err.message}. trying next...`);
        }
      }
    }

    // 2. Fallback to OpenAI GPT-4o-mini
    if (openaiKey) {
      try {
        const messages = [{ role: 'system', content: systemPrompt }];

        // Map history to OpenAI format
        for (const h of history) {
          messages.push({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content,
          });
        }

        // Add user prompt
        messages.push({ role: 'user', content: userPrompt });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.1,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) {
            return text;
          }
        }
      } catch (err) {
        this.logger.error(`OpenAI generation fallback failed: ${err.message}`);
      }
    }

    // 3. Complete failure backup response
    return "🤖 System Alert: RENS AI is currently experiencing API connection delays. Please verify your keys and network status.";
  }

  // -----------------------------------------------------------------------------
  // Structured Database Tools (Live Postgres fetching)
  // -----------------------------------------------------------------------------
  private checkToolAuthorization(toolName: string, userRole: string): boolean {
    const role = userRole || 'VIEWER';
    
    // 1. Finance aggregates (salaries, monthly payroll balance)
    if (toolName === 'getFinanceAnalytics') {
      return ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(role);
    }

    // 2. Client databases
    if (toolName === 'searchClients') {
      return ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST'].includes(role);
    }

    // 3. Logistics aggregates (vehicles, fleet status, maintenance costs)
    if (toolName === 'getLogisticsAnalytics') {
      return ['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(role);
    }

    // 4. Leave requests (everyone can query, but filtered to their own in the execution block if unauthorized to see all)
    if (toolName === 'getLeaveRequests') {
      return true;
    }
    
    return true; 
  }

  async executeDatabaseTool(
    toolName: string,
    params: any,
    organizationId: string,
    userRole: string,
    userId: string
  ): Promise<any> {
    this.logger.log(`Executing live Postgres tool: ${toolName} for role ${userRole}`);
    
    const isAuthorized = this.checkToolAuthorization(toolName, userRole);
    if (!isAuthorized) {
      this.logger.warn(`Security Warning: User with role ${userRole} attempted unauthorized execution of tool ${toolName}`);
      return { 
        error: `ACCESS_DENIED`,
        message: `Clearance Required: Your user profile (${userRole}) is not cleared to access secure finance databases.`
      };
    }

    try {
      switch (toolName) {
        case 'searchProperties': {
          const { location, minPrice, maxPrice, bedrooms, bathrooms, type, listingType, status } = params || {};
          return this.prisma.property.findMany({
            where: {
              organizationId,
              status: status || undefined,
              type: type || undefined,
              listingType: listingType || undefined,
              location: location ? { contains: location, mode: 'insensitive' } : undefined,
              price: (minPrice || maxPrice) ? {
                gte: minPrice ? parseFloat(minPrice) : undefined,
                lte: maxPrice ? parseFloat(maxPrice) : undefined,
              } : undefined,
              bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
              bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
            },
            include: {
              owner: {
                select: { name: true, phone: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
          });
        }

        case 'searchClients': {
          const { name, budget, preferences, type } = params || {};
          return this.prisma.client.findMany({
            where: {
              organizationId,
              type: type || undefined,
              name: name ? { contains: name, mode: 'insensitive' } : undefined,
              budget: budget ? { lte: parseFloat(budget) } : undefined,
              preferences: preferences ? { contains: preferences, mode: 'insensitive' } : undefined,
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
          });
        }

        case 'searchEmployees': {
          const { name, designation, department } = params || {};
          
          const canViewSalaries = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(userRole);

          const employees = await this.prisma.employeeProfile.findMany({
            where: {
              organizationId,
              designation: designation ? { contains: designation, mode: 'insensitive' } : undefined,
              department: department ? { contains: department, mode: 'insensitive' } : undefined,
              user: name ? {
                OR: [
                  { firstName: { contains: name, mode: 'insensitive' } },
                  { lastName: { contains: name, mode: 'insensitive' } },
                ],
              } : undefined,
            },
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, role: true },
              },
            },
            take: 10,
          });

          // Mask salaries for unauthorized roles (unless they query their own profile)
          return employees.map(emp => {
            const mapped: any = {
              id: emp.id,
              userId: emp.userId,
              designation: emp.designation,
              department: emp.department,
              joiningDate: emp.joiningDate,
              status: emp.status,
              user: emp.user
            };
            if (canViewSalaries || emp.userId === userId) {
              mapped.salary = emp.salary;
            } else {
              mapped.salary = "CONFIDENTIAL (Access Denied)";
            }
            return mapped;
          });
        }

        case 'getFinanceAnalytics': {
          // Aggregate payroll salaries for organization
          const payrolls = await this.prisma.payroll.findMany({
            where: {
              employeeProfile: {
                organizationId,
              },
            },
            orderBy: { month: 'desc' },
            take: 30, // Aggregate recent payroll cycles
          });

          const totalNetSalary = payrolls.reduce((acc, curr) => acc + curr.netSalary, 0);
          const totalBaseSalary = payrolls.reduce((acc, curr) => acc + curr.baseSalary, 0);
          const totalAllowances = payrolls.reduce((acc, curr) => acc + curr.allowances, 0);
          const totalDeductions = payrolls.reduce((acc, curr) => acc + curr.deductions, 0);

          // Get salaries grouped by designations
          const employeeSalaries = await this.prisma.employeeProfile.findMany({
            where: { organizationId },
            include: { user: { select: { firstName: true } } },
          });

          return {
            recentPayrollCount: payrolls.length,
            totals: {
              netSalary: totalNetSalary,
              baseSalary: totalBaseSalary,
              allowances: totalAllowances,
              deductions: totalDeductions,
            },
            staffDetails: employeeSalaries.map((emp) => ({
              name: emp.user.firstName,
              designation: emp.designation,
              salary: emp.salary || 0,
            })),
          };
        }

        case 'getTasksBoard': {
          const { status } = params || {};
          return this.prisma.task.findMany({
            where: {
              organizationId,
              status: status || undefined,
            },
            include: {
              assignedTo: {
                select: { firstName: true, email: true },
              },
            },
            orderBy: { dueDate: 'asc' },
            take: 15,
          });
        }

        case 'getMeetingsAnalytics': {
          const { type } = params || {};
          let locationFilter: any = {};

          if (type === 'VIRTUAL') {
            locationFilter = {
              OR: [
                { location: { contains: 'http', mode: 'insensitive' } },
                { location: { contains: 'virtual', mode: 'insensitive' } }
              ]
            };
          } else if (type === 'PHYSICAL') {
            locationFilter = {
              NOT: [
                { location: { contains: 'http', mode: 'insensitive' } },
                { location: { contains: 'virtual', mode: 'insensitive' } }
              ]
            };
          }

          // Fetch calendar events in organization
          const events = await this.prisma.calendarEvent.findMany({
            where: { 
              organizationId,
              ...locationFilter
            },
            include: {
              createdBy: {
                select: { id: true, firstName: true, lastName: true, role: true, email: true }
              }
            },
            orderBy: { startTime: 'desc' },
            take: 20
          });

          const analyzedMeetings: any[] = [];

          for (const event of events) {
            if (event.isPrivate) continue;

            const state = this.calendarService.meetingStates.get(event.id) || {
              participants: [] as any[],
              allTimeAttendees: [] as any[],
              messages: [] as any[],
              isTerminated: false
            };

            // Resolve target users invited to this meeting
            const invitees = await this.prisma.user.findMany({
              where: {
                organizationId,
                OR: [
                  { id: { in: event.targetUserIds } },
                  { role: { in: event.targetRoles as any } }
                ]
              },
              select: { id: true, firstName: true, lastName: true, role: true }
            });

            // Calculate who was present
            const present = state.allTimeAttendees.map(a => ({
              id: a.id,
              name: a.name,
              role: a.role,
              joinedAt: new Date(a.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }));

            // Calculate who was absent
            const absent = invitees
              .filter(inv => !state.allTimeAttendees.some(a => a.id === inv.id))
              .map(inv => ({
                id: inv.id,
                name: `${inv.firstName} ${inv.lastName || ''}`.trim(),
                role: inv.role
              }));

            analyzedMeetings.push({
              id: event.id,
              title: event.title,
              description: event.description,
              startTime: event.startTime,
              endTime: event.endTime,
              location: event.location,
              organizer: `${event.createdBy?.firstName || ''} ${event.createdBy?.lastName || ''}`.trim(),
              organizerRole: event.createdBy?.role,
              isTerminated: state.isTerminated,
              attendanceSummary: {
                totalInvited: invitees.length,
                totalAttended: present.length,
                totalAbsent: absent.length
              },
              attendedParticipants: present,
              absentParticipants: absent,
              chatMessagesCount: state.messages.length
            });
          }

          return analyzedMeetings;
        }

        case 'getLeaveRequests': {
          const { name, status } = params || {};
          
          const canViewAllLeaves = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(userRole);

          // If authorized to view all, optionally search by employee name.
          // Otherwise, STRICTLY ignore name and filter by the requester's own userId!
          const whereClause: any = {
            employeeProfile: {
              organizationId,
            },
            status: status || undefined
          };

          if (canViewAllLeaves) {
            if (name) {
              whereClause.employeeProfile.user = {
                OR: [
                  { firstName: { contains: name, mode: 'insensitive' } },
                  { lastName: { contains: name, mode: 'insensitive' } },
                ]
              };
            }
          } else {
            whereClause.employeeProfile.userId = userId;
          }

          const leaves = await this.prisma.leaveRequest.findMany({
            where: whereClause,
            include: {
              employeeProfile: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true, role: true, email: true }
                  }
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 15,
          });

          return leaves.map(l => ({
            id: l.id,
            startDate: l.startDate,
            endDate: l.endDate,
            type: l.type,
            status: l.status,
            reason: l.reason,
            approvedAt: l.approvedAt,
            employeeName: `${l.employeeProfile.user.firstName} ${l.employeeProfile.user.lastName || ''}`.trim(),
            employeeRole: l.employeeProfile.user.role,
            employeeEmail: l.employeeProfile.user.email
          }));
        }

        case 'getLogisticsAnalytics': {
          if (!['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(userRole)) {
            return {
              error: `ACCESS_DENIED`,
              message: `Clearance Required: Your user profile (${userRole}) is not cleared to access secure logistics databases.`
            };
          }

          const vehicles = await this.prisma.vehicle.findMany({
            where: { organizationId },
            include: {
              maintenanceRequests: true
            }
          });

          const schedules = await this.prisma.logisticsSchedule.findMany({
            where: {
              vehicle: { organizationId }
            },
            include: {
              vehicle: { select: { modelName: true, plateNumber: true } },
              driver: {
                include: {
                  employeeProfile: {
                    include: {
                      user: { select: { firstName: true, lastName: true } }
                    }
                  }
                }
              }
            },
            orderBy: { visitDate: 'desc' },
            take: 15
          });

          return {
            vehiclesCount: vehicles.length,
            vehicles: vehicles.map(v => ({
              id: v.id,
              modelName: v.modelName,
              plateNumber: v.plateNumber,
              status: v.status,
              maintenanceCount: v.maintenanceRequests.length,
              maintenanceCostTotal: v.maintenanceRequests.reduce((sum, req) => sum + (req.cost || 0), 0),
              maintenanceRequests: v.maintenanceRequests.map(r => ({
                description: r.description,
                cost: r.cost,
                status: r.status,
                requestDate: r.requestDate
              }))
            })),
            schedules: schedules.map(s => ({
              id: s.id,
              visitDate: s.visitDate,
              pickupLocation: s.pickupLocation,
              dropLocation: s.dropLocation,
              status: s.status,
              vehicle: s.vehicle ? `${s.vehicle.modelName} (${s.vehicle.plateNumber})` : 'Unassigned',
              driver: s.driver ? `${s.driver.employeeProfile.user.firstName} ${s.driver.employeeProfile.user.lastName || ''}`.trim() : 'Unassigned'
            }))
          };
        }

        default:
          return null;
      }
    } catch (err) {
      this.logger.error(`Error executing tool ${toolName}: ${err.message}`);
      return { error: `Database tool execution error: ${err.message}` };
    }
  }

  // -----------------------------------------------------------------------------
  // Main Cognitive Chat Pipeline (RAG + SQL Tools)
  // -----------------------------------------------------------------------------
  async chat(
    userMessage: string,
    userId: string,
    organizationId: string,
    userRole: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): Promise<any> {
    try {
      // Step A: Search unstructured knowledge base (RAG)
      const matchingChunks = await this.searchUnstructuredKnowledge(userMessage, organizationId, 4);
      
      const documentContext = matchingChunks.length > 0
        ? `UNSTRUCTURED KNOWLEDGE DOCUMENTS (RAG):\n${matchingChunks
            .map((c, i) => `[Doc ${i + 1}]: ${c.content} (Source: ${c.documentName})`)
            .join('\n\n')}`
        : 'No unstructured knowledge documents relevant to this query found.';

      // Step B: Set up Cognitive system prompt describing capabilities, user role, and tools
      const systemPrompt = `You are the RENS ERP Intelligent AI Chatbot Assistant.
Your goal is to provide exceptional, professional support to employees, utilizing live database insights and uploaded company manuals/policies.

CURRENT USER SECURITY CONTEXT:
- Logged-in User ID: ${userId}
- Security Role: ${userRole}

STRICT ROLE-BASED ACCESS CONTROL (AI-RBAC) POLICY:
1. Access to sensitive records is strictly cleared based on the Security Role (${userRole}):
   - Finance aggregates, payroll, or individual salaries: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", "HR", and "FINANCE". (All other roles are NOT cleared!)
   - Leaves and attendance details of OTHER employees: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", and "HR". (All other roles are NOT cleared!)
   - A user's OWN leaves, profile, and tasks: EVERY role is fully cleared to query their own info! (e.g. an AGENT can check their own leaves, but NOT another employee's leaves).
   - Logistics fleet details, plate numbers, active schedules, or maintenance costs: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", and "LOGISTICS". (All other roles are NOT cleared!)
2. CLEARANCE CHECKS:
   - If the user asks for details that are NOT cleared for the Security Role (${userRole}), you MUST decline immediately in natural text without calling any tools!
   - Decline politely in Roman Urdu / English coworker tone: "Bhai, aapka current profile as ${userRole} cleared nahi hai is secure database ko access karne ke liye. Please standard menu ya administrator se rabta karein."
   - Do NOT output any tool JSON block if the request is not cleared! Decline it immediately in natural text.




CONVERSATIONAL RULES:
1. Respond completely like a friendly, professional human coworker/assistant. AVOID cold robotic language. Use warm, natural, and helpful phrasing (e.g. "Bhai", "Ji bilkul", "Maine check kiya hai", "Ye rahi details", "Aap dekh sakte hain" when responding in Roman Urdu).
2. CONCISE & DIRECT: Only answer what the user asked. If they asked about online meetings, do NOT mention physical meetings or overload them with excessive, unrelated details. Keep details simple, clear, and highly focused.
3. PREMIUM VISUALS: Avoid ugly robotic markdown templates (e.g. do NOT write "* **Title:** Normal" or bold headers on every single item). Instead, write in a clean, beautifully spaced human layout with elegant line breaks and clean, meaningful emojis (📅, 👤, 📍, 👥, 🚫). Make the layout visually premium and easy on the eyes.
4. FOLLOW-UP QUESTIONS: If the user asks a follow-up question (e.g., "Absent kaun tha?" or "Host kaun tha?") and the relevant data is already present in the previous conversation history, do NOT call any database tools again! Simply answer their question directly from the conversation history naturally.

You have access to live database query tools to answer questions about Properties, CRM Clients, Employees, Finances, Tasks, Meetings, Leaves, and Logistics.
If a user query requires searching these areas, you MUST invoke a database tool by outputting a JSON command block.
CRITICAL: If you want to use a tool, your entire response MUST consist of a single JSON block, exactly like this format:
{"tool": "TOOL_NAME", "params": { ... }}

Do not output any additional conversational text or markdown before or after the JSON block if you are using a tool!

Available live tools:
1. "searchProperties":
   Search properties listing database.
   Params: {"location": string (optional), "minPrice": number (optional), "maxPrice": number (optional), "bedrooms": number (optional), "bathrooms": number (optional), "type": "APARTMENT"|"VILLA"|"COMMERCIAL" (optional), "listingType": "RENT"|"SALE" (optional), "status": "AVAILABLE"|"SOLD"|"RENTED" (optional)}
2. "searchClients":
   Search active CRM buyers, sellers, or investors.
   Params: {"name": string (optional), "budget": number (optional), "preferences": string (optional), "type": "BUYER"|"SELLER"|"INVESTOR" (optional)}
3. "searchEmployees":
   Search employee directories, profiles, designations, and departments.
   Params: {"name": string (optional), "designation": string (optional), "department": string (optional)}
4. "getFinanceAnalytics":
   Calculates total monthly payroll budget, total base salaries paid, allowances, deductions, and individual staff salaries.
   Params: {} (no params required)
5. "getTasksBoard":
   Search operations and logistics tasks.
   Params: {"status": "PENDING"|"IN_PROGRESS"|"COMPLETED" (optional)}
6. "getMeetingsAnalytics":
   Analyze virtual online meetings, corporate calendar events, hosts/organizers, all-time attendees, and lists of absent or present invitees. Use this to find who created a meeting, who attended it, how many joined, and who was absent.
   Params: {"type": "VIRTUAL" | "PHYSICAL" (optional - use VIRTUAL if the user specifically asks about online/virtual meetings, use PHYSICAL if they ask about in-person/physical meetings)}
7. "getLeaveRequests":
   Retrieves employee leave requests, date ranges, leave type (SICK, CASUAL, ANNUAL, UNPAID), and status (PENDING, APPROVED, REJECTED). Standard users will only retrieve their own. HR/Admin can query anyone by name.
   Params: {"name": string (optional - works only for HR/Admin), "status": "PENDING"|"APPROVED"|"REJECTED" (optional)}
8. "getLogisticsAnalytics":
   Retrieves vehicle fleet details, plate numbers, active logistics schedules (visits, drops, deliveries), drivers, and vehicle maintenance requests with costs.
   Params: {} (no params required)

If the question CANNOT be answered by database tools, or the tool has already run, answer using:
- The context from retrieved unstructured documents (RAG) attached below.
- General ERP operational knowledge.

RESOURCES:
${documentContext}`;

      // Step C: LLM decision round
      const initialLLMResponse = await this.callLLM(systemPrompt, userMessage, history);
      
      let toolExecuted: string | null = null;
      let toolData: any = null;
      let finalResponseText = initialLLMResponse;

      // Check if LLM requested a tool (look for JSON match)
      const cleanResponse = initialLLMResponse.trim();
      if (cleanResponse.startsWith('{') && cleanResponse.endsWith('}')) {
        try {
          const parsed = JSON.parse(cleanResponse);
          if (parsed.tool) {
            toolExecuted = parsed.tool;
            // Execute the prisma database queries
            toolData = await this.executeDatabaseTool(parsed.tool, parsed.params, organizationId, userRole, userId);
            
            // Re-prompt LLM with the live database results
            const databaseFeedPrompt = `The user asked: "${userMessage}"
You triggered the tool "${toolExecuted}" and retrieved the following live real-time records from Postgres:
${JSON.stringify(toolData, null, 2)}

Provide a beautiful, friendly, completely human-like natural language response summarizing these results.
CRITICAL STYLE & FORMATTING INSTRUCTIONS:
1. CONCISE & DIRECT: Do NOT over-detail. Only answer exactly what the user asked about. If they only asked about online meetings, do NOT output details for physical meetings. Summarize the key values in a brief, premium way.
2. Speak completely like a warm, supportive, and friendly human colleague. Do NOT speak like a cold AI machine.
3. If responding in Roman Urdu, use a very natural human conversational tone (e.g., "Ji bhai, maine database check kiya hai...", "Ye rahi meeting ki details...", "Is meeting me ye log present the...").
4. AVOID cold robotic bullet dumps or double asterisks on every single item (e.g. do NOT do '* **Title:** Normal'). Instead, present details in a premium, beautifully spaced, clean human-style layout. Use elegant spacing, emojis (like 📅, 👤, 📍, 👥, 🚫), and friendly bullet highlights. Make the text look highly readable and visually premium.
5. If the results contain properties, list their titles, locations, and prices nicely.
6. If the results contain employees or salaries, summarize their payroll metrics.
7. If the results contain meetings or attendees, summarize who hosted them, who was present, who was absent, and lists of participants nicely.
8. If no records are found, inform the user politely.

Make sure to answer in the same language as the user (Roman Urdu or English)!`;

            finalResponseText = await this.callLLM(systemPrompt, databaseFeedPrompt, history);
          }
        } catch (e) {
          this.logger.error(`Failed to parse tool execution JSON: ${e.message}. Raw: ${cleanResponse}`);
        }
      }

      // Format citations for the client
      const citations = matchingChunks.map((chunk) => ({
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        fileType: chunk.fileType,
      }));

      return {
        response: finalResponseText,
        toolExecuted,
        toolData,
        citations,
      };
    } catch (err) {
      this.logger.error(`Error in Chat Pipeline: ${err.message}`);
      return {
        response: '🤖 AI Assistant has encountered an operation pipeline conflict. Let\'s try rephrasing your prompt.',
        toolExecuted: null,
        toolData: null,
        citations: [],
      };
    }
  }
}
