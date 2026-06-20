import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { buildDeleteTally, shouldDeleteVideo } from '../common/governance';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class DeleteVoteService {
  constructor(private prisma: PrismaService, private realtime: RealtimeService) {}

  /** Tally restricted to votes from CURRENT active members (denominator is live). */
  async tally(videoId: string, roomId: string) {
    const activeMembers = await this.prisma.activeMemberCount(roomId);
    const activeIds = (
      await this.prisma.roomMember.findMany({
        where: { roomId, leftAt: null },
        select: { userId: true },
      })
    ).map((m) => m.userId);

    const votes = await this.prisma.videoDeleteVote.findMany({
      where: { videoId, userId: { in: activeIds } },
    });
    const deleteVotes = votes.filter((v) => v.value === 'delete').length;
    const keepVotes = votes.filter((v) => v.value === 'keep').length;
    return buildDeleteTally(deleteVotes, keepVotes, activeMembers);
  }

  /** Cast/change/withdraw a standing vote, then re-evaluate the rule atomically. */
  async castVote(videoId: string, userId: string, value: 'delete' | 'keep' | null) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.deletedAt) return { code: 'VIDEO_NOT_READY' as const };

    if (value === null) {
      await this.prisma.videoDeleteVote.deleteMany({ where: { videoId, userId } });
    } else {
      await this.prisma.videoDeleteVote.upsert({
        where: { videoId_userId: { videoId, userId } },
        create: { videoId, userId, value },
        update: { value },
      });
    }
    return this.evaluate(videoId, video.roomId);
  }

  /** Evaluate one video; delete media + mark row if strict majority reached. */
  async evaluate(videoId: string, roomId: string) {
    const tally = await this.tally(videoId, roomId);
    this.realtime.toRoom(roomId, 'video.votes.updated', { videoId, tally });

    if (tally.willDelete) {
      const video = await this.prisma.video.findUnique({ where: { id: videoId } });
      if (video && !video.deletedAt) {
        await this.prisma.video.update({
          where: { id: videoId },
          data: { status: 'deleted', deletedAt: new Date() },
        });
        // Purge media from local storage (R2 prefix delete in prod).
        try {
          await fs.rm(path.resolve(process.env.UPLOAD_DIR || './storage', video.storageKey), {
            force: true,
          });
        } catch {
          /* best-effort */
        }
        this.realtime.toRoom(roomId, 'video.deleted', { videoId });
      }
    }
    return { tally };
  }

  /** Re-evaluate every live video in a room (called when membership changes). */
  async reevaluateRoom(roomId: string) {
    const videos = await this.prisma.video.findMany({
      where: { roomId, deletedAt: null },
      select: { id: true },
    });
    for (const v of videos) await this.evaluate(v.id, roomId);
  }
}
