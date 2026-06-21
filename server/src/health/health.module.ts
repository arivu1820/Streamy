import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Public } from '../common/auth.guard';

/**
 * Liveness/readiness endpoint for Render's health checks and uptime monitors.
 * Path is /api/v1/health (the global prefix applies). Marked @Public so the
 * auth guard does not require a token.
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      redis: process.env.REDIS_URL ? 'configured' : 'in-memory',
      storage: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
