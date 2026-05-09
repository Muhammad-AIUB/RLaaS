'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SignOutIcon } from '@/components/icons';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="btn-secondary btn-sm sm:!px-4 sm:!py-2 sm:!text-sm"
      disabled={pending}
      onClick={async () => {
        try {
          setPending(true);
          await fetch('/api/auth/logout', { method: 'POST' });
          router.push('/login');
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <SignOutIcon className="h-4 w-4" />
      <span className="hidden sm:inline">
        {pending ? 'Signing out…' : 'Sign out'}
      </span>
    </button>
  );
}
