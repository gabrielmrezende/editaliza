import { botaoPrimario, botaoSecundario } from '../estilos';

/** Rodapé das etapas: Voltar à esquerda, ação principal à direita. */
export function Navegacao({
  aoVoltar,
  aoContinuar,
  textoContinuar = 'Continuar',
  ocupado = false,
}: {
  aoVoltar: () => void;
  aoContinuar: () => void;
  textoContinuar?: string;
  ocupado?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-borda pt-5">
      <button type="button" onClick={aoVoltar} className={botaoSecundario} disabled={ocupado}>
        Voltar
      </button>
      <button type="button" onClick={aoContinuar} className={botaoPrimario} disabled={ocupado}>
        {textoContinuar}
      </button>
    </div>
  );
}
