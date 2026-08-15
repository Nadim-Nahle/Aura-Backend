import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUpdateUserDto } from './admin-update-user.dto';
import { UpdateSelfProfileDto } from './update-self-profile.dto';

describe('profile DTO normalization', () => {
  it('trims profile values and accepts a valid birth date', async () => {
    const dto = plainToInstance(UpdateSelfProfileDto, {
      name: '  Test User  ',
      phoneNumber: '  +96170123456  ',
      birthDate: '  1990-05-20  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      name: 'Test User',
      phoneNumber: '+96170123456',
      birthDate: '1990-05-20',
    });
  });

  it.each(['2024-02-31', '2999-01-01', '1990-05-20T00:00:00.000Z'])(
    'rejects invalid or non-normalized birth date %s',
    async (birthDate) => {
      const dto = plainToInstance(UpdateSelfProfileDto, { birthDate });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('normalizes admin email and accepts none for membership dates', async () => {
    const dto = plainToInstance(AdminUpdateUserDto, {
      email: '  ADMIN@EXAMPLE.COM  ',
      startDate: 'none',
      endDate: 'none',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('admin@example.com');
  });
});
