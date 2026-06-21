import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Put,
  Delete,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtService } from '@nestjs/jwt';
import { IsIn, IsString } from 'class-validator';
import type { Request, Response } from 'express';
import { promises as fs, createReadStream, statSync } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Public, verifySocketToken } from '../common/auth.guard';
import { MembershipService } from '../common/membership.service';
import { DeleteVoteService } from './delete-vote.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StorageService } from '../storage/storage.service';

// UPLOAD_DIR doubles as the local staging dir. With the local driver the file
// stays here and is streamed from disk. With the r2 driver the file is written
// here transiently, uploaded to R2, then deleted (see StorageService).
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './storage');
const MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const ALLOWED = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ogv'];
const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

class VoteDto {
  @IsString() @IsIn(['delete', 'keep']) value!: 'delete' | 'keep';
}

@Controller()
export class VideosController {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private votes: DeleteVoteService,
    private realtime: RealtimeService,
    private jwt: JwtService,
    private storage: StorageService,
  ) {}

  @Post('rooms/:roomId/videos')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdir(UPLOAD_DIR, { recursive: true }).then(() => cb(null, UPLOAD_DIR));
        },
        filename: (_req, file, cb) => {
          const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
          cb(null, `${randomUUID()}.${ext}`);
        },
      }),
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @CurrentUser() u: AuthUser,
    @Param('roomId') roomId: string,
    @UploadedFile() file: any,
    @Body('title') title: string,
  ) {
    await this.membership.assertActiveMember(roomId, u.id);
    if (!file) throw new BadRequestException({ code: 'NO_FILE' });
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED.includes(ext)) {
      await fs.rm(file.path, { force: true });
      throw new BadRequestException({ code: 'UNSUPPORTED_FORMAT' });
    }
    if (file.size > MAX_BYTES) {
      await fs.rm(file.path, { force: true });
      throw new BadRequestException({ code: 'FILE_TOO_LARGE' });
    }

    // Move the staged file into permanent storage (disk move, or R2 upload).
    const key = path.basename(file.path);
    const contentType = MIME[ext] || 'application/octet-stream';
    await this.storage.persistUpload(file.path, key, contentType);

    // Demo: no transcode step — browser-native formats play directly => READY.
    const video = await this.prisma.video.create({
      data: {
        roomId,
        uploadedById: u.id,
        title: title?.trim() || file.originalname,
        originalFilename: file.originalname,
        sizeBytes: BigInt(file.size),
        container: ext,
        status: 'ready',
        storageKey: key,
        readyAt: new Date(),
      },
    });
    this.realtime.toRoom(roomId, 'video.status.changed', { videoId: video.id, status: 'ready' });
    return video;
  }

  @Get('rooms/:roomId/videos')
  async list(@CurrentUser() u: AuthUser, @Param('roomId') roomId: string) {
    await this.membership.assertActiveMember(roomId, u.id);
    const videos = await this.prisma.video.findMany({
      where: { roomId, deletedAt: null },
      include: { uploadedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    const out: any[] = [];
    for (const v of videos) {
      const tally = await this.votes.tally(v.id, roomId);
      const myVote = await this.prisma.videoDeleteVote.findUnique({
        where: { videoId_userId: { videoId: v.id, userId: u.id } },
      });
      out.push({
        id: v.id,
        title: v.title,
        status: v.status,
        durationMs: v.durationMs,
        sizeBytes: Number(v.sizeBytes),
        container: v.container,
        uploadedBy: { id: v.uploadedById, username: v.uploadedBy.username },
        createdAt: v.createdAt,
        tally,
        myVote: myVote?.value ?? null,
      });
    }
    return out;
  }

  @Put('videos/:id/delete-vote')
  async vote(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VoteDto) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new BadRequestException({ code: 'VIDEO_NOT_READY' });
    await this.membership.assertActiveMember(video.roomId, u.id);
    return this.votes.castVote(id, u.id, dto.value);
  }

  @Delete('videos/:id/delete-vote')
  async withdraw(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new BadRequestException({ code: 'VIDEO_NOT_READY' });
    await this.membership.assertActiveMember(video.roomId, u.id);
    return this.votes.castVote(id, u.id, null);
  }

  // Range-aware streaming. Auth via ?token= because <video> can't set headers.
  //   r2    -> 302 redirect to a short-lived presigned R2 URL (R2 serves bytes).
  //   local -> stream the file from disk with HTTP range support.
  @Public()
  @Get('videos/:id/stream')
  async stream(
    @Param('id') id: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = verifySocketToken(this.jwt, token);
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
      return;
    }
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video || video.deletedAt) {
      res.status(404).json({ error: { code: 'NOT_FOUND' } });
      return;
    }
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: video.roomId, userId: user.id } },
    });
    if (!member || member.leftAt) {
      res.status(403).json({ error: { code: 'NOT_MEMBER' } });
      return;
    }

    const resolved = await this.storage.resolve(video.storageKey);
    if (resolved.kind === 'redirect') {
      // Browser follows the redirect and does range requests against R2 directly.
      res.redirect(302, resolved.url);
      return;
    }

    const filePath = resolved.path;
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      res.status(404).json({ error: { code: 'FILE_MISSING' } });
      return;
    }
    const type = MIME[video.container] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': type,
      });
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
      createReadStream(filePath).pipe(res);
    }
  }
}

@Module({
  controllers: [VideosController],
})
export class VideosModule {}
