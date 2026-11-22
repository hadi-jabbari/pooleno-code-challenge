import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../../infrastructure/database/database.module';
import { KafkaClientService } from '../../infrastructure/messaging/kafka.client';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly kafka: KafkaClientService,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  @Get('ready')
  async ready() {
    await this.db.execute(sql`SELECT 1`);
    return {
      status: 'ok',
      checks: {
        database: 'up',
        kafka: this.kafka.isHealthy() ? 'up' : 'starting',
      },
    };
  }
}
