'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  PARADO,
  chaveRascunho,
  iniciar as iniciarEstado,
  pausar as pausarEstado,
  segundosDecorridos,
  validarRascunho,
  type EstadoCronometro,
  type FormularioRascunho,
  type Rascunho,
} from '@/lib/acompanhamento/cronometro';
import { INTERVALOS_REVISAO } from '@/lib/dominio/acompanhamento';

export const FORMULARIO_VAZIO: FormularioRascunho = {
  disciplinaId: null,
  topicoId: null,
  tipo: null,
  acertos: '',
  erros: '',
  observacao: '',
  intervalos: [...INTERVALOS_REVISAO],
  concluir: false,
};

const dois = (n: number) => String(n).padStart(2, '0');

/** 3723 → "01:02:03". */
export function formatarRelogio(segundos: number): string {
  return `${dois(Math.floor(segundos / 3600))}:${dois(Math.floor((segundos % 3600) / 60))}:${dois(segundos % 60)}`;
}

/** 25 920 → "7h 12min" (para o aviso de cronômetro esquecido). */
export function formatarDuracao(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h === 0 ? `${m}min` : `${h}h ${m}min`;
}

// ---------------------------------------------------------------------------------------------
// Rascunho no localStorage como "store" externo (useSyncExternalStore): a leitura acontece fora
// da renderização, abas diferentes ficam em sincronia (evento `storage`) e, sem armazenamento
// disponível (modo privado, cota), o rascunho vale só na memória desta aba.

interface Leitura {
  carregado: boolean;
  rascunho: Rascunho | null;
  /** O rascunho veio de uma visita anterior (não foi criado nesta aba). */
  recuperado: boolean;
}

const NO_SERVIDOR: Leitura = { carregado: false, rascunho: null, recuperado: false };
const ouvintes = new Set<() => void>();
const cache = new Map<string, { bruto: string | null; leitura: Leitura }>();
const memoria = new Map<string, string | null>();

function lerBruto(chave: string): string | null {
  if (memoria.has(chave)) return memoria.get(chave)!;
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function ler(chave: string): Leitura {
  const bruto = lerBruto(chave);
  const anterior = cache.get(chave);
  if (anterior && anterior.bruto === bruto) return anterior.leitura;
  let rascunho: Rascunho | null = null;
  if (bruto) {
    try {
      rascunho = validarRascunho(JSON.parse(bruto), Date.now());
    } catch {
      rascunho = null; // JSON corrompido: ignora
    }
  }
  // Primeira leitura nesta aba (ou mudança vinda de outra aba) com rascunho válido = recuperado.
  const leitura: Leitura = { carregado: true, rascunho, recuperado: rascunho !== null };
  cache.set(chave, { bruto, leitura });
  return leitura;
}

function gravar(chave: string, rascunho: Rascunho | null, recuperado = false) {
  const bruto = rascunho ? JSON.stringify(rascunho) : null;
  cache.set(chave, { bruto, leitura: { carregado: true, rascunho, recuperado } });
  try {
    if (bruto) localStorage.setItem(chave, bruto);
    else localStorage.removeItem(chave);
    memoria.delete(chave);
  } catch {
    memoria.set(chave, bruto);
  }
  ouvintes.forEach((avisar) => avisar());
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  const aoMudarEmOutraAba = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith('editaliza:cronometro:')) avisar();
  };
  window.addEventListener('storage', aoMudarEmOutraAba);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener('storage', aoMudarEmOutraAba);
  };
}

const vazio = (e: EstadoCronometro) => !e.rodando && e.acumuladoSeg === 0;

/**
 * Cronômetro de estudo com rascunho em `localStorage['editaliza:cronometro:{userId}']`: o tempo
 * é derivado de `Date.now()` (aba em segundo plano ou fechada não perde tempo), o rascunho é
 * gravado a cada mudança e no `pagehide`, e o título da aba mostra o tempo enquanto roda.
 */
