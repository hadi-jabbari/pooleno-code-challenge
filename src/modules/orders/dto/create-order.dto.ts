import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { OrderSide } from '../../../domain/order/order.types';

export class CreateOrderDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Z0-9]+-[A-Z0-9]+$/, {
    message: 'symbol must look like BASE-QUOTE, e.g. BTC-IRT',
  })
  symbol!: string;

  @IsEnum(OrderSide)
  side!: OrderSide;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  price!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  quantity!: number;
}
