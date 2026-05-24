import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, organizationId: string) {
    const property = await this.prisma.property.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        status: data.status || 'AVAILABLE',
        listingType: data.listingType || 'SALE',
        price: parseFloat(data.price),
        location: data.location,
        bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
        bathrooms: data.bathrooms ? parseInt(data.bathrooms) : null,
        areaSqft: data.areaSqft ? parseFloat(data.areaSqft) : null,
        images: data.images || [],
        amenities: data.amenities || [],
        assignedToId: data.assignedToId || null,
        ownerId: data.ownerId || null,
        organizationId,
      },
    });

    // Create initial price history log
    await this.prisma.propertyPriceHistory.create({
      data: {
        price: property.price,
        propertyId: property.id,
      },
    });

    return property;
  }

  async findAll(organizationId: string) {
    return this.prisma.property.findMany({
      where: { organizationId },
      include: {
        assignedTo: true,
        owner: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, organizationId },
      include: {
        assignedTo: true,
        owner: true,
        priceHistory: {
          orderBy: { changeDate: 'desc' },
        },
        clientInterests: {
          include: {
            client: true,
          },
        },
      },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async update(id: string, organizationId: string, data: any) {
    const property = await this.findOne(id, organizationId);
    
    const newPrice = data.price !== undefined ? parseFloat(data.price) : undefined;

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        status: data.status,
        listingType: data.listingType,
        price: newPrice,
        location: data.location,
        bedrooms: data.bedrooms !== undefined ? (data.bedrooms ? parseInt(data.bedrooms) : null) : undefined,
        bathrooms: data.bathrooms !== undefined ? (data.bathrooms ? parseInt(data.bathrooms) : null) : undefined,
        areaSqft: data.areaSqft !== undefined ? (data.areaSqft ? parseFloat(data.areaSqft) : null) : undefined,
        images: data.images,
        amenities: data.amenities,
        assignedToId: data.assignedToId,
        ownerId: data.ownerId,
      },
    });

    // Log price history if changed
    if (newPrice !== undefined && newPrice !== property.price) {
      await this.prisma.propertyPriceHistory.create({
        data: {
          price: newPrice,
          propertyId: id,
        },
      });
    }

    return updated;
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.property.delete({
      where: { id },
    });
  }

  // -----------------------------------------------------------------------------
  // Dynamic CRM / Lead matching
  // -----------------------------------------------------------------------------

  async findMatches(id: string, organizationId: string) {
    const property = await this.findOne(id, organizationId);
    
    // Find all clients in the same organization
    const clients = await this.prisma.client.findMany({
      where: { organizationId },
    });

    const matches = clients.map((client) => {
      let score = 0;
      const reasons: string[] = [];

      // 1. Budget Match (Clients buying budget)
      if (client.budget) {
        if (client.budget >= property.price) {
          score += 40;
          reasons.push(`Budget of PKR ${client.budget.toLocaleString()} matches list price.`);
        } else if (client.budget >= property.price * 0.75) {
          score += 25;
          reasons.push(`Budget is within 25% of listing price.`);
        }
      }

      // 2. Listing Type Compatibility
      if (client.type === 'BUYER' && property.listingType === 'SALE') {
        score += 20;
        reasons.push(`Client is a Buyer matching Sale Listing.`);
      } else if (client.type === 'TENANT' && property.listingType === 'RENT') {
        score += 20;
        reasons.push(`Client is a Tenant matching Rent Listing.`);
      }

      // 3. Keyword / Location Preferences Matching
      if (client.preferences) {
        const prefLower = client.preferences.toLowerCase();
        const locLower = property.location.toLowerCase();
        const titleLower = property.title.toLowerCase();

        // Location match
        if (prefLower.includes(locLower) || locLower.includes(prefLower)) {
          score += 20;
          reasons.push(`Preferred location aligns with property location.`);
        }

        // Bedroom match
        if (property.bedrooms) {
          const bedKeyword = `${property.bedrooms} bed`;
          if (
            prefLower.includes(bedKeyword) ||
            prefLower.includes(`${property.bedrooms}bed`) ||
            prefLower.includes(`${property.bedrooms} bhk`)
          ) {
            score += 20;
            reasons.push(`Bedroom requirements match (${property.bedrooms} Bed).`);
          }
        }

        // Property Type match
        const typeLower = property.type.toLowerCase();
        if (prefLower.includes(typeLower)) {
          score += 10;
          reasons.push(`Client preference matches property type (${property.type}).`);
        }
      }

      return {
        client,
        score,
        reasons,
      };
    });

    // Return matched clients sorted by match score
    return matches
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}
