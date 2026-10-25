import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  extra?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, extra }: Props) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {extra}
    </header>
  );
}
