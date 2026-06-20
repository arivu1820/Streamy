import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/** Shared membership/authorization helpers (enforces the permission matrix). */
@Injectable()
export class MembershipService {
  constructor(private prisma: PrismaService) {}

  async assertActiveMember(roomId: string, userId: string) {
    const m = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!m || m.leftAt) throw new ForbiddenException({ code: 'NOT_MEMBER' });
    return m;
  }

  async roomOrThrow(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND' });
    return room;
  }
}
