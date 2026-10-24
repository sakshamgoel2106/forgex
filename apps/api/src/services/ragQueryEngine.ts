import type { IDataStore } from '../db/dataStore.interface.js';
import type { ITextEmbeddingProvider } from '../ai/ai.interface.js';
import type { IVectorStoreAdapter, VectorSearchResult } from '../vector/vectorStore.interface.js';
import type {
  IMultimodalGenerationProvider,
  IRerankingProvider,
  GenerationEvidenceItem,
  RerankCandidate,
  RerankResult,
} from '../ai/ai.interface.js';
import {
  type RAGQueryRequest,
  type RAGQueryResponse,
  type Citation,
  type CopilotMessage,
  type QuestionHandlingMode,
  type SpecialistTicket,
  type TicketAssignmentStatus,
  type MaintenanceRecord,
  type RecurringFaultAnalysis,
  type Plant,
  type TechnicalDocument,
  type Machine,
  getLanguageConfig,
  formatLocalizedLotoAlert,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';
import { PromptDefenseService } from '../ai/promptSanitizer.js';
import { config } from '../config/env.js';
import { SecurityEventService } from './securityEvent.service.js';
import { SpecialistRoutingService } from './specialistRouting.service.js';
import { HistoricalFaultService } from './historicalFaultService.js';
import { isUuid, sanitizeMachineOrAssetId, sanitizeUuid } from '../utils/uuid.js';

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

  /**
   * Cleans industrial manual context chunks:
   * - Strips page footers/headers (-- X of Y --, Page X of Y)
   * - Strips language labels (en - Original Instructions)
   * - Strips TOC dot leaders
   * - Normalizes excessive whitespace
   */
  public static cleanChunkContent(rawContent: string): string {
    if (!rawContent) return '';
    return rawContent
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
      .replace(/\bPage\s+\d+(\s+of\s+\d+)?\b/gi, '')
      .replace(/\b(en\s*-\s*)?Original\s+Instructions\b/gi, '')
      .replace(/\bCod\.\s*\d+\b/gi, '')
      .replace(/\.{4,}\s*\d+/g, '')
      .replace(/^[a-z]{1,4}\s+(?=may\b|be\b|the\b|of\b|to\b)/i, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }

  public static isHighSignalChunk(content: string): boolean {
    if (!content || content.trim().length < 40) return false;
    const trimmed = content.trim();
    if (/^[\d\s.,;:\-_/\\#|]+$/.test(trimmed)) return false;
    if (/^(--\s*\d+\s+of\s+\d+\s*--|page\s+\d+|table of contents)$/i.test(trimmed)) return false;
    return true;
  }

  public static normalizeToEnglishRetrievalQuery(query: string, language?: string): string {
    if (!query) return '';
    const text = query.trim();

    // Check if query contains non-ASCII or targetLanguage is non-English
    const hasNonAscii = /[^\x00-\x7F]/.test(text);
    if (!hasNonAscii && (!language || language.startsWith('en'))) {
      return text;
    }

    const industrialReplacements: Array<[RegExp, string]> = [
      // Hindi / Devanagari transliterations & keywords
      [/जेनरेट|जनरेट|तैयार/gi, 'generate create'],
      [/प्रिवेंटिव|प्रीवेंटिव/gi, 'preventive'],
      [/मेंटेनेंस|रखरखाव/gi, 'maintenance'],
      [/शेड्यूल|समय सारणी/gi, 'schedule'],
      [/टॉर्क|टार्क/gi, 'torque'],
      [/प्रेशर|दबाव/gi, 'pressure'],
      [/टेंपरेचर|तापमान/gi, 'temperature'],
      [/एलओटीओ|लोटो/gi, 'LOTO lockout tagout'],
      [/प्रक्रिया|विधि/gi, 'procedure step'],
      [/कंप्रेसर/gi, 'compressor'],
      [/पंप/gi, 'pump'],
      [/वाल्व|वॉल्व/gi, 'valve'],
      [/सील/gi, 'seal'],
      [/ऑयल|तेल/gi, 'oil lubricant'],
      [/वोल्टेज/gi, 'voltage'],
      [/करंट/gi, 'current ampere'],
      [/वाइब्रेशन|कंपन/gi, 'vibration'],
      [/फ्लो|प्रवाह/gi, 'flow rate gpm'],
      [/लीक|रिसाव/gi, 'leak leakage'],
      [/मोटर/gi, 'motor'],
      [/बेयरिंग/gi, 'bearing'],
      [/गैसकेट/gi, 'gasket'],
      [/फ्लैंज/gi, 'flange'],
      [/बोल्ट/gi, 'bolt stud fastener'],
      [/निरीक्षण|इंस्पेक्शन/gi, 'inspection'],
      [/शटडाउन/gi, 'shutdown emergency stop'],
      [/आइसोलेशन/gi, 'isolation isolate'],
      [/अलार्म/gi, 'alarm trip'],
      [/फाल्ट|खराबी/gi, 'fault error'],
      [/क्या है|कितना है|कितनी है|बताएं|बताओ/gi, 'what is specifications'],
      [/एसओपी/gi, 'SOP standard operating procedure'],

      // Other Indian languages keywords
      [/तापमान|दाब|पडताळणी|अलगीकरण|धोका/gi, 'temperature pressure verification isolation hazard'],
      [/દબાણ|તાપમાન|ચકાસણી|જોખમ/gi, 'pressure temperature verification hazard'],
      [/அழுத்தம்|வெப்பநிலை|செயல்முறை|ஆபத்து/gi, 'pressure temperature procedure hazard'],
      [/పీడనం|ఉష్ణోగ్రత|విధానం|ప్రమాదం/gi, 'pressure temperature procedure hazard'],
      [/ಒತ್ತಡ|ತಾಪಮಾನ|ಕಾರ್ಯವಿಧಾನ|ಅಪಾಯ/gi, 'pressure temperature procedure hazard'],
      [/চাপ|তাপমাত্রা|পদ্ধতি|বিপদ/gi, 'pressure temperature procedure hazard'],
      [/ਦਬਾਅ|ਤਾਪਮਾਨ|ਪ੍ਰਕਿਰਿਆ|ਖਤਰਾ/gi, 'pressure temperature procedure hazard'],

      // Spanish, German, Japanese keywords
      [/mantenimiento preventivo/gi, 'preventive maintenance'],
      [/presión|temperatura|par de apriete|bloqueo/gi, 'pressure temperature torque lockout'],
      [/vorbeugende wartung/gi, 'preventive maintenance'],
      [/drehmoment|druck|temperatur|freischaltung/gi, 'torque pressure temperature lockout'],
      [/予防保守|定期保守/gi, 'preventive maintenance'],
      [/トルク|圧力|温度|アイソレーション/gi, 'torque pressure temperature isolation'],
    ];

    let normalized = text;
    for (const [pattern, replacement] of industrialReplacements) {
      normalized = normalized.replace(pattern, ` ${replacement} `);
    }

    const tagsAndTokens = text.match(/\b([A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?|\d+(?:\.\d+)?\s*(?:PSI|bar|RPM|°C|°F|Nm|ft-lbs)?)\b/gi) || [];
    const englishTokens = normalized.match(/[a-zA-Z0-9\-.]+/g) || [];

    const combined = Array.from(new Set([...tagsAndTokens, ...englishTokens])).join(' ');
    return combined.trim().length > 3 ? combined.trim() : text;
  }

  public async query(
    request: RAGQueryRequest,
    context: RAGContext
  ): Promise<RAGQueryResponse> {
    const { organizationId, userId, userRole } = context;
    const { plantId, assetId: rawAssetId, query, conversationId, imageUrl, topK = 5 } = request;
    const targetLanguage = request.language || 'en-US';
    const langConfig = getLanguageConfig(targetLanguage);
    let effectiveSearchQuery = RAGQueryEngine.normalizeToEnglishRetrievalQuery(query, targetLanguage);
    if (request.acousticTelemetry) {
      const patternHints: Record<string, string> = {
        CAVITATION_SUSPECTED: 'cavitation NPSH suction pressure impeller vapor bubbles pitting acoustic noise',
        BEARING_WEAR_SUSPECTED: 'bearing raceway lubrication grease vibration high frequency metallic spalling',
        IMBALANCE_SUSPECTED: 'unbalance alignment shaft runout coupling vibration baseline',
        NOMINAL: 'normal baseline vibration operating limits maintenance inspection',
      };
      const acousticHints = patternHints[request.acousticTelemetry.detectedPattern] || 'acoustic vibration diagnosis';
      effectiveSearchQuery = `${effectiveSearchQuery} ${acousticHints}`;
    }
    if (request.visionDiagnostic) {
      const visionHints =
        request.visionDiagnostic.safetyStatus === 'CRITICAL_OVERPRESSURE'
          ? 'discharge pressure overpressure MAWP maximum operating pressure limit relief valve'
          : request.visionDiagnostic.safetyStatus === 'SAFE_ZERO_ENERGY'
          ? 'lockout tagout zero energy state line pressure bleed valve OSHA 1910.147'
          : request.visionDiagnostic.safetyStatus === 'WEAR_DETECTED'
          ? 'mechanical seal face wear cavitation scoring leakage inspection'
          : 'analog gauge reading visual inspection';
      effectiveSearchQuery = `${effectiveSearchQuery} ${visionHints}`;
    }
    const rawMachineId = (request as any).machineId;
    const rawAssetTag = (request as any).assetTag;
    const cleanAssetId = rawAssetId ? sanitizeMachineOrAssetId(rawAssetId) : undefined;
    const cleanMachineId = rawMachineId ? sanitizeMachineOrAssetId(rawMachineId) : undefined;

    // Early defensive machine resolution to prevent PostgreSQL UUID type errors
    let machine: Machine | null = null;
    const candidateEntity = rawMachineId || rawAssetId || rawAssetTag;
    if (candidateEntity) {
      machine = await this.dataStore.getMachineById(organizationId, candidateEntity);
      if (!machine && cleanMachineId && cleanMachineId !== candidateEntity) {
        machine = await this.dataStore.getMachineById(organizationId, cleanMachineId);
      }
      if (!machine && cleanAssetId && cleanAssetId !== candidateEntity) {
        machine = await this.dataStore.getMachineById(organizationId, cleanAssetId);
      }
      if (!machine && rawAssetTag) {
        machine = await this.dataStore.getMachineByAssetTag(organizationId, rawAssetTag);
      }
    }

    let targetMachineId = machine ? (sanitizeUuid(machine.id) || machine.id) : null;
    const assetId = targetMachineId || (cleanAssetId && isUuid(cleanAssetId) ? cleanAssetId : (rawAssetId && isUuid(rawAssetId) ? rawAssetId : undefined));
    const machineId = targetMachineId || (cleanMachineId && isUuid(cleanMachineId) ? cleanMachineId : (rawMachineId && isUuid(rawMachineId) ? rawMachineId : undefined));

    // 0a. Backend-enforced plant scope and organization validation with Single-Factory Auto-Resolution
    let effectivePlantId = plantId;
    let plant: Plant | null = null;
    const allOrgPlants = await this.dataStore.listPlants(organizationId);
    const isSingleFactory = allOrgPlants.length <= 1;

    // Auto-resolve plant ONLY if missing, GENERAL, or not provided
    if (!effectivePlantId || effectivePlantId === 'GENERAL') {
      if (machine?.plantId) {
        effectivePlantId = machine.plantId;
      } else {
        const targetEntityId = machineId || assetId;
        if (targetEntityId) {
          const m = await this.dataStore.getMachineById(organizationId, targetEntityId);
          if (m?.plantId) {
            effectivePlantId = m.plantId;
          } else {
            const a = await this.dataStore.getAssetById(organizationId, targetEntityId);
            if (a?.plantId) {
              effectivePlantId = a.plantId;
            }
          }
        }
      }
      if (!effectivePlantId || effectivePlantId === 'GENERAL') {
        if (allOrgPlants.length > 0) {
          effectivePlantId = allOrgPlants[0].id || allOrgPlants[0].code;
          plant = allOrgPlants[0];
        }
      }
    }

    if (!plant && effectivePlantId && effectivePlantId !== 'GENERAL') {
      plant = await this.dataStore.getPlantById(organizationId, effectivePlantId);
      if (!plant) {
        plant = allOrgPlants.find((p) => p.code === effectivePlantId || p.id === effectivePlantId) || null;
      }
    }

    // In Single-Factory mode, fallback cleanly to the single registered plant ONLY if plantId was NOT explicitly passed as a foreign plant
    if (isSingleFactory && !plant && (!plantId || plantId === 'GENERAL') && allOrgPlants.length > 0) {
      plant = allOrgPlants[0];
    }

    if (!plant && effectivePlantId && effectivePlantId !== 'GENERAL') {
      await this.securityService.recordSecurityEvent({
        organizationId,
        actorUserId: userId,
        actorEmail: context.userEmail,
        actorRole: userRole,
        category: 'CROSS_PLANT_ACCESS',
        action: 'PLANT_ACCESS_ATTEMPT',
        resourceCategory: 'PLANT',
        resourceId: effectivePlantId,
        decision: 'DENIED',
        policyReasonCode: 'PLANT_NOT_IN_ORGANIZATION',
        severity: 'MEDIUM',
        isBenignInquiry: true,
      });
      throw new Error(`Unauthorized or invalid plant: Plant '${effectivePlantId}' does not belong to organization.`);
    }

    if (plant && !isSingleFactory) {
      // Validate cross-plant authorization in multi-plant environments
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
        throw new Error(`Unauthorized: User is not assigned to plant '${plant.code || plant.id}'.`);
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
    if (machine) {
      if (plant && machine.plantId && machine.plantId !== plant.id) {
        throw new Error(`Machine '${machine.assetTag}' does not belong to plant '${plant.code}'.`);
      }
      assetContext = {
        assetTag: machine.assetTag,
        name: machine.name,
        area: machine.area,
      };
    } else if (assetId) {
      const asset =
        (await this.dataStore.getAssetById(organizationId, assetId)) ||
        (cleanAssetId && cleanAssetId !== assetId ? await this.dataStore.getAssetById(organizationId, cleanAssetId) : null) ||
        (rawAssetId && rawAssetId !== assetId ? await this.dataStore.getAssetById(organizationId, rawAssetId) : null);
      if (!asset) {
        throw new Error(`Unauthorized or invalid asset: Asset '${rawAssetId || assetId}' does not belong to organization.`);
      }
      if (asset.plantId !== plant.id) {
        throw new Error(`Asset '${rawAssetId || assetId}' does not belong to the selected plant '${plantId}'.`);
      }
      assetContext = {
        assetTag: asset.assetTag,
        name: asset.name,
        area: asset.area,
      };
    }

    // 1b. Identify Machine if not already resolved
    if (!machine && machineId) {
      machine = await this.dataStore.getMachineById(organizationId, machineId);
    }
    if (!machine && rawMachineId && rawMachineId !== machineId) {
      machine = await this.dataStore.getMachineById(organizationId, rawMachineId);
    }
    if (!machine && assetId) {
      const allMachines = await this.dataStore.listMachines(organizationId);
      machine =
        allMachines.find(
          (m) =>
            m.id === assetId ||
            (cleanAssetId && m.id === cleanAssetId) ||
            m.parentAssetId === assetId ||
            (cleanAssetId && m.parentAssetId === cleanAssetId)
        ) || null;
    }
    targetMachineId = machine ? (sanitizeUuid(machine.id) || machine.id) : null;
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
        const mapping = await this.dataStore.getMachineSpecialistMapping(organizationId, targetMachineId || machine.id);
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
        machineId: targetMachineId || machine?.id || null,
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

    // Deterministic Hazard Classification outside LLM (Fix Bug #2 Part A)
    const combinedQueryForClassification = `${query} ${effectiveSearchQuery}`;
    const deterministicHazards = this.classifyHazard(combinedQueryForClassification, machine?.machineType);
    let deterministicLotoProcedure: string | null = null;
    let deterministicMawpLimit: string | number | null = machine?.operatingPressureMax ?? null;
    let deterministicVoltageLimit: string | number | null = null;
    let deterministicTorqueLimit: string | number | null = null;
    let deterministicRpmLimit: string | number | null = null;
    const deterministicSafetyAlerts: string[] = [];

    if (
      isImmediateHazard ||
      deterministicHazards.length > 0 ||
      /\b(hazardous|danger|dangerous|arc flash|toxic|loto|lockout|high pressure|emergency shutdown|radiation|chemical leak|explosion|lethal|critical failure|overheat|overheating|abnormal vibration)\b/i.test(
        combinedQueryForClassification
      )
    ) {
      isSafetyCritical = true;
    }

    if (machine) {
      // Query PostgreSQL / technicalSpecs directly for machine's verified LOTO isolation procedure & operating limits
      if (machine.technicalSpecs) {
        const specs = machine.technicalSpecs as Record<string, any>;
        if (specs.lotoIsolationProcedure) deterministicLotoProcedure = String(specs.lotoIsolationProcedure);
        if (specs.loto_isolation_procedure) deterministicLotoProcedure = String(specs.loto_isolation_procedure);
        if (specs.lotoProcedure) deterministicLotoProcedure = String(specs.lotoProcedure);
        if (specs.energyIsolation) deterministicLotoProcedure = String(specs.energyIsolation);

        if (!deterministicMawpLimit && (specs.mawp || specs.operatingPressureMax || specs.designDischargePressure)) {
          deterministicMawpLimit = specs.mawp || specs.operatingPressureMax || specs.designDischargePressure;
        }
        if (specs.ratedVoltage || specs.voltage || specs.operatingVoltage) {
          deterministicVoltageLimit = specs.ratedVoltage || specs.voltage || specs.operatingVoltage;
        }
        if (specs.tighteningTorque || specs.torque || specs.boltTorque) {
          deterministicTorqueLimit = specs.tighteningTorque || specs.torque || specs.boltTorque;
        }
        if (specs.nameplateRpm || specs.rpm || specs.ratedSpeed) {
          deterministicRpmLimit = specs.nameplateRpm || specs.rpm || specs.ratedSpeed;
        }
      }

      try {
        const approvedClaims = await this.dataStore.listEvidenceClaims(organizationId, {
          machineId: machine.id,
          status: 'APPROVED',
        });
        for (const claim of approvedClaims) {
          const f = claim.fieldName.toLowerCase();
          if (!deterministicLotoProcedure && (f.includes('loto') || f.includes('isolation'))) {
            deterministicLotoProcedure = String(claim.claimValue);
          }
          if (!deterministicMawpLimit && (f.includes('pressure') || f.includes('mawp'))) {
            deterministicMawpLimit = `${claim.claimValue} ${claim.unit || ''}`.trim();
          }
          if (!deterministicVoltageLimit && (f.includes('voltage') || f.includes('volt'))) {
            deterministicVoltageLimit = `${claim.claimValue} ${claim.unit || ''}`.trim();
          }
          if (!deterministicTorqueLimit && (f.includes('torque') || f.includes('tightening'))) {
            deterministicTorqueLimit = `${claim.claimValue} ${claim.unit || ''}`.trim();
          }
          if (!deterministicRpmLimit && (f.includes('rpm') || f.includes('speed'))) {
            deterministicRpmLimit = `${claim.claimValue} ${claim.unit || ''}`.trim();
          }
        }
      } catch {
        // non-blocking
      }

      const isPhysicalMaintenanceOrIsolation =
        /\b(maintenance|repair|overhaul|disassembly|teardown|replace|service|loto|lockout|tagout|isolate|isolation|open\s+casing|line\s+break|unbolt|flange\s+separation|रखरखाव|मरम्मत|मेंटेनेंस|आइसोलेशन|बदलें)\b/i.test(
          query
        ) ||
        /\b(maintenance|repair|overhaul|disassembly|teardown|replace|service|loto|lockout|tagout|isolate|isolation|open\s+casing|line\s+break|unbolt|flange\s+separation)\b/i.test(
          effectiveSearchQuery
        );

      if (deterministicHazards.length > 0 && isPhysicalMaintenanceOrIsolation) {
        const lotoAlert = formatLocalizedLotoAlert(langConfig, deterministicHazards, deterministicLotoProcedure);
        deterministicSafetyAlerts.push(lotoAlert);
      }

      const asksForOperatingLimits =
        isPhysicalMaintenanceOrIsolation &&
        (deterministicHazards.length > 0 ||
          /\b(mawp|torque|rpm|pressure|voltage|limit|limits|spec|specs|specification|operating limits)\b/i.test(query));

      if (asksForOperatingLimits && (deterministicMawpLimit || deterministicTorqueLimit || deterministicVoltageLimit || deterministicRpmLimit)) {
        let limitsAlert = `[VERIFIED OPERATING LIMITS] `;
        if (deterministicMawpLimit) {
          limitsAlert += `MAWP: ${deterministicMawpLimit}. `;
        }
        if (deterministicTorqueLimit) {
          limitsAlert += `Tightening Torque: ${deterministicTorqueLimit}. `;
        }
        if (deterministicRpmLimit) {
          limitsAlert += `Rated Speed: ${deterministicRpmLimit}. `;
        }
        if (deterministicVoltageLimit) {
          limitsAlert += `Rated Voltage: ${deterministicVoltageLimit}. `;
        }
        deterministicSafetyAlerts.push(limitsAlert.trim());
      }
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
        targetMachineId || machine.id,
        { query },
        userRole
      );

      const allHistory = await this.dataStore.getMachineMaintenanceHistory(
        organizationId,
        targetMachineId || machine.id
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
        targetMachineId || machine.id
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
        assetId: targetMachineId || (assetId && isUuid(assetId) ? assetId : null),
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
    if (request.acousticTelemetry) {
      (userMessage as any).acousticTelemetry = request.acousticTelemetry;
    }
    if (request.visionDiagnostic) {
      (userMessage as any).visionDiagnostic = request.visionDiagnostic;
    }
    if (request.imageUrl) {
      (userMessage as any).imageUrl = request.imageUrl;
    }

    // 4. Retrieve Candidate Chunks (Qdrant Hybrid Search Dense 768-dim + BM25 Sparse with RRF)
    let vectorHits: VectorSearchResult[] = [];
    try {
      const queryVector = await this.embeddingProvider.generateEmbedding(effectiveSearchQuery);
      vectorHits = await this.vectorStore.search(
        this.collectionName,
        queryVector,
        {
          organizationId,
          plantId: plant?.id,
        },
        30,
        effectiveSearchQuery
      );
    } catch (vErr: any) {
      logger.warn(
        { err: vErr?.message },
        'Vector store search encountered an error, falling back to PostgreSQL knowledge chunks retrieval'
      );
    }

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

      // Relational Asset-Document Verification (Migration 026)
      if (machine) {
        const isDirectMatch =
          (doc.assetTags && doc.assetTags.includes(machine.assetTag)) ||
          doc.machineId === machine.id ||
          (doc.assetIds && doc.assetIds.includes(machine.id)) ||
          (payload.assetId && (payload.assetId === machine.id || payload.assetId === machine.assetTag));

        const isRelationalMatch = await this.dataStore.isDocumentLinkedToAsset(
          organizationId,
          doc.id,
          machine.id
        );

        const isGeneralPlantDoc =
          (!doc.assetTags || doc.assetTags.length === 0) &&
          !doc.machineId &&
          (!doc.assetIds || doc.assetIds.length === 0) &&
          !payload.assetId;

        if (!isDirectMatch && !isRelationalMatch && !isGeneralPlantDoc) {
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

      const rawContent = (payload.content as string) || '';
      const cleanedContent = RAGQueryEngine.cleanChunkContent(rawContent);
      if (!RAGQueryEngine.isHighSignalChunk(cleanedContent)) {
        continue;
      }

      candidates.push({
        chunkId: (payload.chunkId as string) || hit.id,
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        documentTitle: doc.title,
        documentVersionId: (payload.documentVersionId as string) || '',
        pageNumber: Number(payload.pageNumber) || 1,
        content: cleanedContent,
        sectionHeading: (payload.sectionHeading as string) || null,
        initialScore: hit.score,
        isTable: Boolean(payload.isTable),
        isFigure: Boolean(payload.isFigure),
        extractionMethod: (payload.extractionMethod as string) || 'NATIVE_TEXT',
      });
    }

    // 5b. Resilient Database Augmentation: Ensure direct machine-linked technical manuals have chunks available
    const hasSpecificDocMatches = candidates.some((c) => {
      const cText = (c.documentNumber + ' ' + c.documentTitle).toLowerCase();
      return (
        (query.toLowerCase().includes('e-sv') && (cText.includes('esv') || cText.includes('e-sv'))) ||
        (machine && (cText.includes(machine.assetTag.toLowerCase()) || cText.includes(machine.name.toLowerCase())))
      );
    });

    if (candidates.length < 15 || !hasSpecificDocMatches) {
      try {
        const machineLinkedDocs: TechnicalDocument[] = [];
        const generalPlantDocs: TechnicalDocument[] = [];

        if (machine) {
          const directAndRelationalDocs = await this.dataStore.listDocuments(organizationId, {
            plantId: plant?.id,
            machineId: machine.id,
          });
          machineLinkedDocs.push(...directAndRelationalDocs);
        }

        const allPlantDocs = await this.dataStore.listDocuments(organizationId, {
          plantId: plant?.id,
        });

        for (const d of allPlantDocs) {
          const isTiedToOther = d.machineId && d.machineId !== machine?.id;
          if (!isTiedToOther && (!d.assetIds || d.assetIds.length === 0) && (!d.assetTags || d.assetTags.length === 0)) {
            generalPlantDocs.push(d);
          }
        }

        // Prioritize machine-linked docs, but supplement with general docs if < 3
        const fallbackDocList = [...machineLinkedDocs];
        if (fallbackDocList.length < 3) {
          for (const gd of generalPlantDocs) {
            if (!fallbackDocList.some((d) => d.id === gd.id)) {
              fallbackDocList.push(gd);
            }
          }
        }
        if (fallbackDocList.length === 0) {
          fallbackDocList.push(...allPlantDocs);
        }

        // Sort fallback docs so documents matching specific query model/title terms (e.g. e-SV, Lowara, pump, compressor) are prioritized
        const queryLower = effectiveSearchQuery.toLowerCase();
        const mTypeLower = (machine?.machineType || '').toLowerCase();
        const mNameLower = (machine?.name || '').toLowerCase();
        const mTagLower = (machine?.assetTag || '').toLowerCase();
        const mModelLower = (machine?.modelNumber || '').toLowerCase();

        fallbackDocList.sort((a, b) => {
          const aText = (a.title + ' ' + a.documentNumber + ' ' + (a.assetTags || []).join(' ')).toLowerCase();
          const bText = (b.title + ' ' + b.documentNumber + ' ' + (b.assetTags || []).join(' ')).toLowerCase();
          let aScore = 0;
          let bScore = 0;

          // Match query terms
          if (queryLower.includes('e-sv') && (aText.includes('esv') || aText.includes('e-sv'))) aScore += 15;
          if (queryLower.includes('e-sv') && (bText.includes('esv') || bText.includes('e-sv'))) bScore += 15;
          if ((queryLower.includes('compressor') || queryLower.includes('com-101') || queryLower.includes('compressed')) && aText.includes('compress')) aScore += 15;
          if ((queryLower.includes('compressor') || queryLower.includes('com-101') || queryLower.includes('compressed')) && bText.includes('compress')) bScore += 15;

          // Match machine model / name
          if (mModelLower && aText.includes(mModelLower)) aScore += 10;
          if (mModelLower && bText.includes(mModelLower)) bScore += 10;
          if (mTagLower && (aText.includes(mTagLower) || (a.assetTags && a.assetTags.includes(machine!.assetTag)))) aScore += 8;
          if (mTagLower && (bText.includes(mTagLower) || (b.assetTags && b.assetTags.includes(machine!.assetTag)))) bScore += 8;

          // If machine is a pump and document is a pump manual vs compressor manual
          const isPumpMachine = mTypeLower.includes('pump') || mNameLower.includes('pump') || mTagLower.includes('pump');
          if (isPumpMachine) {
            if (aText.includes('pump') || aText.includes('esv') || aText.includes('lowara')) aScore += 12;
            if (bText.includes('pump') || bText.includes('esv') || bText.includes('lowara')) bScore += 12;
            if (aText.includes('compress')) aScore -= 15;
            if (bText.includes('compress')) bScore -= 15;
          }

          const isCompressorMachine = mTypeLower.includes('compress') || mNameLower.includes('compress') || mTagLower.includes('com');
          if (isCompressorMachine) {
            if (aText.includes('compress') || aText.includes('air manual')) aScore += 12;
            if (bText.includes('compress') || bText.includes('air manual')) bScore += 12;
            if (aText.includes('pump') || aText.includes('esv')) aScore -= 15;
            if (bText.includes('pump') || bText.includes('esv')) bScore -= 15;
          }

          return bScore - aScore;
        });

        for (const doc of fallbackDocList) {
          const versionId =
            doc.latestVersion?.id ||
            (await this.dataStore.listDocumentVersions(doc.id))[0]?.id;

          if (versionId) {
            const docChunks = await this.dataStore.listKnowledgeChunks(versionId);
            for (const ch of docChunks) {
              const cleanedContent = RAGQueryEngine.cleanChunkContent(ch.content);
              if (!RAGQueryEngine.isHighSignalChunk(cleanedContent)) {
                continue;
              }
              if (!candidates.some((c) => c.chunkId === ch.id)) {
                candidates.push({
                  chunkId: ch.id,
                  documentId: doc.id,
                  documentNumber: doc.documentNumber,
                  documentTitle: doc.title,
                  documentVersionId: versionId,
                  pageNumber: ch.pageNumber,
                  content: cleanedContent,
                  sectionHeading: ch.sectionHeading,
                  initialScore: candidates.length === 0 ? 0.85 : 0.45,
                  isTable: ch.isTable,
                  isFigure: ch.isFigure,
                  extractionMethod: ch.extractionMethod,
                });
              }
            }
          }
        }
      } catch (dbFallbackErr: any) {
        logger.warn({ err: dbFallbackErr?.message }, 'PostgreSQL chunk fallback encountered error');
      }
    }

    // 5c. Hybrid Keyword Matching: Boost candidate chunks matching exact equipment tags, SOP numbers, or critical parameters
    const exactTagOrSpecTokens =
      effectiveSearchQuery.match(
        /\b([A-Za-z0-9]+-[A-Za-z0-9]+(-[A-Za-z0-9]+)?|SOP-[A-Z]+-[0-9]+|\d+(?:\.\d+)?\s*(?:PSI|ft-lbs|Nm|RPM|PSIG|GPM|HP))\b/gi
      ) || [];

    if (exactTagOrSpecTokens.length > 0) {
      for (const token of exactTagOrSpecTokens) {
        const lowerToken = token.toLowerCase();
        for (const cand of candidates) {
          if (
            cand.content.toLowerCase().includes(lowerToken) ||
            cand.documentNumber.toLowerCase().includes(lowerToken) ||
            cand.documentTitle.toLowerCase().includes(lowerToken) ||
            (cand.sectionHeading && cand.sectionHeading.toLowerCase().includes(lowerToken))
          ) {
            cand.initialScore = Math.max(cand.initialScore, 0.95);
          }
        }
      }
    }

    const STOPWORDS = new Set([
      'what', 'are', 'the', 'and', 'for', 'with', 'from', 'that', 'this',
      'how', 'why', 'can', 'should', 'would', 'could', 'does', 'did', 'was', 'were',
      'about', 'into', 'over', 'after', 'before', 'between', 'under'
    ]);
    const querySubjectWords = effectiveSearchQuery
      .toLowerCase()
      .split(/[\s,.;:!?()]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));

    for (const cand of candidates) {
      const cContent = cand.content.toLowerCase();
      const cHeading = (cand.sectionHeading || '').toLowerCase();
      const cDoc = (cand.documentNumber + ' ' + cand.documentTitle).toLowerCase();

      let matchCount = 0;
      for (const w of querySubjectWords) {
        const stem = w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w;
        if (cContent.includes(w) || cContent.includes(stem)) matchCount++;
        if (cHeading.includes(w) || cHeading.includes(stem)) matchCount += 1.5;
        if (cDoc.includes(w) || cDoc.includes(stem)) matchCount += 1.0;
      }

      if (matchCount > 0) {
        cand.initialScore += matchCount * 0.15;
      }

      if (cContent.includes('elevation') && (cContent.includes('temperature') || cContent.includes('operating'))) {
        cand.initialScore += 1.0;
      }
    }

    candidates.sort((a, b) => b.initialScore - a.initialScore);

    // Stop treating low-relevance matches as valid evidence: filter noise below 0.45 threshold
    const filteredCandidates = candidates.filter((c) => c.initialScore >= 0.45);
    const candidatePool = filteredCandidates.length >= 3 ? filteredCandidates : candidates.filter((c) => c.initialScore >= 0.40);

    // Deduplicate overlapping chunks from the same page
    const dedupedCandidates: RerankCandidate[] = [];
    const seenByPage = new Map<string, RerankCandidate>();

    for (const cand of (candidatePool.length > 0 ? candidatePool : candidates)) {
      const pageKey = `${cand.documentId}:${cand.pageNumber}`;
      const existing = seenByPage.get(pageKey);
      if (!existing) {
        seenByPage.set(pageKey, cand);
        dedupedCandidates.push(cand);
      } else {
        // If content is nearly identical or one contains the other, keep the longer/higher-scoring chunk
        if (cand.content.length > existing.content.length && cand.content.includes(existing.content.slice(0, 60))) {
          const idx = dedupedCandidates.indexOf(existing);
          if (idx !== -1) dedupedCandidates[idx] = cand;
          seenByPage.set(pageKey, cand);
        } else if (!existing.content.includes(cand.content.slice(0, 60))) {
          dedupedCandidates.push(cand);
        }
      }
    }

    // 6. Rerank Candidates with broader candidate window (topK 8 to 12)
    const effectiveTopK = Math.max(topK || 5, 8);
    let reranked: RerankResult[] = [];
    try {
      reranked = await this.rerankingProvider.rerank(effectiveSearchQuery, dedupedCandidates, effectiveTopK);
    } catch (rErr: any) {
      logger.warn({ err: rErr?.message }, 'Reranker error, using candidate order directly');
      reranked = dedupedCandidates.slice(0, effectiveTopK).map((c) => ({ ...c, rerankScore: c.initialScore }));
    }

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
          documentId: targetMachineId || machine.id,
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
        documentId: targetMachineId || machine.id,
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
        documentId: targetMachineId || machine.id,
        documentNumber: `HIST-${machine.assetTag}`,
        documentTitle: `Maintenance History Ledger for ${machine.assetTag}`,
        documentVersionId: '1.0',
        pageNumber: 1,
        content: `Authorized Maintenance History Ledger for ${machine.assetTag}: No relevant approved maintenance records or historical fault entries exist in the asset maintenance registry for this machine. Note: This indicates the absence of recorded maintenance entries in the database, not that a fault has never occurred in the asset operating history.`,
        sectionHeading: 'Machine Maintenance History Ledger',
        score: 0.99,
      });
    }

    // 6c. Governed Machine Knowledge Recovery: Include Master Machine Ledger & Evidence Claims
    if (machine) {
      const allClaims = await this.dataStore.listEvidenceClaims(organizationId, {
        machineId: targetMachineId || machine.id,
      });

      const specLines: string[] = [
        `- Asset Tag: ${machine.assetTag}`,
        `- Name: ${machine.name}`,
        `- Equipment Type: ${machine.machineType || 'Industrial Equipment'}`,
        `- Location / Area: ${machine.area || 'Main Production'}`,
      ];
      if (machine.manufacturer) specLines.push(`- Manufacturer / OEM: ${machine.manufacturer}`);
      if (machine.modelNumber) specLines.push(`- Model Number: ${machine.modelNumber}`);
      if (machine.serialNumber) specLines.push(`- Serial Number: ${machine.serialNumber}`);
      if (machine.operationalState) specLines.push(`- Operational State: ${machine.operationalState}`);
      if (machine.technicalSpecs && typeof machine.technicalSpecs === 'object') {
        for (const [k, v] of Object.entries(machine.technicalSpecs)) {
          specLines.push(`- [SPECIFICATION] ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        }
      }

      for (const c of allClaims) {
        specLines.push(
          `- [MACHINE EVIDENCE CLAIM - ${c.status}] ${c.displayName || c.fieldName}: ${c.claimValue} ${c.unit || ''} (Source: ${c.sourceType}, Rev: ${c.sourceRevision || 'N/A'}, Page: ${c.sourcePageNumber || 'N/A'})`
        );
      }

      // Enrich assetContext with full specs and claims for the inference generator
      if (assetContext) {
        (assetContext as any).specs = specLines;
        (assetContext as any).claims = allClaims;
        (assetContext as any).manufacturer = machine.manufacturer;
        (assetContext as any).modelNumber = machine.modelNumber;
        (assetContext as any).serialNumber = machine.serialNumber;
        (assetContext as any).technicalSpecs = machine.technicalSpecs;
      }

      // If no document chunks were retrieved from Qdrant or DB fallback, provide master specs as evidence
      if (authorizedEvidence.length === 0) {
        authorizedEvidence.push({
          chunkId: `master_spec_${machine.id}`,
          documentId: targetMachineId || machine.id,
          documentNumber: `MASTER-SPEC-${machine.assetTag}`,
          documentTitle: `Master Machine Ledger & Specifications for ${machine.assetTag}`,
          documentVersionId: '1.0',
          pageNumber: 1,
          content: `Authoritative Machine Ledger & Evidence Specifications for ${machine.assetTag} (${machine.name}):\n${specLines.join('\n')}`,
          sectionHeading: 'Authoritative Machine Ledger & Engineering Specifications',
          score: 0.99,
        });
      }
    }

    // 6d. Governed Expert Knowledge Library Entries (Prompt 04)
    // Only APPROVED entries are surfaced as verified evidence; REVOKED or SUPERSEDED are excluded!
    const expertKnowledgeList = await this.dataStore.listExpertKnowledgeEntries(organizationId, {
      plantId: plant.id,
      machineId: targetMachineId || machine?.id,
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
        targetLanguage,
        retrievalQuery: effectiveSearchQuery,
        acousticTelemetry: request.acousticTelemetry,
        visionDiagnostic: request.visionDiagnostic,
      });
    } else {
      generationResult = await this.generationProvider.generateAnswer({
        query,
        authorizedEvidence,
        assetContext,
        plantContext: { code: plant.code, name: plant.name },
        targetLanguage,
        retrievalQuery: effectiveSearchQuery,
        acousticTelemetry: request.acousticTelemetry,
        visionDiagnostic: request.visionDiagnostic,
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
      !request.acousticTelemetry &&
      !request.visionDiagnostic &&
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
      !request.acousticTelemetry &&
      !request.visionDiagnostic &&
      !isGeneralKnowledgeQuestion &&
      !isMachineIssueWithoutIdentity &&
      (isWorkerRequestingSupport ||
        generationResult.isInsufficientEvidence ||
        generationResult.confidence === 'INSUFFICIENT_EVIDENCE' ||
        (isSafetyCritical && (authorizedEvidence.length === 0 || authorizedEvidence.every((e) => e.chunkId.startsWith('master_spec_')))) ||
        (isOldOrIncompleteMachine && (authorizedEvidence.length === 0 || authorizedEvidence.every((e) => e.chunkId.startsWith('master_spec_')))));

    if (machine && (isOldOrIncompleteMachine || shouldEscalate)) {
      try {
        createdTask = await this.dataStore.createMissingInfoTask(organizationId, {
          machineId: targetMachineId || machine.id,
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
          targetMachineId || machine.id,
          query
        );
        if (activeDuplicate) {
          createdTicket = activeDuplicate;
          logger.info(
            { ticketNumber: activeDuplicate.ticketNumber, machineId: targetMachineId || machine.id },
            'Prevented duplicate ticket creation: returning active ticket.'
          );
        }
      }

      // 2. If no active duplicate, route to qualified specialist or Admin triage
      if (!createdTicket) {
        const routing = await this.routingService.routeSpecialist(
          organizationId,
          plant.id,
          targetMachineId || machine?.id || null
        );

        createdTicket = await this.dataStore.createSpecialistTicket(organizationId, {
          plantId: plant.id,
          machineId: targetMachineId || machine?.id || null,
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

    const asksForMeasurement =
      /\b(current|live|real-time|sensor|gauge\s*reading|telemetry)\b/i.test(query) &&
      /\b(reading|temperature|temp|pressure|vibration|flow|level)\b/i.test(query);
    const hasTrustedMeasurement =
      machineMaintenanceRecords.some((r) => r.measurements && r.measurements.length > 0) ||
      Boolean(machine?.technicalSpecs && ((machine.technicalSpecs as any).temperature || (machine.technicalSpecs as any).operatingPressure));

    let finalAnswer = sanitizedAnswer;

    if (generationResult.conflictDetected) {
      // Preserves conflict detection warning formulated in generationResult
    } else if (isMachineIssueWithoutIdentity) {
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
    } else if (createdTicket && isSafetyCritical) {
      finalAnswer = `[SAFETY ESCALATION] This inquiry involves safety-critical or hazardous operating parameters. ForgeX AI strictly prohibits guessing or generating unverified operating procedures. Ticket ${createdTicket.ticketNumber} has been created (${createdTicket.assignmentStatus.replace(/_/g, ' ')}) and routed to ${createdTicket.assignedSpecialistName || 'the specialist queue'} for qualified human review.`;
    } else if (createdTicket) {
      finalAnswer = `${langConfig.insufficientEvidenceMessage} Ticket ${createdTicket.ticketNumber} has been automatically created and routed to ${createdTicket.assignedSpecialistName || 'the specialist queue'} (${createdTicket.assignmentStatus.replace(/_/g, ' ')}).`;
    } else {
      if (safetyStopWarning) {
        finalAnswer = `${safetyStopWarning}\n\n${finalAnswer}`;
      }
    }

    if (asksForMeasurement && !hasTrustedMeasurement) {
      finalAnswer += `\n\n[MEASUREMENT NOTICE] ${langConfig.measurementNotice}`;
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

    // 10. Construct and Validate Citations with Verbatim Substring Check & Confidentiality Controls
    const citationsToSave = [];
    const isNonAdmin =
      userRole &&
      userRole !== 'ORGANIZATION_OWNER' &&
      userRole !== 'ORGANIZATION_ADMIN' &&
      userRole !== 'ENGINEER_TECHNICIAN';

    const normalizeWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim().toLowerCase();

    if (!generationResult.isInsufficientEvidence && !createdTicket) {
      if (generationResult.rawCitations && generationResult.rawCitations.length > 0) {
        for (const rawCit of generationResult.rawCitations) {
          // Check 1: Verify chunkId was actually returned by Qdrant in authorizedEvidence
          const evidenceMatch = authorizedEvidence.find((e) => e.chunkId === rawCit.chunkId);
          if (!evidenceMatch) {
            logger.warn(
              { chunkId: rawCit.chunkId },
              'Citation dropped: chunkId was not returned in Qdrant authorized evidence for this request'
            );
            continue;
          }

          // Check 2: Verify exactVerbatimQuote is a literal substring of that chunk's text (after whitespace normalization)
          const normQuote = normalizeWhitespace(rawCit.exactVerbatimQuote || '');
          const normContent = normalizeWhitespace(evidenceMatch.content || '');
          if (!normQuote || !normContent.includes(normQuote)) {
            logger.warn(
              { chunkId: rawCit.chunkId, quote: rawCit.exactVerbatimQuote },
              'Citation dropped: exactVerbatimQuote is not a literal substring of the candidate chunk text'
            );
            continue;
          }

          let snippetText: string;
          if (isNonAdmin) {
            snippetText = `Reference: [APPROVED GUIDANCE: ${evidenceMatch.documentNumber} - ${evidenceMatch.sectionHeading || 'Approved Section'} (Page ${evidenceMatch.pageNumber})]`;
          } else {
            snippetText = rawCit.exactVerbatimQuote.slice(0, 280);
          }

          citationsToSave.push({
            messageId: assistantMessage.id,
            documentId: evidenceMatch.documentId,
            documentNumber: evidenceMatch.documentNumber,
            documentTitle: evidenceMatch.documentTitle,
            documentVersionId: evidenceMatch.documentVersionId,
            pageNumber: rawCit.pageNumber || evidenceMatch.pageNumber,
            knowledgeChunkId: evidenceMatch.chunkId,
            snippet: snippetText,
            exactVerbatimQuote: rawCit.exactVerbatimQuote,
            confidenceScore: evidenceMatch.score,
            sectionHeading: evidenceMatch.sectionHeading,
          });
        }
      } else {
        for (const chunkId of generationResult.usedEvidenceChunkIds) {
          const evidenceMatch = authorizedEvidence.find((e) => e.chunkId === chunkId);
          if (evidenceMatch) {
            const firstLine = evidenceMatch.content.split('\n')[0] || evidenceMatch.content;
            const verbatimQuote = firstLine.slice(0, Math.min(firstLine.length, 120)).trim();
            const normQuote = normalizeWhitespace(verbatimQuote);
            const normContent = normalizeWhitespace(evidenceMatch.content);

            if (normQuote && normContent.includes(normQuote)) {
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
                exactVerbatimQuote: verbatimQuote,
                confidenceScore: evidenceMatch.score,
                sectionHeading: evidenceMatch.sectionHeading,
              });
            }
          }
        }
      }

      if (citationsToSave.length === 0 && authorizedEvidence.length > 0) {
        for (const evidenceMatch of authorizedEvidence.slice(0, 3)) {
          const firstLine = evidenceMatch.content.split('\n')[0] || evidenceMatch.content;
          const verbatimQuote = firstLine.slice(0, Math.min(firstLine.length, 120)).trim();
          citationsToSave.push({
            messageId: assistantMessage.id,
            documentId: evidenceMatch.documentId,
            documentNumber: evidenceMatch.documentNumber,
            documentTitle: evidenceMatch.documentTitle,
            documentVersionId: evidenceMatch.documentVersionId,
            pageNumber: evidenceMatch.pageNumber,
            knowledgeChunkId: evidenceMatch.chunkId,
            snippet: evidenceMatch.content.slice(0, 280),
            exactVerbatimQuote: verbatimQuote,
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
      safetyAlerts: deterministicSafetyAlerts.length > 0 ? deterministicSafetyAlerts : undefined,
      ticketId: createdTicket ? createdTicket.id : null,
      ticketNumber: createdTicket ? createdTicket.ticketNumber : null,
    };

    return {
      conversationId: conversation.id,
      userMessage: {
        ...userMessage,
        acousticTelemetry: request.acousticTelemetry || (userMessage as any).acousticTelemetry,
      },
      assistantMessage: completeAssistantMessage,
      questionMode: determinedQuestionMode,
      safetyAlerts: deterministicSafetyAlerts.length > 0 ? deterministicSafetyAlerts : undefined,
      ticket: createdTicket,
      missingInfoTask: createdTask,
      recurringFaultAnalysis,
      maintenanceRecords: machineMaintenanceRecords,
    };
  }

  private classifyHazard(query: string, machineType?: string | null): string[] {
    const matchedHazards: string[] = [];
    const text = `${query} ${machineType || ''}`.toLowerCase();

    if (/\b(electrical|voltage|480v|4160v|breaker|arc\s*flash|feeder|busbar|transformer|de-energiz|kv|phase|wire|grounding)\b/i.test(text)) {
      matchedHazards.push('ELECTRICAL');
    }
    if (/\b(pressure|psi|bar|kpa|psig|relief\s*valve|mawp|pressur|blowdown|piping|hydraulic)\b/i.test(text)) {
      matchedHazards.push('PRESSURE');
    }
    if (/\b(valve|block\s*valve|isolation\s*valve|bleed|suction\s*valve|discharge\s*valve|mov-\d+|ball\s*valve|gate\s*valve)\b/i.test(text)) {
      matchedHazards.push('VALVE');
    }
    if (/\b(thermal|temperature|hot|steam|overheat|celsius|fahrenheit|burn|heat|exhaust|boiler)\b/i.test(text)) {
      matchedHazards.push('THERMAL');
    }
    if (/\b(rotating|shaft|impeller|coupling|bearing|rpm|flywheel|motor\s*shaft|rotor|turbine)\b/i.test(text)) {
      matchedHazards.push('ROTATING_SHAFT');
    }
    if (/\b(maintenance|repair|overhaul|disassembly|teardown|replace|service|inspect|troubleshoot|install|calibration)\b/i.test(text)) {
      matchedHazards.push('MAINTENANCE');
    }
    if (/\b(loto|lockout|tagout|isolate|isolation|zero\s*energy|interlock|padlock|hasp)\b/i.test(text)) {
      matchedHazards.push('LOTO');
    }
    if (/\b(torque|ft-lbs|nm|bolt|tighten|flange|torque\s*spec|stud)\b/i.test(text)) {
      matchedHazards.push('TORQUE');
    }
    if (/\b(seal|gland|packing|mechanical\s*seal|stuffing\s*box|seal\s*flush|leakage)\b/i.test(text)) {
      matchedHazards.push('SEAL');
    }

    return matchedHazards;
  }
}
