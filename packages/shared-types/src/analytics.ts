import type { TicketSeverity, TicketStatus, SpecialistTicket } from './specialists.js';

export interface IssueFrequencyMetric {
  faultCategory: string;
  count: number;
  percentage: number;
}

export interface TopAffectedMachineMetric {
  machineId: string;
  assetTag: string;
  machineName: string;
  plantId: string;
  ticketCount: number;
  recurringFaultCount: number;
  openTicketCount: number;
  resolvedTicketCount: number;
}

export interface SpecialistWorkloadMetric {
  specialistId: string;
  specialistName: string;
  openCount: number;
  inProgressCount: number;
  resolvedCount: number;
  overdueCount: number;
}

export interface KnowledgeGapMetric {
  machineId: string;
  assetTag: string;
  machineName: string;
  documentationReadiness: string;
  missingFields: string[];
  unverifiedClaimsCount: number;
  unansweredQuestionsCount: number;
}

export interface UnansweredQuestionSample {
  conversationId: string;
  query: string;
  createdAt: string;
  plantId: string;
  machineAssetTag?: string | null;
}

export interface OperationalAnalyticsFilterOptions {
  plantId?: string;
  timeWindowDays?: number; // e.g. 7, 30, 90, or null/undefined for all time
}

export interface OperationalAnalyticsDashboard {
  timeWindowDays: number | null;
  plantFilter: string | null;
  generatedAt: string;

  // High-level counts
  totalTickets: number;
  openTicketsCount: number;
  inProgressTicketsCount: number;
  resolvedTicketsCount: number;
  reopenedTicketsCount: number;
  unassignedTicketsCount: number;
  escalatedTicketsCount: number;

  // Verified Time-to-Resolution (TTR) metrics
  // Formula: verified resolution timestamp minus ticket creation timestamp
  // Excludes unresolved tickets (OPEN, IN_PROGRESS, PENDING_VERIFICATION, REOPENED, UNRESOLVED)
  resolvedTicketsSampleCount: number;
  averageTimeToResolutionMinutes: number;
  medianTimeToResolutionMinutes: number;

  // Breakdown metrics
  ticketsBySeverity: Record<TicketSeverity, number>;
  ticketsByStatus: Record<TicketStatus, number>;
  ticketsByType: Record<string, number>;

  // Issue frequencies & repeat analytics
  mostFrequentlyReportedIssues: IssueFrequencyMetric[];
  topAffectedMachines: TopAffectedMachineMetric[];
  reopenedTickets: SpecialistTicket[];
  repeatedFaultsCount: number;

  // Copilot & Knowledge intelligence
  unansweredCopilotQuestionsCount: number;
  unansweredQuestionsSample: UnansweredQuestionSample[];
  knowledgeGapsByMachine: KnowledgeGapMetric[];

  // Specialist operations
  specialistWorkloads: SpecialistWorkloadMetric[];
  overdueCasesCount: number;
}
