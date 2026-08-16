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
});
