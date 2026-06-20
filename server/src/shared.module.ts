import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { MembershipService } from './common/membership.service';
import { RealtimeService } from './realtime/realtime.service';
import { SessionStateService } from './realtime/session-state.service';
import { PresenceService } from './realtime/presence.service';
import { DeleteVoteService } from './videos/delete-vote.service';

/**
 * Global singletons. Live-state services (RealtimeService, SessionStateService,
 * PresenceService) MUST be single instances shared across REST + gateway, so they
 * live here rather than in feature modules.
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-streamy-secret-change-in-prod',
    }),
  ],
  providers: [
    PrismaService,
    MembershipService,
    RealtimeService,
    SessionStateService,
    PresenceService,
    DeleteVoteService,
  ],
  exports: [
    JwtModule,
    PrismaService,
    MembershipService,
    RealtimeService,
    SessionStateService,
    PresenceService,
    DeleteVoteService,
  ],
})
export class SharedModule {}
