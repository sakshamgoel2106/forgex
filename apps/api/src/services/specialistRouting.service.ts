import type { IDataStore } from '../db/dataStore.interface.js';
import type {
  TicketAssignmentStatus,
  EmployeeProfile,
} from '@forgex/shared-types';
import { logger } from '../utils/logger.js';

export interface SpecialistRoutingResult {
  assignedSpecialistUserId: string | null;
  assignedSpecialistName: string | null;
  assignmentStatus: TicketAssignmentStatus;
  routingReason: string;
  matchedBackup: boolean;
  requiredAdminTriage: boolean;
}

export class SpecialistRoutingService {
  constructor(private dataStore: IDataStore) {}

  /**
   * Determine whether an employee profile meets all active, qualification, and plant coverage criteria.
   */
  public isQualifiedAndAvailable(
    profile: EmployeeProfile,
    plantId: string,
    requiredCertifications?: string[]
  ): { eligible: boolean; failureReason?: string } {
    if (profile.accountStatus !== 'ACTIVE') {
      return { eligible: false, failureReason: `Technician account status is ${profile.accountStatus}` };
    }

    if (profile.availabilityStatus !== 'AVAILABLE' && profile.availabilityStatus !== 'ON_DUTY') {
      return { eligible: false, failureReason: `Technician is currently ${profile.availabilityStatus}` };
    }

    if (profile.qualificationStatus !== 'CERTIFIED' && profile.qualificationStatus !== 'VERIFIED') {
      return {
        eligible: false,
        failureReason: `Technician qualification status is ${profile.qualificationStatus} (must be CERTIFIED or VERIFIED)`,
      };
    }

    // Plant coverage check
    if (profile.assignedPlantIds && profile.assignedPlantIds.length > 0) {
      if (!profile.assignedPlantIds.includes(plantId)) {
        return {
          eligible: false,
          failureReason: `Plant coverage mismatch: technician assigned to plants [${profile.assignedPlantIds.join(', ')}], machine located at ${plantId}`,
        };
      }
    }

    // Required certifications check
    if (requiredCertifications && requiredCertifications.length > 0) {
      const verified = new Set(profile.verifiedSkills.map((s) => s.toUpperCase()));
      const missing = requiredCertifications.filter((cert) => !verified.has(cert.toUpperCase()));
      if (missing.length > 0) {
        return {
          eligible: false,
          failureReason: `Missing required machine certifications: ${missing.join(', ')}`,
        };
      }
    }

    return { eligible: true };
  }

  /**
   * Route machine ticket strictly based on machine mapping, qualifications, plant coverage, and availability.
   * If neither primary nor backup is active & qualified, routes to authorized Admin triage.
   * NEVER invents an assignment.
   */
  public async routeSpecialist(
    organizationId: string,
    plantId: string,
    machineId?: string | null
  ): Promise<SpecialistRoutingResult> {
    if (!machineId) {
      return {
        assignedSpecialistUserId: null,
        assignedSpecialistName: null,
        assignmentStatus: 'ESCALATED_TRIAGE',
        routingReason: 'Clarification required: Missing machine identity. Routed to authorized Admin triage.',
        matchedBackup: false,
        requiredAdminTriage: true,
      };
    }

    const machine = await this.dataStore.getMachineById(organizationId, machineId);
    const targetPlantId = machine?.plantId || plantId;

    const mapping = await this.dataStore.getMachineSpecialistMapping(organizationId, machineId);
    if (!mapping) {
      logger.info(
        { organizationId, machineId },
        'No specialist mapping configured for machine. Routing to Admin triage.'
      );
      return {
        assignedSpecialistUserId: null,
        assignedSpecialistName: null,
        assignmentStatus: machine ? 'NEEDS_SPECIALIST_ASSIGNMENT' : 'ESCALATED_TRIAGE',
        routingReason: 'No machine-specialist mapping configured. Routed to authorized Admin triage.',
        matchedBackup: false,
        requiredAdminTriage: true,
      };
    }

    // 1. Evaluate Primary Specialist
    if (mapping.primarySpecialistUserId) {
      const primaryProfile = await this.dataStore.getEmployeeProfileByUserId(
        organizationId,
        mapping.primarySpecialistUserId
      );

      if (primaryProfile) {
        const check = this.isQualifiedAndAvailable(
          primaryProfile,
          targetPlantId,
          mapping.requiredCertifications
        );

        if (check.eligible) {
          return {
            assignedSpecialistUserId: mapping.primarySpecialistUserId,
            assignedSpecialistName: mapping.primarySpecialistName || primaryProfile.fullName,
            assignmentStatus: 'ASSIGNED_PRIMARY',
            routingReason: `Assigned to active, qualified primary specialist: ${primaryProfile.fullName}`,
            matchedBackup: false,
            requiredAdminTriage: false,
          };
        } else {
          logger.info(
            {
              primaryId: mapping.primarySpecialistUserId,
              reason: check.failureReason,
            },
            'Primary specialist failed eligibility check. Evaluating backup technicians.'
          );
        }
      }
    }

    // 2. Evaluate Approved Backup Technicians
    if (mapping.backupSpecialistUserIds && mapping.backupSpecialistUserIds.length > 0) {
      for (const backupUserId of mapping.backupSpecialistUserIds) {
        const backupProfile = await this.dataStore.getEmployeeProfileByUserId(
          organizationId,
          backupUserId
        );

        if (backupProfile && backupProfile.accountStatus === 'ACTIVE') {
          const isAvailable =
            backupProfile.availabilityStatus === 'AVAILABLE' ||
            backupProfile.availabilityStatus === 'ON_DUTY';
          const coversPlant =
            !backupProfile.assignedPlantIds ||
            backupProfile.assignedPlantIds.length === 0 ||
            backupProfile.assignedPlantIds.includes(targetPlantId);

          if (isAvailable && coversPlant) {
            return {
              assignedSpecialistUserId: backupUserId,
              assignedSpecialistName: backupProfile.fullName,
              assignmentStatus: 'ASSIGNED_BACKUP',
              routingReason: `Primary specialist unavailable/unqualified. Routed to approved backup technician: ${backupProfile.fullName}`,
              matchedBackup: true,
              requiredAdminTriage: false,
            };
          }
        }
      }
    }

    // 3. Neither primary nor backup is valid -> Route to Admin triage
    // Rule: "When no valid specialist exists, route to authorized Admin triage instead of inventing an assignment."
    return {
      assignedSpecialistUserId: null,
      assignedSpecialistName: null,
      assignmentStatus: machine ? 'NEEDS_SPECIALIST_ASSIGNMENT' : 'ESCALATED_TRIAGE',
      routingReason:
        'No active, qualified primary or backup specialist available for this machine. Routed to authorized Admin triage.',
      matchedBackup: false,
      requiredAdminTriage: true,
    };
  }
}
