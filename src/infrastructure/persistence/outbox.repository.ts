import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, isNull } from 'drizzle-orm';
import { DRIZZLE, DrizzleDb } from '../database/database.module';
import { OutboxRow, outbox } from '../database/schema';

@Injectable()
export class OutboxRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async claimUnpublished(limit = 50): Promise<OutboxRow[]> {
    return this.db
      .select()
      .from(outbox)
      .where(isNull(outbox.publishedAt))
      .orderBy(outbox.createdAt)
      .limit(limit);
  }

  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.db
      .update(outbox)
      .set({ publishedAt: new Date() })
      .where(inArray(outbox.id, ids));
  }

  async markPublishedOne(id: string): Promise<void> {
    await this.db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, id));
  }
}
