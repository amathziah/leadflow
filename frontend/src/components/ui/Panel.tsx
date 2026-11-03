import type { HTMLAttributes } from 'react';

type PanelProps = HTMLAttributes<HTMLElement>;

export default function Panel({ className = '', ...props }: PanelProps) {
  return <section className={`ui-panel ${className}`.trim()} {...props} />;
}
