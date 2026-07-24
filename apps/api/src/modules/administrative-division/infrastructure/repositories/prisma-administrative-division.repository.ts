import { Injectable } from '@nestjs/common';
import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  AdministrativeAddressCandidates,
  IAdministrativeDivisionRepository,
} from '../../domain/ports/administrative-division-repository.port';

@Injectable()
export class PrismaAdministrativeDivisionRepository implements IAdministrativeDivisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listProvinces(): Promise<AdministrativeProvince[]> {
    return this.prisma.app.administrativeProvince.findMany({
      select: { code: true, name: true, type: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listWards(provinceCode: string): Promise<AdministrativeWard[]> {
    return this.prisma.app.administrativeWard.findMany({
      where: { provinceCode },
      select: { code: true, provinceCode: true, name: true, type: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findAddressCandidates(
    provinceCode: string,
    wardCode: string,
  ): Promise<AdministrativeAddressCandidates> {
    const [province, ward] = await Promise.all([
      this.prisma.app.administrativeProvince.findUnique({
        where: { code: provinceCode },
        select: { code: true, name: true, type: true },
      }),
      this.prisma.app.administrativeWard.findUnique({
        where: { code: wardCode },
        select: { code: true, provinceCode: true, name: true, type: true },
      }),
    ]);
    return { province, ward };
  }
}
