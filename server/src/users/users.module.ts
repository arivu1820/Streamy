import {
  Body,
  ConflictException,
  Controller,
  Get,
  Module,
  Patch,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser } from '../common/auth.guard';
import { isValidUsername, normalizeUsername } from '../common/username';

class UpdateMeDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

@Controller()
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.id } });
    return this.pub(user);
  }

  @Get('users/username-available')
  async available(@Query('u') u: string) {
    const name = normalizeUsername(u || '');
    if (!isValidUsername(name)) return { available: false, reason: 'invalid_format' };
    const existing = await this.prisma.user.findUnique({ where: { username: name } });
    return { available: !existing };
  }

  @Patch('me')
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    const data: any = {};
    if (dto.username !== undefined) {
      const name = normalizeUsername(dto.username);
      if (!isValidUsername(name)) throw new ConflictException({ code: 'VALIDATION_FAILED' });
      const clash = await this.prisma.user.findUnique({ where: { username: name } });
      if (clash && clash.id !== u.id) throw new ConflictException({ code: 'USERNAME_TAKEN' });
      data.username = name;
    }
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    const user = await this.prisma.user.update({ where: { id: u.id }, data });
    return this.pub(user);
  }

  private pub(u: any) {
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt,
    };
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
