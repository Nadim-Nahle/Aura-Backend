import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQueryDto } from './list-users-query.dto';

describe('ListUsersQueryDto', () => {
  it('applies a safe default and trims search text', async () => {
    const query = plainToInstance(ListUsersQueryDto, { search: '  member  ' });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.limit).toBe(50);
    expect(query.search).toBe('member');
  });

  it('rejects page sizes above the API maximum', async () => {
    const query = plainToInstance(ListUsersQueryDto, { limit: '101' });

    const errors = await validate(query);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'limit' })]),
    );
  });

  it('accepts supported directory filters and sorting', async () => {
    const query = plainToInstance(ListUsersQueryDto, {
      sort: 'name-asc',
      membership: 'regular',
      status: 'active',
      dateField: 'endDate',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
  });

  it('rejects unsupported filters and malformed dates', async () => {
    const query = plainToInstance(ListUsersQueryDto, {
      sort: 'random',
      membership: 'vip',
      status: 'unknown',
      dateField: 'birthday',
      dateFrom: 'not-a-date',
    });

    const errors = await validate(query);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'sort',
        'membership',
        'status',
        'dateField',
        'dateFrom',
      ]),
    );
  });
});
