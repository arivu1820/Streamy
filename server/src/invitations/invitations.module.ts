import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Public } from '../common/auth.guard';
import { MembershipService } from '../common/membership.service';

class InviteDto {
  @IsEmail() email!: string;
}

@Controller()
export class InvitationsController {
  constructor(private prisma: PrismaService, private membership: MembershipService) {}

  @Post('rooms/:roomId/invitations')
  async create(
    @CurrentUser() u: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: InviteDto,
  ) {
    await this.membership.assertActiveMember(roomId, u.id);
    const email = dto.email.trim().toLowerCase();

    // Already an active member?
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const m = await this.prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId: existingUser.id } },
      });
      if (m && !m.leftAt) throw new ConflictException({ code: 'ALREADY_MEMBER' });
    }
    // One pending invite per (room, email).
    const pending = await this.prisma.invitation.findFirst({
      where: { roomId, invitedEmail: email, status: 'pending' },
    });
    if (pending) throw new ConflictException({ code: 'INVITE_ALREADY_PENDING' });

    const token = randomBytes(24).toString('hex');
    const inv = await this.prisma.invitation.create({
      data: {
        roomId,
        invitedEmail: email,
        invitedById: u.id,
        token,
        expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
    });
    const acceptUrl = `${process.env.WEB_ORIGIN || 'http://localhost:3000'}/invite/${token}`;
    // Demo: no email service. Log a "dev mailbox" line and return the link so the
    // user can test the accept flow. In prod this enqueues an email job.
    // eslint-disable-next-line no-console
    console.log(`[dev-mailbox] Invitation for ${email} -> ${acceptUrl}`);
    return { id: inv.id, invitedEmail: email, status: inv.status, acceptUrl, token };
  }

  @Get('rooms/:roomId/invitations')
  async list(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string) {
    await this.membership.assertActiveMember(roomId, u.id);
    return this.prisma.invitation.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete('invitations/:id')
  async revoke(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const inv = await this.prisma.invitation.findUnique({ where: { id } });
    if (!inv) throw new BadRequestException({ code: 'INVITE_INVALID' });
    await this.membership.assertActiveMember(inv.roomId, u.id);
    if (inv.status === 'pending') {
      await this.prisma.invitation.update({ where: { id }, data: { status: 'revoked' } });
    }
    return { revoked: true };
  }

  // Public token resolution for the accept page.
  @Public()
  @Get('invitations/:token')
  async resolve(@Param('token') token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { token },
      include: { room: true, invitedBy: true },
    });
    if (!inv) return { status: 'invalid' };
    let status = inv.status;
    if (status === 'pending' && inv.expiresAt < new Date()) status = 'expired';
    return {
      status,
      invitedEmail: inv.invitedEmail,
      roomName: inv.room.name,
      invitedBy: inv.invitedBy.username,
      expiresAt: inv.expiresAt,
    };
  }

  @Post('invitations/:token/accept')
  async accept(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    const inv = await this.prisma.invitation.findUnique({ where: { token } });
    if (!inv) throw new BadRequestException({ code: 'INVITE_INVALID' });
    if (inv.status !== 'pending') throw new BadRequestException({ code: 'INVITE_INVALID' });
    if (inv.expiresAt < new Date()) {
      await this.prisma.invitation.update({ where: { token }, data: { status: 'expired' } });
      throw new BadRequestException({ code: 'INVITE_EXPIRED' });
    }
    if (inv.invitedEmail !== u.email.toLowerCase()) {
      throw new ForbiddenException({ code: 'INVITE_EMAIL_MISMATCH', invitedEmail: inv.invitedEmail });
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.roomMember.findUnique({
        where: { roomId_userId: { roomId: inv.roomId, userId: u.id } },
      });
      if (existing) {
        if (existing.leftAt) {
          await tx.roomMember.update({
            where: { id: existing.id },
            data: { leftAt: null, joinedAt: new Date() },
          });
        }
      } else {
        await tx.roomMember.create({ data: { roomId: inv.roomId, userId: u.id } });
      }
      await tx.invitation.update({
        where: { token },
        data: { status: 'accepted', respondedAt: new Date() },
      });
      // Reactivate room if it was archived.
      await tx.room.updateMany({
        where: { id: inv.roomId, status: 'archived' },
        data: { status: 'active', archivedAt: null },
      });
    });
    return { joined: true, roomId: inv.roomId };
  }

  @Post('invitations/:token/decline')
  async decline(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    const inv = await this.prisma.invitation.findUnique({ where: { token } });
    if (!inv) throw new BadRequestException({ code: 'INVITE_INVALID' });
    if (inv.status === 'pending') {
      await this.prisma.invitation.update({
        where: { token },
        data: { status: 'declined', respondedAt: new Date() },
      });
    }
    return { declined: true };
  }
}

@Module({
  controllers: [InvitationsController],
})
export class InvitationsModule {}
