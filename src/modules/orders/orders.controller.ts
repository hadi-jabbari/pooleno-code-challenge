import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('orders')
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get('orders/:id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getById(id);
  }

  @Get('orderbook/:symbol')
  getOrderBook(
    @Param('symbol') symbol: string,
    @Query('depth') depth?: string,
  ) {
    const parsed = depth ? Number(depth) : 10;
    return this.ordersService.getOrderBook(symbol, Number.isFinite(parsed) ? parsed : 10);
  }
}
