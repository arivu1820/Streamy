import { Body, Controller, Injectable, Post, BadRequestException, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { Public } from '../common/auth.guard';
import { isValidUsername, normalizeUsername, usernameFromEmail } from '../common/username';

class DevLoginDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() displayName?: string;
}
class GoogleDto {
  @IsString() idToken!: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private sign(user: { id: string; email: string; username: string }) {
    return this.jwt.sign(
      { sub: user.id, email: user.email, username: user.username },
      { secret: process.env.JWT_SECRET || 'dev-streamy-secret-change-in-prod', expiresIn: '7d' },
    );
  }

  /** Find-or-create a user and return an access token (first login auto-creates profile). */
  async upsertAndIssue(params: {
    email: string;
    googleSub?: string;
    displayName?: string;
    avatarUrl?: string;
    desiredUsername?: string;
  }) {
    const email = params.email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    let firstLogin = false;

    if (!user) {
      firstLogin = true;
      let username = normalizeUsername(params.desiredUsername || usernameFromEmail(email));
      if (!isValidUsername(username)) username = usernameFromEmail(email);
      // ensure uniqueness
      let candidate = username;
      let n = 1;
      while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
        candidate = `${username}_${n++}`.slice(0, 30);
      }
      user = await this.prisma.user.create({
        data: {
          email,
          googleSub: params.googleSub ?? null,
          username: candidate,
          displayName: params.displayName ?? null,
          avatarUrl: params.avatarUrl ?? null,
        },
      });
    } else if (params.googleSub && !user.googleSub) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleSub: params.googleSub },
      });
    }

    return {
      firstLogin,
      accessToken: this.sign(user),
      user: this.publicUser(user),
    };
  }

  publicUser(u: any) {
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt,
    };
  }

  /** Verify a Google ID token via Google's tokeninfo endpoint (no extra deps). */
  async verifyGoogle(idToken: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken);
    if (!res.ok) throw new BadRequestException({ code: 'GOOGLE_TOKEN_INVALID' });
    const info: any = await res.json();
    if (clientId && info.aud !== clientId) {
      throw new BadRequestException({ code: 'GOOGLE_AUDIENCE_MISMATCH' });
    }
    return { email: info.email as string, sub: info.sub as string, name: info.name, picture: info.picture };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // Dev login — instant, password-less. Mirrors the Google flow's outcome so the
  // rest of the app is identical. Disabled conceptually in prod (Google only).
  @Public()
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto) {
    return this.auth.upsertAndIssue({
      email: dto.email,
      desiredUsername: dto.username,
      displayName: dto.displayName,
    });
  }

  @Public()
  @Post('google')
  async google(@Body() dto: GoogleDto) {
    const g = await this.auth.verifyGoogle(dto.idToken);
    return this.auth.upsertAndIssue({
      email: g.email,
      googleSub: g.sub,
      displayName: g.name,
      avatarUrl: g.picture,
    });
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
