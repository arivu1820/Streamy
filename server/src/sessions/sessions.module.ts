import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser } from '../common/auth.guard';
import { MembershipService } from '../common/membership.service';
import { SessionStateService } from '../realtime/session-state.service';

class StartDto {
  @IsString() videoId!: string;
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService, private state: SessionStateService) {}

  async start(roomId: string, userId: string, videoId: string) {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, roomId, deletedAt: null },
    });
    if (!video) throw new BadRequestException({ code: 'VIDEO_NOT_READY' });
    if (video.status !== 'ready') throw new BadRequestException({ code: 'VIDEO_NOT_READY' });

    const session = await this.prisma.watchSession.create({
      data: {
        roomId,
        createdById: userId,
        hostUserId: userId, // creator is host (MVP, FR-7.7)
        nowPlayingVideoId: videoId,
        isPlaying: false,
        lastPositionMs: 0,
      },
    });
    this.state.init(session.id, { hostUserId: userId, nowPlayingVideoId: videoId });
    return session;
  }

  async list(roomId: string) {
    const sessions = await this.prisma.watchSession.findMany({
      where: { roomId, status: 'active' },
      include: { nowPlaying: true, host: true },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      hostUserId: s.hostUserId,
      hostUsername: s.host.username,
      nowPlaying: s.nowPlaying ? { id: s.nowPlaying.id, title: s.nowPlaying.title } : null,
      participantCount: this.state.get(s.id)?.participants.size ?? 0,
      createdAt: s.createdAt,
    }));
  }

  async detail(sessionId: string) {
    const s = await this.prisma.watchSession.findUnique({
      where: { id: sessionId },
      include: { nowPlaying: true, host: true },
    });
    if (!s) return null;
    const snap = this.state.snapshot(sessionId);
    return {
      id: s.id,
      roomId: s.roomId,
      status: s.status,
      hostUserId: snap?.hostUserId ?? s.hostUserId,
      nowPlaying: s.nowPlaying ? { id: s.nowPlaying.id, title: s.nowPlaying.title } : null,
      isPlaying: snap?.isPlaying ?? s.isPlaying,
      positionMs: snap?.positionMs ?? s.lastPositionMs,
      participants: snap?.participants ?? [],
    };
  }
}

@Controller()
export class SessionsController {
  constructor(
    private sessions: SessionsService,
    private membership: MembershipService,
    private prisma: PrismaService,
  ) {}

  @Post('rooms/:roomId/sessions')
  async start(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string, @Body() dto: StartDto) {
    await this.membership.assertActiveMember(roomId, u.id);
    return this.sessions.start(roomId, u.id, dto.videoId);
  }

  @Get('rooms/:roomId/sessions')
  async list(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string) {
    await this.membership.assertActiveMember(roomId, u.id);
    return this.sessions.list(roomId);
  }

  @Get('sessions/:id')
  async detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const s = await this.prisma.watchSession.findUnique({ where: { id } });
    if (!s) throw new BadRequestException({ code: 'SESSION_NOT_FOUND' });
    await this.membership.assertActiveMember(s.roomId, u.id);
    return this.sessions.detail(id);
  }
}

@Module({
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
