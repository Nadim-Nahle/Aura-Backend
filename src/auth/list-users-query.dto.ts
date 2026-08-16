import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const USER_DIRECTORY_SORTS = [
  'name-asc',
  'name-desc',
  'start-newest',
  'start-oldest',
  'end-newest',
  'end-oldest',
] as const;
export const USER_DIRECTORY_MEMBERSHIPS = [
  'regular',
  'student',
  'none',
] as const;
export const USER_DIRECTORY_STATUSES = [
  'active',
  'expired',
  'no-membership',
] as const;
export const USER_DIRECTORY_DATE_FIELDS = ['startDate', 'endDate'] as const;

export type UserDirectorySort = (typeof USER_DIRECTORY_SORTS)[number];
export type UserDirectoryMembership =
  (typeof USER_DIRECTORY_MEMBERSHIPS)[number];
export type UserDirectoryStatus = (typeof USER_DIRECTORY_STATUSES)[number];
export type UserDirectoryDateField =
  (typeof USER_DIRECTORY_DATE_FIELDS)[number];

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  pageToken?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(USER_DIRECTORY_SORTS)
  sort?: UserDirectorySort;

  @IsOptional()
  @IsIn(USER_DIRECTORY_MEMBERSHIPS)
  membership?: UserDirectoryMembership;

  @IsOptional()
  @IsIn(USER_DIRECTORY_STATUSES)
  status?: UserDirectoryStatus;

  @IsOptional()
  @IsIn(USER_DIRECTORY_DATE_FIELDS)
  dateField?: UserDirectoryDateField;

  @IsOptional()
  @IsDateString({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dateTo?: string;
}
