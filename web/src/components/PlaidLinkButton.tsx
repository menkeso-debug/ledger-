import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { api } from '../lib/api';
import { useStore } from '../store';
import { FilledButton } from './ui';

// OAuth banks (Chase, Amex) bounce the user to the bank's site and back.
// On return the URL carries ?oauth_state_id=... — we must resume Link with the
// SAME link token (kept in sessionStorage) and receivedRedirectUri.
const isOAuthRedirect = window.location.search.includes('oauth_state_id');

export function PlaidLinkButton({ label = 'Connect an account' }: { label?: string }) {
  const { refresh } = useStore();
  const [linkToken, setLinkToken] = useState<string | null>(() =>
    isOAuthRedirect ? sessionStorage.getItem('plaid_link_token') : null
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOAuthRedirect) return; // resuming — reuse the stored token
    api.post<{ link_token: string }>('/api/plaid/link-token')
      .then((d) => {
        sessionStorage.setItem('plaid_link_token', d.link_token);
        setLinkToken(d.link_token);
      })
      .catch(() => setLinkToken(null));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      sessionStorage.removeItem('plaid_link_token');
      if (isOAuthRedirect) window.history.replaceState({}, '', '/');
      try {
        await api.post('/api/plaid/exchange', { public_token: publicToken });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      if (isOAuthRedirect) window.history.replaceState({}, '', '/');
    },
    ...(isOAuthRedirect ? { receivedRedirectUri: window.location.href } : {}),
  });

  // Auto-reopen Link when landing back from the bank's OAuth page.
  useEffect(() => {
    if (isOAuthRedirect && ready) open();
  }, [ready, open]);

  return (
    <FilledButton onClick={() => open()} disabled={!ready || busy}>
      {busy ? 'Linking…' : label}
    </FilledButton>
  );
}
