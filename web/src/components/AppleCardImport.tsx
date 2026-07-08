import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { OutlineButton } from './ui';

// Apple Card can't be linked via Plaid (Goldman blocks aggregators).
// Wallet exports monthly statement CSVs — upload them here; re-uploads dedupe.
export function AppleCardImport() {
  const { refresh } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setResult(null);
    try {
      let inserted = 0, skipped = 0;
      for (const file of Array.from(files)) {
        const csv = await file.text();
        const r = await api.post<{ inserted: number; skipped: number; failed: number }>(
          '/api/import/apple-card', { csv }
        );
        inserted += r.inserted;
        skipped += r.skipped;
      }
      setResult(`Imported ${inserted} transaction${inserted === 1 ? '' : 's'}${skipped ? ` (${skipped} already present)` : ''}`);
      await refresh();
    } catch (e) {
      setResult(`Import failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files)}
      />
      <OutlineButton onClick={() => inputRef.current?.click()}>
        {busy ? 'Importing…' : 'Import Apple Card CSV'}
      </OutlineButton>
      {result && <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{result}</span>}
    </span>
  );
}
