/** Caixa de marcar com forma de bolha da folha de respostas: preenche de tinta quando marcada. */
export function Bolha(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>) {
  return (
    <input
      type="checkbox"
      {...props}
      className="h-6 w-9 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-tinta bg-folha transition-colors checked:border-caneta checked:bg-caneta hover:border-caneta focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-caneta"
    />
  );
}
