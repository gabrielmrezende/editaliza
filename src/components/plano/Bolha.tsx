/** Caixa de marcar com forma de bolha da folha de respostas: enche de mint (com um check) ao marcar. */
export function Bolha(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>) {
  return <input type="checkbox" {...props} className="bolha" />;
}
