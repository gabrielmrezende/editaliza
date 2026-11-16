import { extratorFake } from './fake';
import { extratorClaude } from './claude';
import { EditalInvalidoError, ExtracaoFalhouError, type Extrator } from './tipos';

export { EditalInvalidoError, ExtracaoFalhouError };
export type { Extrator };

// O extrator fake lê fixtures de tests/ e serve apenas para dev/e2e; nunca em produção.
export function obterExtrator(): Extrator {
  if (process.env.EXTRACAO_MODO === 'fake') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EXTRACAO_MODO=fake não é permitido em produção.');
    }
    return extratorFake;
  }
  return extratorClaude();
}
