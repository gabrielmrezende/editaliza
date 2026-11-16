import { extratorFake } from './fake';
import { extratorClaude } from './claude';
import { EditalInvalidoError, type Extrator } from './tipos';

export { EditalInvalidoError };
export type { Extrator };

export function obterExtrator(): Extrator {
  return process.env.EXTRACAO_MODO === 'fake' ? extratorFake : extratorClaude();
}
