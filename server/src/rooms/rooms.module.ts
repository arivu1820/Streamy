import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser } from '../common/auth.guard';
import { MembershipService } from '../common/membership.service';
import { DeleteVoteService } from '../videos/delete-vote.service';

class CreateRoomDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
}
class UpdateRoomDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService, private votes: DeleteVoteService) {}

  async create(userId: string, dto: CreateRoomDto) {
    // Atomically: room + its single permanent chat channel + first membership.
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: { name: dto.name, description: dto.description ?? null, createdById: userId },
      });
      await tx.chatChannel.create({ data: { roomId: room.id } });
      await tx.roomMember.create({ data: { roomId: room.id, userId } });
      return room;
    });
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.roomMember.findMany({
      where: { userId, leftAt: null },
      include: { room: true },
      orderBy: { joinedAt: 'desc' },
    });
    const rooms: any[] = [];
    for (const m of memberships) {
      const [memberCount, videoCount, activeSessions] = await Promise.all([
        this.prisma.activeMemberCount(m.roomId),
        this.prisma.video.count({ where: { roomId: m.roomId, deletedAt: null } }),
        this.prisma.watchSession.count({ where: { roomId: m.roomId, status: 'active' } }),
      ]);
      rooms.push({ ...m.room, memberCount, videoCount, activeSessions });
    }
    return rooms;
  }

  async detail(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return null;
    const [memberCount, videoCount, activeSessions] = await Promise.all([
      this.prisma.activeMemberCount(roomId),
      this.prisma.video.count({ where: { roomId, deletedAt: null } }),
      this.prisma.watchSession.count({ where: { roomId, status: 'active' } }),
    ]);
    return { ...room, memberCount, videoCount, activeSessions };
  }

  async members(roomId: string) {
    const ms = await this.prisma.roomMember.findMany({
      where: { roomId, leftAt: null },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    return ms.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      joinedAt: m.joinedAt,
    }));
  }

  /** Leave (self only). Triggers vote re-evaluation + empty-room archival. */
  async leave(roomId: string, userId: string) {
    await this.prisma.roomMember.updateMany({
      where: { roomId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    // A leave changes the denominator: re-evaluate all delete votes in the room.
    await this.votes.reevaluateRoom(roomId);

    const remaining = await this.prisma.activeMemberCount(roomId);
    if (remaining === 0) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'archived', archivedAt: new Date() },
      });
    }
    return { left: true, remainingMembers: remaining };
  }
}

@Controller('rooms')
export class RoomsController {
  constructor(private rooms: RoomsService, private membership: MembershipService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateRoomDto) {
    return this.rooms.create(u.id, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.rooms.listForUser(u.id);
  }

  @Get(':roomId')
  async detail(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string) {
    await this.membership.assertActiveMember(roomId, u.id);
    return this.rooms.detail(roomId);
  }

  @Get(':roomId/members')
  async members(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string) {
    await this.membership.assertActiveMember(roomId, u.id);
    return this.rooms.members(roomId);
  }

  @Patch(':roomId')
  async update(
    @CurrentUser() u: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    await this.membership.assertActiveMember(roomId, u.id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    return this.rooms['prisma'].room.update({ where: { id: roomId }, data });
  }

  @Post(':roomId/leave')
  async leave(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string) {
    await this.membership.assertActiveMember(roomId, u.id);
    return this.rooms.leave(roomId, u.id);
  }
}

@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
