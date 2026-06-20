import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Count of active members (leftAt IS NULL) — the denominator for all votes. */
  activeMemberCount(roomId: string) {
    return this.roomMember.count({ where: { roomId, leftAt: null } });
  }
}
