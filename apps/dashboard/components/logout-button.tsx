'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:border-pine hover:text-pine"
      disabled={pending}
      onClick={async () => {
        try {
          setPending(true);
          await fetch('/api/auth/logout', {
            method: 'POST',
          });
          router.push('/login');
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
