/**
 * ForgeX AI — Standard Operating Procedure (SOP) & Troubleshooting Workflows
 */

import type { BoundingBox } from './documents.js';

export type SopStepStatus =
  | 'PENDING'
  | 'SAFETY_GATE_CHECK'
  | 'IN_PROGRESS'
  | 'DEVIATION_RECORDED'
  | 'VERIFIED'
  | 'BYPASSED_WITH_OVERRIDE';

export interface SafetyGate {
  id: string;
  type: 'LOTO' | 'PPE_CHECK' | 'PERMIT_TO_WORK' | 'ZERO_ENERGY_STATE';
  title: string;
  description: string;
  mandatoryAcknowledgement: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface SopStep {
  stepNumber: number;
  title: string;
  instructions: string;
  toolsRequired: string[];
  nominalTolerance?: {
    parameter: string; // e.g. "Bearing Clearance", "Torque"
    min: number;
    max: number;
    unit: string;      // e.g. "mm", "Nm"
  };
  safetyGates: SafetyGate[];
  referenceCitation?: {
    documentId: string;
    documentNumber: string;
    pageNumber: number;
    boundingBox?: BoundingBox;
  };
  status: SopStepStatus;
  recordedMeasurement?: number;
  deviationNotes?: string;
}

export interface SopExecutionRun {
  id: string;
  sopId: string;
  sopNumber: string;
  title: string;
  plantId: string;
  assetTag: string;
  operatorId: string;
  supervisorId?: string;
  currentStepIndex: number;
  steps: SopStep[];
  startedAt: string;
  completedAt?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'ABORTED_SAFETY_VIOLATION';
}
