import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type PageHeaderProps = {
  eyebrow: ReactNode;
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
};

export default function PageHeader({ eyebrow, title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <span className="page-eyebrow">{eyebrow}</span>
        <div className="page-title-row">
          <span className="page-title-icon"><Icon size={19} strokeWidth={2} /></span>
          <h1>{title}</h1>
        </div>
        <p>{description}</p>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
