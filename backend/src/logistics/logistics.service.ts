import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogisticsService {
  constructor(private prisma: PrismaService) {}

  // -----------------------------------------------------------------------------
  // Driver Profile Methods
  // -----------------------------------------------------------------------------

  async createDriver(data: any) {
    const { employeeProfileId, licenseNumber } = data;
    
    // Ensure employee profile exists
    const employee = await this.prisma.employeeProfile.findUnique({
      where: { id: employeeProfileId }
    });
    if (!employee) throw new NotFoundException('Employee Profile not found');

    const existing = await this.prisma.driverProfile.findUnique({
      where: { employeeProfileId }
    });
    if (existing) throw new ConflictException('Employee is already registered as a driver');

    return this.prisma.driverProfile.create({
      data: {
        employeeProfileId,
        licenseNumber,
        status: 'AVAILABLE'
      },
      include: {
        employeeProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        }
      }
    });
  }

  async findAllDrivers(organizationId: string) {
    return this.prisma.driverProfile.findMany({
      where: {
        employeeProfile: { organizationId }
      },
      include: {
        employeeProfile: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        }
      }
    });
  }

  async updateDriverStatus(driverId: string, status: string) {
    return this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { status }
    });
  }

  // -----------------------------------------------------------------------------
  // Vehicle Inventory & Maintenance Methods
  // -----------------------------------------------------------------------------

  async createVehicle(organizationId: string, data: any) {
    const { modelName, plateNumber } = data;

    const existing = await this.prisma.vehicle.findUnique({
      where: { plateNumber }
    });
    if (existing) throw new ConflictException('Vehicle plate number already registered');

    return this.prisma.vehicle.create({
      data: {
        modelName,
        plateNumber,
        status: 'ACTIVE',
        organizationId
      }
    });
  }

  async findAllVehicles(organizationId: string) {
    return this.prisma.vehicle.findMany({
      where: { organizationId },
      include: {
        maintenanceRequests: { orderBy: { requestDate: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async logVehicleMaintenance(vehicleId: string, data: any) {
    const { description, cost } = data;
    
    return this.prisma.$transaction(async (tx) => {
      const maintenance = await tx.vehicleMaintenance.create({
        data: {
          vehicleId,
          description,
          cost: cost ? parseFloat(cost) : null,
          status: 'PENDING'
        }
      });

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'MAINTENANCE' }
      });

      return maintenance;
    });
  }

  async updateMaintenanceStatus(maintenanceId: string, data: any) {
    const { status, cost } = data;

    return this.prisma.$transaction(async (tx) => {
      const maintenance = await tx.vehicleMaintenance.update({
        where: { id: maintenanceId },
        data: {
          status,
          cost: cost ? parseFloat(cost) : undefined,
          completionDate: status === 'COMPLETED' ? new Date() : null
        }
      });

      // If resolved or cancelled, put vehicle back to ACTIVE
      if (status === 'COMPLETED' || status === 'CANCELLED') {
        await tx.vehicle.update({
          where: { id: maintenance.vehicleId },
          data: { status: 'ACTIVE' }
        });
      }

      return maintenance;
    });
  }

  // -----------------------------------------------------------------------------
  // Logistics schedules
  // -----------------------------------------------------------------------------

  async createSchedule(data: any) {
    const { visitDate, pickupLocation, dropLocation, driverId, vehicleId, viewingId } = data;

    // Check availability if assigned
    if (driverId) {
      await this.prisma.driverProfile.update({
        where: { id: driverId },
        data: { status: 'BUSY' }
      });
    }

    return this.prisma.logisticsSchedule.create({
      data: {
        visitDate: new Date(visitDate),
        pickupLocation,
        dropLocation,
        driverId: driverId || null,
        vehicleId: vehicleId || null,
        viewingId: viewingId || null,
        status: 'SCHEDULED'
      },
      include: {
        driver: {
          include: {
            employeeProfile: {
              include: { user: { select: { firstName: true, lastName: true } } }
            }
          }
        },
        vehicle: true
      }
    });
  }

  async findAllSchedules(organizationId: string) {
    return this.prisma.logisticsSchedule.findMany({
      where: {
        OR: [
          { driver: { employeeProfile: { organizationId } } },
          { vehicle: { organizationId } }
        ]
      },
      include: {
        driver: {
          include: {
            employeeProfile: {
              include: { user: { select: { firstName: true, lastName: true } } }
            }
          }
        },
        vehicle: true
      },
      orderBy: { visitDate: 'desc' }
    });
  }

  async updateScheduleStatus(scheduleId: string, status: string) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await tx.logisticsSchedule.update({
        where: { id: scheduleId },
        data: { status }
      });

      // If finished/cancelled, put driver back to AVAILABLE
      if ((status === 'COMPLETED' || status === 'CANCELLED') && schedule.driverId) {
        await tx.driverProfile.update({
          where: { id: schedule.driverId },
          data: { status: 'AVAILABLE' }
        });
      }

      return schedule;
    });
  }

  // -----------------------------------------------------------------------------
  // Real Estate Property Key vault
  // -----------------------------------------------------------------------------

  async createKeyTracker(data: any) {
    const { keyTag, propertyId } = data;

    const existing = await this.prisma.keyTracker.findUnique({
      where: { keyTag }
    });
    if (existing) throw new ConflictException('Key tag code is already archived');

    return this.prisma.keyTracker.create({
      data: {
        keyTag,
        propertyId,
        status: 'IN_OFFICE'
      },
      include: {
        property: { select: { title: true, location: true } }
      }
    });
  }

  async findAllKeys(organizationId: string) {
    return this.prisma.keyTracker.findMany({
      where: {
        property: { organizationId }
      },
      include: {
        property: { select: { title: true, location: true } },
        checkouts: {
          include: {
            user: { select: { firstName: true, lastName: true } }
          },
          orderBy: { checkoutDate: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async checkoutKey(keyId: string, userId: string, notes?: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Log Checkout
      const checkout = await tx.keyCheckout.create({
        data: {
          keyId,
          userId,
          notes,
          checkoutDate: new Date()
        }
      });

      // 2. Update status of KeyTracker
      await tx.keyTracker.update({
        where: { id: keyId },
        data: { status: 'CHECKED_OUT' }
      });

      return checkout;
    });
  }

  async returnKey(checkoutId: string, notes?: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Return keys logs
      const checkout = await tx.keyCheckout.update({
        where: { id: checkoutId },
        data: {
          returnDate: new Date(),
          notes: notes ? notes : undefined
        }
      });

      // 2. Set back to office Cabinet
      await tx.keyTracker.update({
        where: { id: checkout.keyId },
        data: { status: 'IN_OFFICE' }
      });

      return checkout;
    });
  }
}
