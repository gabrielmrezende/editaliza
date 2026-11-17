'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/navegador';
import { alerta, botaoPrimario, botaoSecundario, rotulo } from '../estilos';
import { pedir } from './api';
import { Lendo } from './Lendo';
import type { EditalVisao } from './tipos';
import { SemConexao } from './SemConexao';
import { useSondagem } from './useSondagem';

const MAX_BYTES = 50 * 1024 * 1024;
const semInscricao = () => () => {};

type Estado =
  | { fase: 'escolher'; erro?: string }
  | { fase: 'enviando' }
  | { fase: 'lendo'; editalId: string }
  | { fase: 'erro'; editalId: string; erro: string; podeTentar: boolean };

/** Etapa 1: envia o PDF, registra o edital e espera a leitura dos cargos. */
export function EnvioEdital({ aoPronto }: { aoPronto: (editalId: string, edital: EditalVisao) => void }) {
  // O arquivo é lido do campo no envio (e não do onChange): um arquivo escolhido antes da
  // hidratação continua valendo. O botão só habilita depois de hidratar.
  const campoArquivo = useRef<HTMLInputElement>(null);
  const hidratado = useSyncExternalStore(semInscricao, () => true, () => false);
  const [estado, setEstado] = useState<Estado>({ fase: 'escolher' });

  const editalId = estado.fase === 'lendo' ? estado.editalId : null;
  const sondagem = useSondagem(editalId !== null, async () => {
    const r = await pedir<EditalVisao>(`/api/editais/${editalId}`);
    if (!r.ok) {
      if (r.status === 0) return 'sem_rede';
      setEstado({ fase: 'erro', editalId: editalId!, erro: r.erro, podeTentar: true });
      return 'fim';
    }
    if (r.dados.status === 'pronto') {
      aoPronto(editalId!, r.dados);
      return 'fim';
    }
    if (r.dados.status === 'erro') {
      setEstado({ fase: 'erro', editalId: editalId!, erro: r.dados.erro ?? 'Não conseguimos ler este edital.', podeTentar: true });
      return 'fim';
    }
    return 'continuar';
  });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const arquivo = campoArquivo.current?.files?.[0];
    if (!arquivo) {
      setEstado({ fase: 'escolher', erro: 'Escolha o PDF do edital.' });
      return;
    }
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) {
      setEstado({ fase: 'escolher', erro: 'Escolha um arquivo PDF.' });
      return;
    }
    if (arquivo.size > MAX_BYTES) {
      setEstado({ fase: 'escolher', erro: 'O arquivo passa de 50 MB. Envie uma versão menor do edital.' });
      return;
    }
    setEstado({ fase: 'enviando' });
    const falhar = (erro: string) => setEstado({ fase: 'escolher', erro });

    const envio = await pedir<{ caminho: string; url: string }>('/api/editais/url-envio', { method: 'POST' });
    if (!envio.ok) return falhar(envio.erro);
    const token = new URL(envio.dados.url).searchParams.get('token') ?? '';
    const { error } = await criarClienteNavegador()
      .storage.from('editais')
      .uploadToSignedUrl(envio.dados.caminho, token, arquivo, { contentType: 'application/pdf' });
    if (error) return falhar('Não foi possível enviar o arquivo. Confira sua internet e tente de novo.');

    const registro = await pedir<{ editalId: string }>('/api/editais', {
      method: 'POST',
      body: JSON.stringify({ caminho: envio.dados.caminho }),
    });
    if (!registro.ok) return falhar(registro.erro);
    sondagem.reiniciar();
    setEstado({ fase: 'lendo', editalId: registro.dados.editalId });
  }

  async function tentarDeNovo(id: string) {
    const r = await pedir(`/api/editais/${id}/tentar-novamente`, { method: 'POST' });
    if (r.ok) {
      sondagem.reiniciar();
      setEstado({ fase: 'lendo', editalId: id });
    }
    else setEstado({ fase: 'erro', editalId: id, erro: r.erro, podeTentar: r.status !== 409 });
  }

  const outroArquivo = () => setEstado({ fase: 'escolher' });

  if (estado.fase === 'lendo') {
    if (sondagem.semConexao) return <SemConexao aoTentar={sondagem.reiniciar} />;
    return <Lendo texto="Lendo seu edital…" detalhe="Estamos encontrando os cargos. Costuma levar menos de um minuto." />;
  }

  if (estado.fase === 'erro') {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className={alerta}>
          {estado.erro}
        </p>
        <div className="flex flex-wrap gap-3">
          {estado.podeTentar && (
            <button type="button" className={botaoPrimario} onClick={() => tentarDeNovo(estado.editalId)}>
              Tentar de novo
            </button>
          )}
          <button type="button" className={botaoSecundario} onClick={outroArquivo}>
            Enviar outro arquivo
          </button>
        </div>
      </div>
    );
  }

  const enviando = estado.fase === 'enviando';
  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="pdf-edital" className={rotulo}>
          PDF do edital
        </label>
        <input
          id="pdf-edital"
          ref={campoArquivo}
          type="file"
          accept="application/pdf,.pdf"
          aria-describedby="pdf-ajuda"
          disabled={enviando}
          onChange={() => setEstado({ fase: 'escolher' })}
          className="block w-full cursor-pointer rounded-cartao border-2 border-dashed border-borda bg-superficie p-5 text-texto-suave transition-colors file:mr-4 file:cursor-pointer file:rounded-linha file:border-0 file:bg-suave file:px-4 file:py-2.5 file:font-semibold file:text-link hover:border-borda-forte"
        />
        <p id="pdf-ajuda" className="text-sm text-texto-suave">
          O edital completo, como foi publicado. Até 50 MB e 600 páginas.
        </p>
      </div>
      {estado.fase === 'escolher' && estado.erro && (
        <p role="alert" className={alerta}>
          {estado.erro}
        </p>
      )}
      <div>
        <button type="submit" className={botaoPrimario} disabled={!hidratado || enviando}>
          {enviando ? 'Enviando…' : 'Ler edital'}
        </button>
      </div>
      {enviando && (
        <p role="status" className="sr-only">
          Enviando o arquivo.
        </p>
      )}
    </form>
  );
}
