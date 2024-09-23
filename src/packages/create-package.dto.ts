// src/packages/dto/create-package.dto.ts

import { IsString, IsNumber } from 'class-validator';

export class CreatePackageDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  price: number;
}
