'use client';

import { TelaDeErro } from '@/components/TelaDeErro';

export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  return <TelaDeErro error={error} retry={retry} voltar={{ href: '/', texto: 'Ir para o início' }} />;
}
