import { getAllowedOrigins } from './cors.config';

describe('getAllowedOrigins', () => {
  it('uses only configured origins in production', () => {
    const origins = getAllowedOrigins(
      'https://app.example.com, https://aura-admin-tau.vercel.app',
      'production',
    );

    expect(origins).toEqual(
      new Set(['https://app.example.com', 'https://aura-admin-tau.vercel.app']),
    );
    expect(origins.has('http://localhost:3000')).toBe(false);
  });

  it('allows known local web origins outside production', () => {
    const origins = getAllowedOrigins(undefined, 'development');

    expect(origins.has('http://localhost:8081')).toBe(true);
    expect(origins.has('http://localhost:19006')).toBe(true);
  });
});
