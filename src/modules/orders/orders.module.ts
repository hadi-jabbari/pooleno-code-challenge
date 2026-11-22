import { Module } from '@nestjs/common';
import { MatchingEngine } from '../../domain/matching/matching-engine';
import { OrderRepository } from '../../infrastructure/persistence/order.repository';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderRepository,
    {
      provide: MatchingEngine,
      useFactory: () => new MatchingEngine(),
    },
  ],
  exports: [MatchingEngine, OrderRepository],
})
export class OrdersModule {}
