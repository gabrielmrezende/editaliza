import { alerta, botaoPrimario } from '../estilos';

/** Aviso quando a espera não consegue falar com o servidor (em vez de "Lendo…" para sempre). */
export function SemConexao({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className={alerta}>
        Não conseguimos falar com o servidor. Confira sua conexão com a internet e tente de novo.
      </p>
      <div>
        <button type="button" className={botaoPrimario} onClick={aoTentar}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
