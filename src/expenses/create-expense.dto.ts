import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../common/transforms/string.transforms';

export class CreateExpenseDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  price: number;
}
