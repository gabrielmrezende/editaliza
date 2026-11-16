import { afterEach, describe, expect, it, vi } from 'vitest';
import { urlDoSite } from '@/lib/url-site';

describe('urlDoSite', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('devolve o valor configurado sem a barra final', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3000/');
    expect(urlDoSite()).toBe('http://127.0.0.1:3000');
  });

  it('falha quando não está configurada', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(() => urlDoSite()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
