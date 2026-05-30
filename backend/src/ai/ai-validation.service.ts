import { Injectable, Logger } from '@nestjs/common';

export interface DataValidationReport {
  completenessScore: number; // 0.0 - 1.0
  consistencyScore: number;  // 0.0 - 1.0
  missingFields: string[];
  inconsistencies: string[];
  anomaliesDetected: string[];
}

@Injectable()
export class AiValidationService {
  private readonly logger = new Logger(AiValidationService.name);

  validateDataQuality(domain: string, data: any): DataValidationReport {
    let completenessScore = 1.0;
    let consistencyScore = 1.0;
    const missingFields: string[] = [];
    const inconsistencies: string[] = [];
    const anomaliesDetected: string[] = [];

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        completenessScore: 0.0,
        consistencyScore: 1.0,
        missingFields: ['all'],
        inconsistencies: [],
        anomaliesDetected: [],
      };
    }

    const records = Array.isArray(data) ? data : [data];

    for (const record of records) {
      if (domain === 'HR') {
        if (!record.designation) {
          missingFields.push('designation');
          completenessScore -= 0.1;
        }
        if (!record.department) {
          missingFields.push('department');
          completenessScore -= 0.1;
        }
        if (record.status === 'ON_LEAVE' && record.assignedTasks && Array.isArray(record.assignedTasks)) {
          const activeTasks = record.assignedTasks.filter((t: any) => t.status !== 'COMPLETED');
          if (activeTasks.length > 0) {
            inconsistencies.push(`Employee profile is ON_LEAVE but has ${activeTasks.length} active tasks assigned.`);
            consistencyScore -= 0.25;
          }
        }
      } else if (domain === 'Finance') {
        if (record.baseSalary === null || record.baseSalary === undefined) {
          missingFields.push('baseSalary');
          completenessScore -= 0.2;
        }
        if (record.netSalary === null || record.netSalary === undefined) {
          missingFields.push('netSalary');
          completenessScore -= 0.2;
        }
        if (record.baseSalary !== undefined && record.allowances !== undefined && record.deductions !== undefined && record.netSalary !== undefined) {
          const expectedNet = record.baseSalary + record.allowances - record.deductions;
          if (Math.abs(expectedNet - record.netSalary) > 0.01) {
            inconsistencies.push(`Payroll net salary (${record.netSalary}) does not match formula: base (${record.baseSalary}) + allowances (${record.allowances}) - deductions (${record.deductions}).`);
            consistencyScore -= 0.3;
          }
        }
        if (record.salary === 0) {
          anomaliesDetected.push(`Active staff profile registers base salary of 0.`);
        }
      } else if (domain === 'Property') {
        if (!record.price) {
          missingFields.push('price');
          completenessScore -= 0.2;
        }
        if (!record.location) {
          missingFields.push('location');
          completenessScore -= 0.2;
        }
        if (record.price <= 0) {
          anomaliesDetected.push(`Property listed with invalid price: ${record.price}`);
          consistencyScore -= 0.2;
        }
      } else if (domain === 'Sales') {
        if (record.budget !== undefined && record.budget <= 0) {
          anomaliesDetected.push(`CRM client registers a budget of 0 or negative.`);
          consistencyScore -= 0.1;
        }
        if (record.status === 'CLOSED' && record.score < 50) {
          anomaliesDetected.push(`Lead is closed but qualification rating score is low (${record.score}).`);
        }
      } else if (domain === 'Logistics') {
        if (!record.plateNumber) {
          missingFields.push('plateNumber');
          completenessScore -= 0.2;
        }
        if (record.status === 'MAINTENANCE' && record.schedules && Array.isArray(record.schedules)) {
          const activeScheds = record.schedules.filter((s: any) => s.status === 'SCHEDULED' || s.status === 'IN_TRANSIT');
          if (activeScheds.length > 0) {
            inconsistencies.push(`Vehicle ${record.plateNumber} is in MAINTENANCE but has ${activeScheds.length} active delivery/viewing schedules.`);
            consistencyScore -= 0.4;
          }
        }
      }
    }

    return {
      completenessScore: Math.max(0.0, parseFloat(completenessScore.toFixed(2))),
      consistencyScore: Math.max(0.0, parseFloat(consistencyScore.toFixed(2))),
      missingFields: Array.from(new Set(missingFields)),
      inconsistencies,
      anomaliesDetected,
    };
  }
}
