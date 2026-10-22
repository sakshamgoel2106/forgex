import type { IDataStore } from '../db/dataStore.interface.js';
import type { ITextEmbeddingProvider } from '../ai/ai.interface.js';
import type { IVectorStoreAdapter } from '../vector/vectorStore.interface.js';
import type {
  IMultimodalGenerationProvider,
  IRerankingProvider,
  GenerationEvidenceItem,
  RerankCandidate,
} from '../ai/ai.interface.js';
import type {
  RAGQueryRequest,
  RAGQueryResponse,
  Citation,
  CopilotMessage,
  QuestionHandlingMode,
  SpecialistTicket,
  TicketAssignmentStatus,
  MaintenanceRecord,
  RecurringFaultAnalysis,
  Plant,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';
import { PromptDefenseService } from '../ai/promptSanitizer.js';
import { config } from '../config/env.js';
import { SecurityEventService } from './securityEvent.service.js';
import { SpecialistRoutingService } from './specialistRouting.service.js';
import { HistoricalFaultService } from './historicalFaultService.js';

export interface RAGContext {
  organizationId: string;
  userId: string;
  userRole?: string;
  userEmail?: string;
  userAssignedPlantIds?: string[];
  disclosurePolicy?: string;
}

export class RAGQueryEngine {
  private securityService: SecurityEventService;
  private routingService: SpecialistRoutingService;
  private historicalFaultService: HistoricalFaultService;

  constructor(
    private dataStore: IDataStore,
    private embeddingProvider: ITextEmbeddingProvider,
    private vectorStore: IVectorStoreAdapter,
    private generationProvider: IMultimodalGenerationProvider,
    private rerankingProvider: IRerankingProvider,
    private collectionName = process.env.QDRANT_COLLECTION || 'forgex_knowledge',
    securityService?: SecurityEventService,
    historicalFaultService?: HistoricalFaultService
  ) {
    this.securityService = securityService || new SecurityEventService(this.dataStore);
    this.routingService = new SpecialistRoutingService(this.dataStore);
    this.historicalFaultService = historicalFaultService || new HistoricalFaultService(this.dataStore);
  }

  public async query(
    request: RAGQueryRequest,
    context: RAGContext
  ): Promise<RAGQueryResponse> {
    const { organizationId, userId, userRole } = context;
    const { plantId, assetId, query, conversationId, imageUrl, topK = 5 } = request;

    // 0a. Backend-enforced plant scope and organization validation
    let plant: Plant | null = null;
    if (plantId && plantId !== 'GENERAL') {
      plant = await this.dataStore.getPlantById(organizationId, plantId);
      if (!plant) {
        await this.securityService.recordSecurityEvent({
          organizationId,
          actorUserId: userId,
          actorEmail: context.userEmail,
          actorRole: userRole,
          category: 'CROSS_PLANT_ACCESS',
          action: 'PLANT_ACCESS_ATTEMPT',
          resourceCategory: 'PLANT',
          resourceId: plantId,
          decision: 'DENIED',
          policyReasonCode: 'PLANT_NOT_IN_ORGANIZATION',
          severity: 'MEDIUM',
          isBenignInquiry: true,
        });
        throw new Error(`Unauthorized or invalid plant: Plant '${plantId}' does not belong to organization.`);
      }

      if (
        context.userAssignedPlantIds &&
        context.userAssignedPlantIds.length > 0 &&
        !context.userAssignedPlantIds.includes(plant.id)
      ) {
        await this.securityService.recordSecurityEvent({
          organizationId,
          actorUserId: userId,
          actorEmail: context.userEmail,
          actorRole: userRole,
          category: 'CROSS_PLANT_ACCESS',
          action: 'UNASSIGNED_PLANT_ACCESS_BLOCKED',
          resourceCategory: 'PLANT',
          resourceId: plant.id,
          decision: 'DENIED',
          policyReasonCode: 'CROSS_PLANT_DENIED',
          severity: 'MEDIUM',
          isBenignInquiry: true,
        });
        throw new Error(`Unauthorized: User is not assigned to plant '${plantId}'.`);
      }
    }

    // 0. Classify Intent & Evaluate Security Policy
    let isSafetyCritical =
      /\b(hazardous|danger|dangerous|arc flash|toxic|loto|lockout|high pressure|emergency shutdown|radiation|chemical leak|explosion|lethal|critical failure|overheat|overheating|abnormal vibration)\b/i.test(
        query
      );

    const intent = this.securityService.classifyIntent(query, {
      plantId,
      assetId: assetId ?? undefined,
      isSafetyCritical,
    });

    const policyEval = this.securityService.evaluateCopilotPolicy({
      organizationId,
      userRole,
      plantId,
      userAssignedPlantIds: context.userAssignedPlantIds,
      intent,
    });

    if (!policyEval.allowed) {
      await this.securityService.recordSecurityEvent({
        organizationId,
        actorUserId: userId,
        actorEmail: context.userEmail,
        actorRole: userRole,
        category:
          policyEval.policyReasonCode === 'CROSS_PLANT_DENIED'
            ? 'CROSS_PLANT_ACCESS'
            : 'CONFIDENTIAL_DOCUMENT_ACCESS',
        action: 'COPILOT_QUERY_BLOCKED',
        resourceCategory: 'COPILOT_QUERY',
        resourceId: plantId || assetId || null,
        decision: 'DENIED',
        policyReasonCode: policyEval.policyReasonCode,
        severity: 'MEDIUM',
        isBenignInquiry: true,
        metadata: { queryPrefix: query.slice(0, 80) },
      });

      if (policyEval.policyReasonCode === 'CROSS_PLANT_DENIED') {
        throw new Error(`Unauthorized: User is not assigned to plant '${plantId}'.`);
      }

      const refusalContent =
        policyEval.denialMessage ||
        'Access restricted: Your request involves resources or procedures that are restricted under company confidentiality policy. Please consult your plant administrator for authorized access.';

      let conversation;
      if (conversationId) {
        conversation = await this.dataStore.getConversationById(organizationId, conversationId);
      }
      if (!conversation) {
        conversation = await this.dataStore.createConversation({
          organizationId,
          plantId: plantId || 'GENERAL',
          assetId: assetId ?? null,
          userId,
          title: query.length > 50 ? `${query.slice(0, 47)}...` : query,
        });
      }

      const userMessage = await this.dataStore.createMessage({
        conversationId: conversation.id,
        senderType: 'USER',
        content: query,
      });

      const assistantMessage = await this.dataStore.createMessage({
        conversationId: conversation.id,
        senderType: 'ASSISTANT',
        content: refusalContent,
        confidence: 'HIGH',
        isInsufficientEvidence: false,
      });

      return {
        conversationId: conversation.id,
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          questionMode: 'RESTRICTED_SAFETY_CRITICAL',
          citations: [],
          ticketId: null,
          ticketNumber: null,
        },
        questionMode: 'RESTRICTED_SAFETY_CRITICAL',
        ticket: null,
        recurringFaultAnalysis: null,
        maintenanceRecords: [],
      };
    }

    // 0b. Universal Copilot: General Knowledge Query (answers without retrieving confidential company documents)
    const hasSpecificMachineTag = Boolean(query.match(/\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]+-[0-9]+)\b/gi));
    const isGeneralKnowledgeQuery =
      (!plantId || plantId === 'GENERAL') &&
      !assetId &&
      !request.machineId &&
      !hasSpecificMachineTag;

    if (isGeneralKnowledgeQuery) {
      let conversation;
      if (conversationId) {
        conversation = await this.dataStore.getConversationById(organizationId, conversationId);
      }
      if (!conversation) {
        conversation = await this.dataStore.createConversation({
          organizationId,
          plantId: plantId || 'GENERAL',
          assetId: assetId ?? null,
          userId,
          title: query.length > 50 ? `${query.slice(0, 47)}...` : query,
        });
      }

      const userMessage = await this.dataStore.createMessage({
        conversationId: conversation.id,
        senderType: 'USER',
        content: query,
      });

      const genResult = await this.generationProvider.generateAnswer({
        query,
        authorizedEvidence: [],
        assetContext: null,
        plantContext: {
          code: plantId && plantId !== 'GENERAL' ? plantId : 'GENERAL',
          name: 'General Engineering Knowledge',
        },
      });

      let generalKnowledgeText = genResult.answerText;
      if (!generalKnowledgeText.includes('[GENERAL ENGINEERING KNOWLEDGE]')) {
        generalKnowledgeText = `### [GENERAL ENGINEERING KNOWLEDGE — NON-MACHINE SPECIFIC]
${generalKnowledgeText}

> [!NOTE]
> This response provides general engineering principles, equations, and theoretical concepts. It does not access private organization records and cannot verify physical machine ratings or operational limits. For specific asset procedures, query with the verified machine tag (e.g. PUMP-204-B).`;
      }

      const assistantMessage = await this.dataStore.createMessage({
        conversationId: conversation.id,
        senderType: 'ASSISTANT',
        content: generalKnowledgeText,
        confidence: genResult.confidence,
        isInsufficientEvidence: false,
      });

      return {
        conversationId: conversation.id,
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          questionMode: 'GENERAL',
          citations: [],
          ticketId: null,
          ticketNumber: null,
        },
        questionMode: 'GENERAL',
        ticket: null,
        missingInfoTask: null,
        recurringFaultAnalysis: null,
        maintenanceRecords: [],
      };
    }

    // 1. Establish & Validate Asset & Plant Authorization
    if (!plant) {
      plant = await this.dataStore.getPlantById(organizationId, plantId);
      if (!plant) {
        throw new Error(`Unauthorized or invalid plant: Plant '${plantId}' does not belong to organization.`);
      }
    }

    let assetContext: { assetTag: string; name: string; area: string } | null = null;
    if (assetId) {
      const asset = await this.dataStore.getAssetById(organizationId, assetId);
      if (!asset) {
        throw new Error(`Unauthorized or invalid asset: Asset '${assetId}' does not belong to organization.`);
      }
      if (asset.plantId !== plant.id) {
        throw new Error(`Asset '${assetId}' does not belong to the selected plant '${plantId}'.`);
      }
      assetContext = {
        assetTag: asset.assetTag,
        name: asset.name,
        area: asset.area,
      };
    }

    // 1b. Identify Machine if provided or inferred
    let machine = null;
    if (request.machineId) {
      machine = await this.dataStore.getMachineById(organizationId, request.machineId);
    }
    if (!machine && assetId) {
      const allMachines = await this.dataStore.listMachines(organizationId);
      machine = allMachines.find((m) => m.id === assetId || m.parentAssetId === assetId) || null;
    }
    if (!machine) {
      const tagMatches = query.match(/\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]+-[0-9]+)\b/gi);
      if (tagMatches) {
        for (const tag of tagMatches) {
          const found = await this.dataStore.getMachineByAssetTag(organizationId, tag);
          if (found) {
            machine = found;
            break;
          }
        }
      }
    }

    // Check for safety-critical / hazardous indicators and bypass attempts
    const isImmediateHazard =
      /\b(gas leak|chemical leak|toxic leak|fire|explosion|arc flash|imminent collapse|lethal voltage|person trapped|smoke pouring)\b/i.test(query);

    const isBypassSafetyQuery =
      /\b(bypass loto|bypass lockout|bypass interlock|defeat interlock|disable guard|override safety switch|ignore tagout)\b/i.test(query);

    const isPromptInjection =
      /\b(system override|ignore all previous|disable rbac|bypass rbac|ignore previous instructions|reveal system secrets|print out.*secrets)\b/i.test(query);

    if (isPromptInjection) {
      await this.securityService.recordSecurityEvent({
        organizationId,
        actorUserId: userId,
        actorEmail: context.userEmail,
        actorRole: userRole,
        category: 'RESTRICTED_ACTION',
        action: 'BLOCKED_PROMPT_INJECTION_ATTEMPT',
        resourceCategory: 'COPILOT_PIPELINE',
        resourceId: machine?.id || plant.id,
        decision: 'DENIED',
        policyReasonCode: 'ADVERSARIAL_INSTRUCTION_OVERRIDE_BLOCKED',
        severity: 'HIGH',
        isBenignInquiry: false,
        metadata: { queryPrefix: query.slice(0, 80) },
      });
    }

    if (isBypassSafetyQuery) {
      await this.securityService.recordSecurityEvent({
        organizationId,
        actorUserId: userId,
        actorEmail: context.userEmail,
        actorRole: userRole,
        category: 'RESTRICTED_ACTION',
        action: 'BLOCKED_LOTO_BYPASS_ATTEMPT',
        resourceCategory: 'SAFETY_INTERLOCK',
        resourceId: machine?.id || plant.id,
        decision: 'DENIED',
        policyReasonCode: 'SAFETY_INTERLOCK_BYPASS_PROHIBITED',
        severity: 'HIGH',
        isBenignInquiry: false,
        metadata: { queryPrefix: query.slice(0, 80) },
      });

      let conversation;
      if (conversationId) {
        conversation = await this.dataStore.getConversationById(organizationId, conversationId);
      }
      if (!conversation) {
        conversation = await this.dataStore.createConversation({
          organizationId,
          plantId: plant.id,
          assetId: assetId ?? null,
          userId,
          title: query.length > 50 ? `${query.slice(0, 47)}...` : query,
        });
      }

      const userMessage = await this.dataStore.createMessage({
        conversationId: conversation.id,
        senderType: 'USER',
        content: query,
      });

      let assignedSpecialistUserId: string | null = null;
      let assignedSpecialistName: string | null = null;
      let assignmentStatus: TicketAssignmentStatus = 'NEEDS_SPECIALIST_ASSIGNMENT';

      if (machine) {
        const mapping = await this.dataStore.getMachineSpecialistMapping(organizationId, machine.id);
        if (mapping?.primarySpecialistUserId) {
          const specialistProfile = await this.dataStore.getEmployeeProfileByUserId(
            organizationId,
            mapping.primarySpecialistUserId
          );
          if (
            specialistProfile &&
            specialistProfile.accountStatus === 'ACTIVE' &&
            (specialistProfile.availabilityStatus === 'AVAILABLE' ||
              specialistProfile.availabilityStatus === 'ON_DUTY')
          ) {
            assignedSpecialistUserId = mapping.primarySpecialistUserId;
            assignedSpecialistName =
              mapping.primarySpecialistName || specialistProfile.fullName || 'Primary Specialist';
            assignmentStatus = 'ASSIGNED_PRIMARY';
          } else if (mapping.backupSpecialistUserIds && mapping.backupSpecialistUserIds.length > 0) {
            for (const backupId of mapping.backupSpecialistUserIds) {
              const backupProfile = await this.dataStore.getEmployeeProfileByUserId(organizationId, backupId);
              if (
                backupProfile &&
                backupProfile.accountStatus === 'ACTIVE' &&
                (backupProfile.availabilityStatus === 'AVAILABLE' ||
                  backupProfile.availabilityStatus === 'ON_DUTY')
              ) {
                assignedSpecialistUserId = backupId;
                assignedSpecialistName = backupProfile.fullName || 'Backup Specialist';
                assignmentStatus = 'ASSIGNED_BACKUP';
                break;
              }
            }
          }
        }
      } else {
        assignmentStatus = 'ESCALATED_TRIAGE';
      }

      const createdTicket = await this.dataStore.createSpecialistTicket(organizationId, {
        plantId: plant.id,
        machineId: machine?.id || null,
        machineAssetTag: machine?.assetTag || null,
        reportedByUserId: userId,
        originalQuestion: query,
        diagnosticDetails:
          'Safety-critical inquiry attempting safety interlock or LOTO bypass. Escalated immediately to safety specialist/engineer.',
        escalationReason: 'SAFETY_CRITICAL',
        evidenceCheckResult: {
          hasApprovedEvidence: false,
          confidenceScore: 0.0,
          reason: 'Bypassing safety interlocks or LOTO is strictly prohibited by policy and regulations.',
        },
        severity: 'CRITICAL',
        assignedSpecialistUserId,
        assignedSpecialistName,
        assignmentStatus,
        status: 'OPEN',
      });

      const refusalContent =
        '[SAFETY ESCALATION] [SAFETY POLICY VIOLATION] Bypassing physical guards, safety interlocks, or Lockout/Tagout (LOTO) controls is strictly prohibited under OSHA/industrial regulations and ForgeX AI safety policy. Physical interlocks and lockout hardware protect human life. Never bypass or defeat safety isolation under any operational circumstances. An urgent safety escalation ticket has been created and dispatched.';

      const assistantMessage = await this.dataStore.createMessage({
        conversationId: conversation.id,
        senderType: 'ASSISTANT',
        content: refusalContent,
        confidence: 'HIGH',
        isInsufficientEvidence: true,
      });

      return {
        conversationId: conversation.id,
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          questionMode: 'RESTRICTED_SAFETY_CRITICAL',
          citations: [],
          ticketId: createdTicket.id,
          ticketNumber: createdTicket.ticketNumber,
        },
        questionMode: 'RESTRICTED_SAFETY_CRITICAL',
        ticket: createdTicket,
        missingInfoTask: null,
        recurringFaultAnalysis: null,
        maintenanceRecords: [],
      };
    }

    if (
      isImmediateHazard ||
      /\b(hazardous|danger|dangerous|arc flash|toxic|loto|lockout|high pressure|emergency shutdown|radiation|chemical leak|explosion|lethal|critical failure|overheat|overheating|abnormal vibration)\b/i.test(
        query
      )
    ) {
      isSafetyCritical = true;
    }

    let machineMaintenanceRecords: MaintenanceRecord[] = [];
    let recurringFaultAnalysis: RecurringFaultAnalysis | null = null;
    let safetyStopWarning: string | null = null;
    let historicalRetrieval: any = null;

    if (machine) {
      // Machine plant boundary check
      if (plant && machine.plantId !== plant.id) {
        throw new Error(`Machine '${machine.assetTag}' does not belong to plant '${plant.code}'.`);
      }

      // Historical fault matching & recurrence analysis via HistoricalFaultService
      historicalRetrieval = await this.historicalFaultService.matchHistoricalFaults(
        organizationId,
        machine.id,
        { query },
        userRole
      );

      const allHistory = await this.dataStore.getMachineMaintenanceHistory(
        organizationId,
        machine.id
      );

      const isPrivileged =
        userRole === 'ORGANIZATION_OWNER' ||
        userRole === 'ORGANIZATION_ADMIN' ||
        userRole === 'PLANT_MANAGER' ||
        userRole === 'ENGINEER' ||
        userRole === 'ENGINEER_TECHNICIAN' ||
        userRole === 'TECHNICIAN';

      // RBAC boundary: Non-privileged roles (WORKER, VIEWER) see operational maintenance history, but never internal investigations
      machineMaintenanceRecords = allHistory.filter((r) => {
        if (isPrivileged) return true;
        if (r.faultCategory === 'INTERNAL_INVESTIGATION') return false;
        return true;
      });

      recurringFaultAnalysis = historicalRetrieval.recurrenceAnalysis || await this.dataStore.detectRecurringFaults(
        organizationId,
        machine.id
      );

      if (recurringFaultAnalysis) {
        if (recurringFaultAnalysis.isSafetyCritical || recurringFaultAnalysis.requiresSafetyHold) {
          isSafetyCritical = true;
        }
        if (recurringFaultAnalysis.safetyWarning) {
          safetyStopWarning = recurringFaultAnalysis.safetyWarning;
        }
      }
    }

    // 2. Resolve or Create Conversation Thread
    let conversation;
    if (conversationId) {
      conversation = await this.dataStore.getConversationById(organizationId, conversationId);
      if (!conversation) {
        throw new Error(`Conversation '${conversationId}' not found or unauthorized for this tenant.`);
      }
    } else {
      const title = query.length > 50 ? `${query.slice(0, 47)}...` : query;
      conversation = await this.dataStore.createConversation({
        organizationId,
        plantId: plant.id,
        assetId: assetId ?? null,
        userId,
        title,
      });
    }

    // 3. Persist User Message
    const userMessage = await this.dataStore.createMessage({
      conversationId: conversation.id,
      senderType: 'USER',
      content: query,
    });

    // 4. Retrieve Candidate Chunks (Semantic Vector Search with Strict Tenant Filter)
    const queryVector = await this.embeddingProvider.generateEmbedding(query);

    const vectorHits = await this.vectorStore.search(
      this.collectionName,
      queryVector,
      {
        organizationId,
        plantId: plant.id,
      },
      topK * 3
    );

    // 5. Pre-Generation Authorization Verification: Ensure every candidate belongs to an active tenant document
    const candidates: RerankCandidate[] = [];
    for (const hit of vectorHits) {
      const payload = hit.payload;
      if (payload.organizationId !== organizationId) {
        logger.warn(
          { attemptedOrgId: payload.organizationId, expectedOrgId: organizationId },
          'Security violation: Cross-tenant chunk intercepted in vector hits; dropped immediately'
        );
        continue;
      }

      if (payload.type === 'EXPERT_KNOWLEDGE' || payload.isExpertKnowledge) {
        const ekId = (payload.expertKnowledgeId || payload.documentId) as string;
        const ek = await this.dataStore.getExpertKnowledgeEntryById(organizationId, ekId);
        if (ek) {
          if (machine) {
            const hasTag =
              (ek.machineAssetTags && ek.machineAssetTags.includes(machine.assetTag)) ||
              ek.machineAssetTag === machine.assetTag;
            if (ek.machineAssetTag && !hasTag) {
              continue;
            }
          }
          candidates.push({
            chunkId: hit.id,
            documentId: `expert_${ek.id}`,
            documentNumber: `EXP-${(ek.category || 'TIP').slice(0, 3).toUpperCase()}-${ek.id.slice(0, 6).toUpperCase()}`,
            documentTitle: `[FIELD EXPERT WISDOM] ${ek.title}`,
            documentVersionId: '1.0',
            pageNumber: 1,
            content: (payload.content as string) || ek.description,
            sectionHeading: `Technician Field Wisdom (${ek.category})`,
            initialScore: hit.score,
            isTable: false,
            isFigure: false,
            extractionMethod: 'FIELD_NOTE',
          });
        }
        continue;
      }

      const doc = await this.dataStore.getDocumentById(organizationId, payload.documentId as string);
      if (!doc) continue;

      // Machine applicability check: If a specific machine is targeted, ensure document is applicable
      if (machine) {
        if (doc.assetTags && doc.assetTags.length > 0 && !doc.assetTags.includes(machine.assetTag)) {
          continue;
        }
        if (payload.assetId && payload.assetId !== machine.id) {
          continue;
        }
      }

      // Confidential document protection: Non-supervisory members cannot retrieve confidential manuals/chunks
      const isSupervisory =
        userRole === 'ORGANIZATION_ADMIN' ||
        userRole === 'ORGANIZATION_OWNER' ||
        userRole === 'ENGINEER_TECHNICIAN';
      const isConfidential =
        Boolean((doc as any).isConfidential) ||
        (doc as any).dataClassification === 'RESTRICTED_CONFIDENTIAL' ||
        (doc as any).dataClassification === 'RESTRICTED' ||
        (doc as any).dataClassification === 'CONFIDENTIAL';
      if (isConfidential && !isSupervisory) {
        continue;
      }

      candidates.push({
        chunkId: (payload.chunkId as string) || hit.id,
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        documentTitle: doc.title,
        documentVersionId: (payload.documentVersionId as string) || '',
        pageNumber: Number(payload.pageNumber) || 1,
        content: (payload.content as string) || '',
        sectionHeading: (payload.sectionHeading as string) || null,
        initialScore: hit.score,
        isTable: Boolean(payload.isTable),
        isFigure: Boolean(payload.isFigure),
        extractionMethod: (payload.extractionMethod as string) || 'NATIVE_TEXT',
      });
    }

    // 5b. Hybrid Keyword Matching: Boost candidate chunks matching exact equipment tags, SOP numbers, or critical parameters
    const exactTagOrSpecTokens =
      query.match(
        /\b([A-Z0-9]+-[0-9]+-[A-Z0-9]+|[A-Z]+-[0-9]+|SOP-[A-Z]+-[0-9]+|\d+(?:\.\d+)?\s*(?:PSI|ft-lbs|Nm|RPM|PSIG|GPM|HP))\b/gi
      ) || [];

    if (exactTagOrSpecTokens.length > 0) {
      for (const token of exactTagOrSpecTokens) {
        const lowerToken = token.toLowerCase();
        for (const cand of candidates) {
          if (
            cand.content.toLowerCase().includes(lowerToken) ||
            cand.documentNumber.toLowerCase().includes(lowerToken) ||
            (cand.sectionHeading && cand.sectionHeading.toLowerCase().includes(lowerToken))
          ) {
            cand.initialScore = Math.max(cand.initialScore, 0.95);
          }
        }
      }
    }

    // 6. Rerank Candidates
    const reranked = await this.rerankingProvider.rerank(query, candidates, topK);

    const authorizedEvidence: GenerationEvidenceItem[] = reranked.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentNumber: r.documentNumber,
      documentTitle: r.documentTitle,
      documentVersionId: r.documentVersionId,
      pageNumber: r.pageNumber,
      content: r.content,
      sectionHeading: r.sectionHeading,
      score: r.rerankScore,
    }));

    // 6a. Governed Published Approved Guidance: Preferred operational instructions for workers
    const publishedGuidanceList = await this.dataStore.listPublishedGuidance(organizationId, {
      plantId: plant.id,
      machineId: machine?.id,
      status: 'PUBLISHED',
      role: userRole as any,
    });

    if (publishedGuidanceList.length > 0) {
      for (const g of publishedGuidanceList) {
        authorizedEvidence.unshift({
          chunkId: `guidance_${g.id}`,
          documentId: g.sourceDocumentId || `guidance_${g.id}`,
          documentNumber: g.sourceDocumentNumber || `GUIDANCE-${g.id.slice(0, 8).toUpperCase()}`,
          documentTitle: `Approved Guidance: ${g.title}`,
          documentVersionId: g.sourceDocumentVersionId || '1.0',
          pageNumber: g.sourcePageNumber || 1,
          content: `[APPROVED OPERATIONAL GUIDANCE] Title: ${g.title}\nClassification: ${g.disclosureClassification}\nApproved Content:\n${g.guidanceContent}`,
          sectionHeading: g.sourceSectionHeading || 'Approved Operational Instructions',
          score: 0.99,
        });
      }
    }

    // 6b. History-Aware Evidence Synthesis: Include durable maintenance records for machine
    if (machine && historicalRetrieval && historicalRetrieval.matches.length > 0) {
      const formattedEvidence = this.historicalFaultService.formatHistoricalEvidenceForRAG(
        historicalRetrieval,
        machine.assetTag
      );

      if (formattedEvidence.isRelevant) {
        authorizedEvidence.unshift({
          chunkId: `maint_hist_${machine.id}`,
          documentId: `machine_${machine.id}`,
          documentNumber: `HIST-${machine.assetTag}`,
          documentTitle: `Maintenance History Ledger for ${machine.assetTag}`,
          documentVersionId: '1.0',
          pageNumber: 1,
          content: formattedEvidence.content,
          sectionHeading: 'Machine Maintenance History Ledger',
          score: 0.98,
        });

        for (const item of formattedEvidence.evidenceItems) {
          authorizedEvidence.push(item);
        }
      }
    } else if (machine && machineMaintenanceRecords.length > 0) {
      const confirmedFacts: string[] = [];
      const technicianObservations: string[] = [];
      const unknowns: string[] = [];
      const measurementsSummary: string[] = [];

      for (const rec of machineMaintenanceRecords.slice(0, 5)) {
        if (rec.rootCauseStatus === 'CONFIRMED') {
          confirmedFacts.push(
            `Record ${rec.recordNumber}: Verified Root Cause: "${rec.rootCause}". Repair Actions: ${rec.repairActions.join(', ')}. Verification State: ${rec.verificationState}.`
          );
        } else if (rec.rootCauseStatus === 'SUSPECTED') {
          technicianObservations.push(
            `Record ${rec.recordNumber}: Suspected Root Cause (Unconfirmed): "${rec.rootCause}". Observed Symptoms: ${rec.observedSymptoms.join(', ')}.`
          );
        } else {
          unknowns.push(
            `Record ${rec.recordNumber}: Root cause UNKNOWN. Technician actions: ${rec.repairActions.join(', ')}.`
          );
        }

        if (rec.measurements && rec.measurements.length > 0) {
          for (const m of rec.measurements) {
            measurementsSummary.push(
              `${m.parameterName}: ${m.value} ${m.unit} (Source: ${m.source}, Verified: ${m.isNormal ? 'NORMAL' : 'ABNORMAL'})`
            );
          }
        }
      }

      let histContent = `Authorized Maintenance History for ${machine.assetTag}:\n`;
      histContent += `[EVIDENCE NOTE: A previous repair is historical evidence of what was performed previously, NOT definitive proof that the same repair is appropriate today. Verify current physical symptoms and follow approved inspection procedures before undertaking repairs.]\n`;
      if (confirmedFacts.length > 0) {
        histContent += `[CONFIRMED FACTS & VERIFIED REPAIRS] ` + confirmedFacts.join(' | ') + '\n';
      }
      if (technicianObservations.length > 0) {
        histContent += `[TECHNICIAN OBSERVATIONS & HYPOTHESES] ` + technicianObservations.join(' | ') + '\n';
      }
      if (unknowns.length > 0) {
        histContent += `[UNKNOWNS & UNRESOLVED FACTORS] ` + unknowns.join(' | ') + '\n';
      }
      if (measurementsSummary.length > 0) {
        histContent += `[HISTORICAL MEASUREMENT RECORDS] ` + measurementsSummary.join(' | ') + '\n';
      }
      if (recurringFaultAnalysis && recurringFaultAnalysis.isRecurringFault) {
        histContent += `[RECURRING FAULT INTELLIGENCE] Fault category "${recurringFaultAnalysis.faultCategory}" has occurred ${recurringFaultAnalysis.recurrenceCount} times within monitoring window. Evidence confidence: ${recurringFaultAnalysis.confidence}. Confirmed causes: ${recurringFaultAnalysis.confirmedRootCauses.join(', ') || 'None'}. Suspected causes: ${recurringFaultAnalysis.suspectedRootCauses.join(', ') || 'None'}.\n`;
      }

      authorizedEvidence.unshift({
        chunkId: `maint_hist_${machine.id}`,
        documentId: `machine_${machine.id}`,
        documentNumber: `HIST-${machine.assetTag}`,
        documentTitle: `Maintenance History Ledger for ${machine.assetTag}`,
        documentVersionId: '1.0',
        pageNumber: 1,
        content: histContent,
        sectionHeading: 'Machine Maintenance History Ledger',
        score: 0.98,
      });
    }

    const isMaintenanceHistoryQuery =
      intent === 'MAINTENANCE_HISTORY' ||
      /\b(maintenance histor(y|ies)|previous faults?|past repairs?|recurring failures?|past incidents?|failure logs?|history of|repaired before|tripped before|maintenance records?)\b/i.test(query);

    if (machine && isMaintenanceHistoryQuery && machineMaintenanceRecords.length === 0) {
      authorizedEvidence.push({
        chunkId: `maint_hist_none_${machine.id}`,
        documentId: `machine_${machine.id}`,
        documentNumber: `HIST-${machine.assetTag}`,
        documentTitle: `Maintenance History Ledger for ${machine.assetTag}`,
        documentVersionId: '1.0',
        pageNumber: 1,
        content: `Authorized Maintenance History Ledger for ${machine.assetTag}: No relevant approved maintenance records or historical fault entries exist in the asset maintenance registry for this machine. Note: This indicates the absence of recorded maintenance entries in the database, not that a fault has never occurred in the asset operating history.`,
        sectionHeading: 'Machine Maintenance History Ledger',
        score: 0.99,
      });
    }

    // 6c. Governed Machine Knowledge Recovery: Include Approved Machine Knowledge Base
    if (machine) {
      const approvedClaims = await this.dataStore.listEvidenceClaims(organizationId, {
        machineId: machine.id,
        status: 'APPROVED',
      });

      if (approvedClaims.length > 0) {
        const approvedClaimLines = approvedClaims.map(
          (c) =>
            `- [VERIFIED MACHINE SPECIFICATION] ${c.displayName || c.fieldName}: ${c.claimValue} ${c.unit || ''} (Provenance: ${c.sourceType}, Rev: ${c.sourceRevision || 'N/A'}, Approved by: ${c.reviewedByEmail || c.reviewedByUserId}, Rationale: "${c.reviewRationale || 'Engineering verified'}")`
        );

        authorizedEvidence.unshift({
          chunkId: `approved_claim_${machine.id}`,
          documentId: `machine_${machine.id}`,
          documentNumber: `APPROVED-KB-${machine.assetTag}`,
          documentTitle: `Approved Machine Knowledge Base for ${machine.assetTag}`,
          documentVersionId: '1.0',
          pageNumber: 1,
          content: `Governed Machine Knowledge Base for ${machine.assetTag} (${machine.name}):\n${approvedClaimLines.join('\n')}`,
          sectionHeading: 'Verified Machine Specific Knowledge',
          score: 0.99,
        });
      }
    }

    // 6d. Governed Expert Knowledge Library Entries (Prompt 04)
    // Only APPROVED entries are surfaced as verified evidence; REVOKED or SUPERSEDED are excluded!
    const expertKnowledgeList = await this.dataStore.listExpertKnowledgeEntries(organizationId, {
      plantId: plant.id,
      machineId: machine?.id,
      status: 'APPROVED',
    });

    if (expertKnowledgeList.length > 0) {
      const isSupervisory =
        userRole === 'ORGANIZATION_ADMIN' ||
        userRole === 'ORGANIZATION_OWNER' ||
        userRole === 'ENGINEER_TECHNICIAN';

      for (const ek of expertKnowledgeList) {
        const isConfidentialEK = ek.dataClassification === 'RESTRICTED' || ek.dataClassification === 'CONFIDENTIAL';
        if (isConfidentialEK && !isSupervisory) continue;

        authorizedEvidence.unshift({
          chunkId: `expert_${ek.id}`,
          documentId: `expert_${ek.id}`,
          documentNumber: `EXP-${ek.category.slice(0, 3)}-${ek.id.slice(0, 6).toUpperCase()}`,
          documentTitle: `[VERIFIED EXPERT KNOWLEDGE] ${ek.title}`,
          documentVersionId: '1.0',
          pageNumber: 1,
          content: `Governed Expert Knowledge Record (${ek.category}):
Title: ${ek.title}
Asset: ${ek.machineAssetTag || 'Plant Equipment'}
Description: ${ek.description}
Symptoms: ${(ek.symptoms || []).join(', ') || 'None listed'}
Root Cause: ${ek.rootCause || 'N/A'}
Resolution Steps: ${(ek.resolutionSteps || []).join(' -> ') || 'N/A'}
Failure Modes: ${(ek.knownFailureModes || []).join(', ') || 'N/A'}
Knowledge Gap Notes: ${ek.gapDescription || 'None'}
Safety Precautions: ${(ek.safetyPrecautions || []).join(', ') || 'Standard plant safety rules apply'}
Engineering Reviewer Rationale: "${ek.reviewRationale || 'Verified by plant reliability engineer'}"`,
          sectionHeading: `Expert Knowledge: ${ek.category}`,
          score: 0.98,
        });
      }
    }


    // 7. Invoke Generation Model
    let generationResult;
    if (imageUrl) {
      generationResult = await this.generationProvider.generateWithImage({
        query,
        authorizedEvidence,
        assetContext,
        plantContext: { code: plant.code, name: plant.name },
        imageUrl,
      });
    } else {
      generationResult = await this.generationProvider.generateAnswer({
        query,
        authorizedEvidence,
        assetContext,
        plantContext: { code: plant.code, name: plant.name },
      });
    }

    const sanitizedAnswer = PromptDefenseService.scrubSystemSecrets(
      generationResult.answerText,
      [config.JWT_SECRET, config.S3_SECRET_ACCESS_KEY, config.CLOUD_AI_API_KEY]
    );

    // 8. Automatic Ticket Creation and Routing when evidence is insufficient or safety-critical
    let createdTicket: SpecialistTicket | null = null;
    let createdTask: any = null;

    const isOldOrIncompleteMachine =
      machine !== null &&
      (machine.documentationReadiness === 'INCOMPLETE' ||
       machine.verificationState === 'UNVERIFIED' ||
       machine.verificationState === 'PARTIALLY_VERIFIED' ||
       (!machine.serialNumber && !machine.modelNumber));

    const isGeneralKnowledgeQuestion =
      !machine &&
      !assetId &&
      !hasSpecificMachineTag &&
      !isImmediateHazard &&
      !isSafetyCritical &&
      (intent === 'GENERAL_KNOWLEDGE' ||
        /^(what is|what are|explain|how does|define|formula for|principles of)\b/i.test(query.trim()));

    const isWorkerRequestingSupport =
      /\b(create ticket|open ticket|dispatch technician|need specialist|maintenance support|request maintenance|send specialist)\b/i.test(
        query
      );

    const isMachineIssueWithoutIdentity =
      !machine &&
      !assetId &&
      !hasSpecificMachineTag &&
      !isGeneralKnowledgeQuestion &&
      /\b(bearing|motor|pump|compressor|seal|impeller|vibration|leak|smoking|overheating|tripped|broken|stalled)\b/i.test(
        query
      );

    const shouldEscalate =
      !isGeneralKnowledgeQuestion &&
      !isMachineIssueWithoutIdentity &&
      (isWorkerRequestingSupport ||
        generationResult.isInsufficientEvidence ||
        generationResult.confidence === 'INSUFFICIENT_EVIDENCE' ||
        (isSafetyCritical && authorizedEvidence.length === 0) ||
        (isOldOrIncompleteMachine && authorizedEvidence.length === 0));

    if (machine && (isOldOrIncompleteMachine || shouldEscalate)) {
      try {
        createdTask = await this.dataStore.createMissingInfoTask(organizationId, {
          machineId: machine.id,
          machineAssetTag: machine.assetTag,
          machineName: machine.name,
          requestedFields: [
            'manufacturer',
            'modelNumber',
            'serialNumber',
            'operatingPressure',
            'temperatureLimit',
            'nameplateRpm',
          ],
          instructions:
            'Conduct safe, non-hazardous physical nameplate verification to record missing equipment ratings without opening live electrical cabinets.',
          assignedRole: 'ENGINEER',
        });
      } catch (err: any) {
        logger.warn({ err: err?.message }, 'Failed to auto-create missing info task');
      }
    }

    if (shouldEscalate) {
      // 1. Prevent duplicate tickets for the same reported event
      if (machine) {
        const activeDuplicate = await this.dataStore.findActiveDuplicateTicket(
          organizationId,
          machine.id,
          query
        );
        if (activeDuplicate) {
          createdTicket = activeDuplicate;
          logger.info(
            { ticketNumber: activeDuplicate.ticketNumber, machineId: machine.id },
            'Prevented duplicate ticket creation: returning active ticket.'
          );
        }
      }

      // 2. If no active duplicate, route to qualified specialist or Admin triage
      if (!createdTicket) {
        const routing = await this.routingService.routeSpecialist(
          organizationId,
          plant.id,
          machine?.id || null
        );

        createdTicket = await this.dataStore.createSpecialistTicket(organizationId, {
          plantId: plant.id,
          machineId: machine?.id || null,
          machineAssetTag: machine?.assetTag || null,
          reportedByUserId: userId,
          originalQuestion: query,
          diagnosticDetails: isSafetyCritical
            ? 'Safety-critical procedure inquiry without verified evidence. Requires human specialist authorization.'
            : 'Grounded RAG query produced insufficient evidence. Escalated to prevent guessing or hallucinations.',
          escalationReason: isSafetyCritical ? 'SAFETY_CRITICAL' : 'INSUFFICIENT_EVIDENCE',
          evidenceCheckResult: {
            hasApprovedEvidence: authorizedEvidence.length > 0,
            confidenceScore: authorizedEvidence.length > 0 ? 0.4 : 0.0,
            reason: isSafetyCritical
              ? 'Safety-critical parameter inquiries require qualified human specialist confirmation'
              : 'Insufficient authorized documentation to reliably answer inquiry without hallucination',
          },
          severity: isSafetyCritical ? 'CRITICAL' : 'MEDIUM',
          assignedSpecialistUserId: routing.assignedSpecialistUserId,
          assignedSpecialistName: routing.assignedSpecialistName,
          assignmentStatus: routing.assignmentStatus,
          status: 'OPEN',
        });

        await this.dataStore.recordAuditEvent({
          organizationId,
          actorUserId: userId,
          action: 'AI_QUERY_ESCALATED_TO_TICKET',
          resourceType: 'TICKET',
          resourceId: createdTicket.id,
          metadata: {
            ticketNumber: createdTicket.ticketNumber,
            escalationReason: createdTicket.escalationReason,
            assignmentStatus: createdTicket.assignmentStatus,
            assignedSpecialistName: createdTicket.assignedSpecialistName,
          },
        });
      }
    }

    const asksForMeasurement = /\b(temperature|temp|pressure|vibration|gauge|reading|measurement)\b/i.test(query);
    const hasTrustedMeasurement =
      machineMaintenanceRecords.some((r) => r.measurements && r.measurements.length > 0) ||
      Boolean(machine?.technicalSpecs && ((machine.technicalSpecs as any).temperature || (machine.technicalSpecs as any).operatingPressure));

    let finalAnswer = sanitizedAnswer;

    if (isMachineIssueWithoutIdentity) {
      finalAnswer = `[CLARIFICATION REQUIRED — MACHINE IDENTITY MISSING]
You have reported an operational equipment symptom, but no specific machine or asset tag was identified in your inquiry.
Please specify the machine asset tag (e.g., PUMP-101, COMP-202) or select the unit from the plant asset directory so ForgeX AI can retrieve verified engineering specifications, active maintenance history, and route your request to the qualified specialist.`;
    } else if (createdTicket && isImmediateHazard) {
      finalAnswer = `[IMMEDIATE SAFETY ALERT — EMERGENCY ACTION REQUIRED]
1. Immediately evacuate personnel from the hazard zone and sound the local area emergency alarm.
2. Initiate site emergency safe-stop and physical isolation protocols.
3. Contact the plant emergency control room and dispatch the site emergency response team immediately.
4. Do NOT attempt troubleshooting or manual inspection until declared safe by incident command.

[MANDATORY NOTICE] ForgeX AI cannot execute physical shutdowns; you must activate the physical emergency stop button on the unit control panel or contact control room operations. Ticket ${createdTicket.ticketNumber} created with CRITICAL priority.`;
    } else if (createdTicket && isSafetyCritical) {
      finalAnswer = `[SAFETY ESCALATION] This inquiry involves safety-critical or hazardous operating parameters. ForgeX AI strictly prohibits guessing or generating unverified operating procedures. Ticket ${createdTicket.ticketNumber} has been created (${createdTicket.assignmentStatus.replace(/_/g, ' ')}) and routed to ${createdTicket.assignedSpecialistName || 'the specialist queue'} for qualified human review.`;
    } else if (machine && isOldOrIncompleteMachine && (generationResult.isInsufficientEvidence || shouldEscalate)) {
      let oldMachineResponse = `Insufficient evidence in authorized plant documentation: I cannot safely answer this inquiry from authorized company evidence without guessing.\n\n`;
      oldMachineResponse += `### [GENERAL ENGINEERING CONCEPTS — NOT VERIFIED FOR THIS ASSET]\n`;
      oldMachineResponse += `For ${machine.machineType} equipment in general: operational limits and mechanical tolerances depend strictly on manufacturer frame sizing, impeller geometry, and thermal duty ratings. Standard engineering principles apply, but exact ratings cannot be inferred.\n\n`;

      oldMachineResponse += `### [VERIFIED ASSET FACTS]\n`;
      oldMachineResponse += `- Asset Tag: ${machine.assetTag}\n`;
      oldMachineResponse += `- Plant / Area: ${machine.area || 'Main Production'}\n`;
      oldMachineResponse += `- Documentation Readiness: ${machine.documentationReadiness}\n`;
      oldMachineResponse += `- Verification State: ${machine.verificationState}\n\n`;

      oldMachineResponse += `### [MISSING ASSET IDENTITY & SPECIFICATIONS NOTICE]\n`;
      oldMachineResponse += `No approved, verified machine-specific specifications exist in the active registry for ${machine.assetTag}. Original OEM service manual, nameplate ratings, and calibrated operating limits are missing or unverified. ForgeX AI strictly forbids guessing, estimating, or inventing operating thresholds or safe limits.\n`;
      oldMachineResponse += `CRITICAL SAFETY RULE: Never infer exact operating pressure, temperature limits, or electrical ratings from similar-looking machinery without verified OEM engineering documentation.\n\n`;

      oldMachineResponse += `### Recommended Safe Information-Gathering Steps (Non-Hazardous Inspection)\n`;
      oldMachineResponse += `1. Inspect the external physical nameplate without opening live electrical enclosures or process piping.\n`;
      oldMachineResponse += `2. Record stamped manufacturer, model number, serial number, frame size, and rated RPM.\n`;
      oldMachineResponse += `3. Check for external casting numbers or stamped marks on the casing / bearing housing.\n`;
      oldMachineResponse += `4. Submit collected nameplate data via the assigned Knowledge Recovery Task for engineering review.\n\n`;

      if (createdTicket || createdTask) {
        oldMachineResponse += `### Action Taken\n`;
        if (createdTicket) {
          oldMachineResponse += `- Specialist Ticket: ${createdTicket.ticketNumber} (${createdTicket.assignmentStatus.replace(/_/g, ' ')})\n`;
        }
        if (createdTask) {
          oldMachineResponse += `- Missing Information Task: ${createdTask.id} created for engineering verification.\n`;
        }
      }

      if (isMaintenanceHistoryQuery) {
        oldMachineResponse += `\n### Authorized Maintenance History Ledger\nNo relevant approved maintenance records or historical fault entries exist in the asset maintenance registry for this machine. Note: This indicates the absence of recorded maintenance entries in the database, not that a fault has never occurred in the asset operating history.\n`;
      }

      finalAnswer = oldMachineResponse;
    } else if (createdTicket) {
      finalAnswer = `Insufficient evidence in authorized plant documentation: I cannot safely answer this inquiry from authorized company evidence. Operating parameters must not be guessed. Ticket ${createdTicket.ticketNumber} has been automatically created and routed to ${createdTicket.assignedSpecialistName || 'the specialist queue'} (${createdTicket.assignmentStatus.replace(/_/g, ' ')}).`;
    } else {
      if (safetyStopWarning) {
        finalAnswer = `${safetyStopWarning}\n\n${finalAnswer}`;
      }

      if (isSafetyCritical) {
        finalAnswer += `\n\n[MANDATORY SAFETY ADVISORY] ForgeX AI recommendations are strictly advisory. Never bypass physical safety interlocks, guards, or emergency stops. Authorized inspection and supervisory restart approval are required before returning equipment to operation.`;
      }
    }

    if (asksForMeasurement && !hasTrustedMeasurement) {
      finalAnswer += `\n\n[MEASUREMENT NOTICE] No verified sensor telemetry or calibrated gauge reading is available for this machine. ForgeX AI policy strictly forbids estimating or inventing values. Physical inspection with calibrated tools is required.`;
    }

    // Never claim a machine has been shut down unless trusted control integration confirms it
    if (
      /\b(shutdown|shut down|emergency stop|e-stop|trip the machine|stop the pump|isolate equipment)\b/i.test(query) &&
      !finalAnswer.includes('ForgeX AI cannot execute physical shutdowns')
    ) {
      finalAnswer += `\n\n[MANDATORY NOTICE] ForgeX AI cannot execute physical shutdowns; you must activate the physical emergency stop button on the unit control panel or contact control room operations.`;
    }

    // 9. Persist Assistant Message
    const assistantMessage = await this.dataStore.createMessage({
      conversationId: conversation.id,
      senderType: 'ASSISTANT',
      content: finalAnswer,
      confidence: createdTicket ? 'INSUFFICIENT_EVIDENCE' : generationResult.confidence,
      isInsufficientEvidence: Boolean(createdTicket) || generationResult.isInsufficientEvidence,
      conflictDetected: generationResult.conflictDetected,
      conflictDetails: generationResult.conflictDetails,
    });

    // 10. Construct and Validate Citations with Confidentiality & Disclosure Controls
    const citationsToSave = [];
    const isNonAdmin =
      userRole &&
      userRole !== 'ORGANIZATION_OWNER' &&
      userRole !== 'ORGANIZATION_ADMIN' &&
      userRole !== 'ENGINEER_TECHNICIAN';

    if (!generationResult.isInsufficientEvidence && !createdTicket) {
      for (const chunkId of generationResult.usedEvidenceChunkIds) {
        const evidenceMatch = authorizedEvidence.find((e) => e.chunkId === chunkId);
        if (evidenceMatch) {
          let snippetText: string;
          if (isNonAdmin) {
            if (evidenceMatch.chunkId.startsWith('guidance_')) {
              snippetText = `Reference: [APPROVED OPERATIONAL GUIDANCE] ${evidenceMatch.documentTitle}`;
            } else {
              snippetText = `Reference: [APPROVED GUIDANCE: ${evidenceMatch.documentNumber} - ${evidenceMatch.sectionHeading || 'Approved Section'} (Page ${evidenceMatch.pageNumber})]`;
            }
          } else {
            snippetText = evidenceMatch.content.slice(0, 280);
          }

          citationsToSave.push({
            messageId: assistantMessage.id,
            documentId: evidenceMatch.documentId,
            documentNumber: evidenceMatch.documentNumber,
            documentTitle: evidenceMatch.documentTitle,
            documentVersionId: evidenceMatch.documentVersionId,
            pageNumber: evidenceMatch.pageNumber,
            knowledgeChunkId: evidenceMatch.chunkId,
            snippet: snippetText,
            confidenceScore: evidenceMatch.score,
            sectionHeading: evidenceMatch.sectionHeading,
          });
        }
      }
    }

    const savedCitations: Citation[] = await this.dataStore.createCitations(citationsToSave);

    let determinedQuestionMode: QuestionHandlingMode = 'COMPANY_SPECIFIC';
    if (createdTicket && (isSafetyCritical || isImmediateHazard)) {
      determinedQuestionMode = 'RESTRICTED_SAFETY_CRITICAL';
    } else if (machine || assetId || hasSpecificMachineTag) {
      determinedQuestionMode = 'MACHINE_SPECIFIC';
    } else {
      determinedQuestionMode = 'COMPANY_SPECIFIC';
    }

    const completeAssistantMessage: CopilotMessage = {
      ...assistantMessage,
      questionMode: determinedQuestionMode,
      citations: savedCitations,
      ticketId: createdTicket ? createdTicket.id : null,
      ticketNumber: createdTicket ? createdTicket.ticketNumber : null,
    };

    return {
      conversationId: conversation.id,
      userMessage,
      assistantMessage: completeAssistantMessage,
      questionMode: determinedQuestionMode,
      ticket: createdTicket,
      missingInfoTask: createdTask,
      recurringFaultAnalysis,
      maintenanceRecords: machineMaintenanceRecords,
    };
  }
}
