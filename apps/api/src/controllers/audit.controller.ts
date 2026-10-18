import type { Request, Response } from 'express';
import type { IDataStore } from '../db/dataStore.interface.js';

export class AuditController {
  constructor(private dataStore: IDataStore) {}

  public list = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.auth!.organization.id;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const events = await this.dataStore.listAuditEvents(orgId, limit);

    res.status(200).json({
      success: true,
      data: events,
      timestamp: new Date().toISOString(),
      requestId: (req.headers['x-request-id'] as string) || 'req_audit',
    });
  };
}
