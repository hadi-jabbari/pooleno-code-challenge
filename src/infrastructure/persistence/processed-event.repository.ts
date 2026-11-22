import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../database/database.module';
import { processedEvents } from '../database/schema';

@Injectable()
export class ProcessedEventRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Insert event id; returns true if this is the first time we see it.
   * Used for at-least-once Kafka delivery with idempotent handlers.
   */
  async tryMarkProcessed(eventId: string): Promise<boolean> {
    const result = await this.db
      .insert(processedEvents)
      .values({ eventId })
      .onConflictDoNothing()
      .returning({ eventId: processedEvents.eventId });

    return result.length > 0;
  }

  async isProcessed(eventId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.eventId, eventId))
      .limit(1);
    return rows.length > 0;
  }
}
