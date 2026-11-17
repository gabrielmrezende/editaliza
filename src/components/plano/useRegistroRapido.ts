import { useRef, useState } from 'react';
import { pedir } from '@/components/onboarding/api';
import { registrarSessao } from '@/components/estudo/api';
import { INTERVALOS_REVISAO } from '@/lib/dominio/acompanhamento';

/** Sessão de "Estudei" (origem `rapido`) gravada hoje no plano. */
export interface SessaoRapida {
  id: string;
  disciplinaId: string;
  topicoId: string | null;
}

/** Bloco de estudo de hoje que aceita "Estudei". */
export interface BlocoRapido {
  chave: string;
  disciplinaId: string;
  topicoId: string;
  nome: string;
  minutos: number;
}

/**
 * Associa cada bloco (na ordem) à primeira sessão rápida ainda não usada da mesma matéria/tópico:
 * dois blocos do mesmo tópico precisam de duas sessões para aparecerem os dois registrados.
 */
export function associarSessoes(blocos: BlocoRapido[], sessoes: SessaoRapida[]): Map<string, string> {
  const usadas = new Set<string>();
  const porBloco = new Map<string, string>();
  for (const b of blocos) {
    const s = sessoes.find((x) => !usadas.has(x.id) && x.disciplinaId === b.disciplinaId && x.topicoId === b.topicoId);
    if (!s) continue;
    usadas.add(s.id);
    porBloco.set(b.chave, s.id);
  }
  return porBloco;
}

/**
 * "Estudei" em Hoje: grava a sessão do bloco (minutos do bloco, hoje, revisões padrão, origem
 * `rapido`) e "Desfazer" apaga essa sessão. Um pedido por bloco de cada vez.
 */
export function useRegistroRapido(
  planoId: string,
  hoje: string,
  iniciais: SessaoRapida[],
  anunciar: (texto: string) => void,
) {
  const [sessoes, setSessoes] = useState(iniciais);
  const [pendentes, setPendentes] = useState<ReadonlySet<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef(new Set<string>());

  function marcarPendente(chave: string, sim: boolean) {
    if (sim) emVoo.current.add(chave);
    else emVoo.current.delete(chave);
    setPendentes(new Set(emVoo.current));
  }

  async function estudei(bloco: BlocoRapido) {
    if (emVoo.current.has(bloco.chave)) return;
    setErro(null);
    anunciar('');
    marcarPendente(bloco.chave, true);
    try {
      const id = await registrarSessao({
        planoId,
        data: hoje,
        disciplinaId: bloco.disciplinaId,
        topicoId: bloco.topicoId,
        minutos: bloco.minutos,
        acertos: 0,
        erros: 0,
        tipo: null,
        observacao: null,
        origem: 'rapido',
        intervalos: [...INTERVALOS_REVISAO],
        concluir: false,
      });
      setSessoes((atual) => [...atual, { id, disciplinaId: bloco.disciplinaId, topicoId: bloco.topicoId }]);
      anunciar(`${bloco.nome}: estudo registrado.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Algo deu errado. Tente de novo.');
    } finally {
      marcarPendente(bloco.chave, false);
    }
  }

  async function desfazer(bloco: BlocoRapido, sessaoId: string) {
    if (emVoo.current.has(bloco.chave)) return;
    setErro(null);
    anunciar('');
    marcarPendente(bloco.chave, true);
    try {
      const r = await pedir<null>(`/api/sessoes/${encodeURIComponent(sessaoId)}`, { method: 'DELETE' });
      // 404: a sessão já não existe (apagada no histórico ou em outra aba); some daqui também.
      if (!r.ok && r.status !== 404) throw new Error(r.erro);
      setSessoes((atual) => atual.filter((s) => s.id !== sessaoId));
      anunciar(`${bloco.nome}: registro desfeito.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Algo deu errado. Tente de novo.');
    } finally {
      marcarPendente(bloco.chave, false);
    }
  }

  return { sessoes, pendentes, estudei, desfazer, erro };
}
