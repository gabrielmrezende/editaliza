import { describe, expect, it } from 'vitest';
import { hojeEmSaoPaulo, inicioDoDiaEmSaoPaulo } from '@/lib/datas';

describe('inicioDoDiaEmSaoPaulo', () => {
  it('é 03:00 UTC do mesmo dia', () => {
    expect(inicioDoDiaEmSaoPaulo('2026-11-16')).toBe('2026-11-16T03:00:00.000Z');
  });

  it('é coerente com hojeEmSaoPaulo na virada do dia', () => {
    const inicio = inicioDoDiaEmSaoPaulo('2026-11-16');
    const antes = new Date(Date.parse(inicio) - 1);
    expect(hojeEmSaoPaulo(antes)).toBe('2026-11-15');
    expect(hojeEmSaoPaulo(new Date(inicio))).toBe('2026-11-16');
  });
});
