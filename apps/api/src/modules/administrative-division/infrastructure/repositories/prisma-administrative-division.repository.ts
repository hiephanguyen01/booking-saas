import { Injectable } from '@nestjs/common';
import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  IAdministrativeDivisionRepository,
  ResolvedAdministrativeAddress,
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

  async findWardInProvince(
    provinceCode: string,
    wardCode: string,
  ): Promise<ResolvedAdministrativeAddress | null> {
    const ward = await this.prisma.app.administrativeWard.findFirst({
      where: { code: wardCode, provinceCode },
      select: {
        code: true,
        provinceCode: true,
        name: true,
        type: true,
        province: { select: { code: true, name: true, type: true } },
      },
    });
    if (!ward) return null;
    return {
      province: ward.province,
      ward: {
        code: ward.code,
        provinceCode: ward.provinceCode,
        name: ward.name,
        type: ward.type,
      },
    };
  }
}
