import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser } from '../common/auth.guard';
import { MembershipService } from '../common/membership.service';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';

@Controller('rooms')
export class ChatController {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private presence: PresenceService,
  ) {}

  // Paginated chat history (newest-first, keyset by createdAt).
  @Get(':roomId/messages')
  async messages(
    @CurrentUser() u: AuthUser,
    @Param('roomId') roomId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    await this.membership.assertActiveMember(roomId, u.id);
    const channel = await this.prisma.chatChannel.findUnique({ where: { roomId } });
    if (!channel) return { data: [], nextCursor: null };
    const take = Math.min(Number(limit) || 50, 100);
    const where: any = { channelId: channel.id };
    if (cursor) where.createdAt = { lt: new Date(cursor) };
    const rows = await this.prisma.chatMessage.findMany({
      where,
      include: { author: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
    const data = rows.map((m) => ({
      id: m.id,
      authorUserId: m.authorUserId,
      authorUsername: m.author.username,
      body: m.deletedAt ? '' : m.body,
      deleted: !!m.deletedAt,
      edited: !!m.editedAt,
      createdAt: m.createdAt,
    }));
    return {
      data: data.reverse(),
      nextCursor: rows.length === take ? rows[rows.length - 1].createdAt.toISOString() : null,
    };
  }

  // Presence snapshot for a room's members.
  @Get(':roomId/presence')
  async roomPresence(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string) {
    await this.membership.assertActiveMember(roomId, u.id);
    const members = await this.prisma.roomMember.findMany({
      where: { roomId, leftAt: null },
      select: { userId: true },
    });
    return this.presence.forUsers(members.map((m) => m.userId));
  }
}

@Module({
  controllers: [ChatController],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
