import { PropsWithChildren } from 'react';
import clsx from 'clsx';

export function Panel({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={clsx(
        'rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur',
        className,
      )}
    >
      {children}
    </section>
  );
}
