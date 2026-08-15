import { IsIn, IsString, MaxLength } from 'class-validator';

export class UploadBarcodeDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';

  @IsString()
  @MaxLength(7_000_000)
  data: string;
}
