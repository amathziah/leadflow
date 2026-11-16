import { useEffect, useRef } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';

type Props = {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
};

const SAMPLE = 'Company Name,Domain,Industry,Employees,Country,Role,Contact Name,Email\nAcme Cloud,acmecloud.io,B2B SaaS,180,United States,CFO,Jordan Lee,jordan@acmecloud.io';

export default function CsvImportDialog({ value, busy, onChange, onClose, onImport }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return (
    <div className="li-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="li-import-dialog" role="dialog" aria-modal="true" aria-labelledby="li-import-title" aria-describedby="li-import-description">
        <header className="li-dialog-header">
          <span className="li-dialog-icon"><FileSpreadsheet size={18} /></span>
          <div><h2 id="li-import-title">Import leads</h2><p id="li-import-description">Paste CSV rows to add companies and contacts to your workspace.</p></div>
          <button type="button" className="li-dialog-close" onClick={onClose} disabled={busy} aria-label="Close import dialog"><X size={17} /></button>
        </header>
        <div className="li-dialog-body">
          <label htmlFor="li-csv-input">CSV data</label>
          <textarea
            ref={textareaRef}
            id="li-csv-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={SAMPLE}
            rows={9}
            spellCheck={false}
            disabled={busy}
          />
          <p className="li-dialog-help">Expected columns: Company Name, Domain, Industry, Employees, Country, Role, Contact Name, Email. The header row is required.</p>
        </div>
        <footer className="li-dialog-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={onImport} disabled={!value.trim() || busy}>
            <FileSpreadsheet size={15} />{busy ? 'Importing…' : 'Import and process'}
          </button>
        </footer>
      </section>
    </div>
  );
}
