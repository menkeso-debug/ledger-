import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { api } from '../lib/api';
import { useStore } from '../store';
import { FilledButton } from './ui';

export function PlaidLinkButton({ label = 'Connect an account' }: { label?: string }) {
  const { refresh } = useStore();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.post<{ link_token: string }>('/api/plaid/link-token')
      .then((d) => setLinkToken(d.link_token))
      .catch(() => setLinkToken(null));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      try {
        await api.post('/api/plaid/exchange', { public_token: publicToken });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  return (
    <FilledButton onClick={() => open()} disabled={!ready || busy}>
      {busy ? 'Linking…' : label}
    </FilledButton>
  );
}