export function useCronometro(userId: string) {
  const chave = chaveRascunho(userId);
  const leitura = useSyncExternalStore(
    assinar,
    () => ler(chave),
    () => NO_SERVIDOR,
  );
  // Sem tempo marcado não há rascunho a guardar: a escolha do formulário fica só na memória.
  const [formularioLocal, setFormularioLocal] = useState<FormularioRascunho>(FORMULARIO_VAZIO);
  const [agora, setAgora] = useState(0);

  const { rascunho, carregado, recuperado } = leitura;
  const estado = rascunho?.estado ?? PARADO;
  const formulario = rascunho?.formulario ?? formularioLocal;
  const segundos = segundosDecorridos(estado, Math.max(agora, estado.iniciadoEm ?? 0));

  const salvar = useCallback(
    (novoEstado: EstadoCronometro, novoFormulario: FormularioRascunho, manterRecuperado = false) => {
      if (vazio(novoEstado)) {
        setFormularioLocal(novoFormulario);
        gravar(chave, null);
        return;
      }
      gravar(
        chave,
        { versao: 1, estado: novoEstado, formulario: novoFormulario, atualizadoEm: Date.now() },
        manterRecuperado,
      );
    },
    [chave],
  );

  /**
   * Inicia ou retoma. Com `novoEstudo` (ex.: botão "Iniciar" de Hoje), começa do zero com essa
   * matéria/tópico, descartando o tempo que houver.
   */
  const iniciar = useCallback(
    (novoEstudo?: FormularioRascunho) => {
      const t = Date.now();
      setAgora(t);
      if (novoEstudo) salvar(iniciarEstado(PARADO, t), novoEstudo);
      else salvar(iniciarEstado(estado, t), formulario);
    },
    [estado, formulario, salvar],
  );

  const pausar = useCallback(() => {
    const t = Date.now();
    setAgora(t);
    salvar(pausarEstado(estado, t), formulario);
  }, [estado, formulario, salvar]);

  const setFormulario = useCallback(
    (mudar: FormularioRascunho | ((atual: FormularioRascunho) => FormularioRascunho)) => {
      const novo = typeof mudar === 'function' ? mudar(formulario) : mudar;
      if (rascunho) salvar(estado, novo, recuperado);
      else setFormularioLocal(novo);
    },
    [estado, formulario, rascunho, recuperado, salvar],
  );

  /** Zera o tempo e apaga o rascunho; a matéria/tópico escolhidos continuam na tela. */
  const descartar = useCallback(() => {
    setFormularioLocal(formulario);
    gravar(chave, null);
  }, [chave, formulario]);

  /** Depois de registrar: zera tempo e formulário e apaga o rascunho. */
  const limpar = useCallback(() => {
    setFormularioLocal(FORMULARIO_VAZIO);
    gravar(chave, null);
  }, [chave]);

  // Atualiza o display a cada 500 ms enquanto roda (o valor vem sempre do relógio).
  useEffect(() => {
    if (!estado.rodando) return;
    const tick = () => setAgora(Date.now());
    const primeiro = setTimeout(tick, 0);
    const intervalo = setInterval(tick, 500);
    return () => {
      clearTimeout(primeiro);
      clearInterval(intervalo);
    };
  }, [estado.rodando]);

  // Título da aba com o tempo enquanto roda; volta ao original ao pausar ou sair da página.
  useEffect(() => {
    if (!estado.rodando) return;
    const original = document.title;
    document.title = `${formatarRelogio(segundos)} · Editaliza`;
    return () => {
      document.title = original;
    };
  }, [estado.rodando, segundos]);

  // Regrava o rascunho ao sair da página (o `localStorage` já está em dia; isto atualiza `atualizadoEm`).
  useEffect(() => {
    if (!rascunho) return;
    const aoSair = () => gravar(chave, { ...rascunho, atualizadoEm: Date.now() }, recuperado);
    window.addEventListener('pagehide', aoSair);
    return () => window.removeEventListener('pagehide', aoSair);
  }, [chave, rascunho, recuperado]);

  return { estado, segundos, formulario, setFormulario, iniciar, pausar, descartar, limpar, recuperado, carregado };
}
