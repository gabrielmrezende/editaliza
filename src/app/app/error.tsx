'use client';

import { TelaDeErro } from '@/components/TelaDeErro';

export default function ErroApp({ error, retry }: { error: unknown; retry: () => void }) {
  return <TelaDeErro error={error} retry={retry} voltar={{ href: '/app', texto: 'Voltar ao meu plano' }} />;
}
