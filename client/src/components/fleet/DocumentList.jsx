import { useState } from 'react';
import { FileText, Paperclip, Plus, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import ButtonSelect from '../common/ButtonSelect';
import ErrorMessage from '../common/ErrorMessage';
import { ExpiryBadge } from './Badges';
import { useToast } from '../../context/ToastContext';
import {
  DOCUMENT_KINDS, DRIVER_DOCUMENT_KINDS, VEHICLE_DOCUMENT_KINDS, apiError, toDateInput,
} from '../../config/fleet';
import {
  createDocument, deleteDocument, openDocumentFile, updateDocument, uploadDocumentFile,
} from '../../services/fleet.service';

const EMPTY = { kind: '', title: '', number: '', issuedAt: '', expiresAt: '', notes: '' };

// Form to add or edit a document, with an optional file (PDF, JPG, PNG).
export function DocumentForm({ open, onClose, entityType, busId, driverId, document, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const kinds = entityType === 'DRIVER' ? DRIVER_DOCUMENT_KINDS : VEHICLE_DOCUMENT_KINDS;

  // Reset whenever the dialog opens for a (new or different) document.
  const [openedFor, setOpenedFor] = useState(null);
  const key = open ? (document?.id ?? 'new') : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (open) {
      setForm(document ? {
        kind: document.kind, title: document.title || '', number: document.number || '',
        issuedAt: toDateInput(document.issuedAt), expiresAt: toDateInput(document.expiresAt), notes: document.notes || '',
      } : { ...EMPTY, kind: kinds[0] });
      setFile(null);
      setError('');
    }
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, issuedAt: form.issuedAt || null, expiresAt: form.expiresAt || null };
      const saved = document
        ? (await updateDocument(document.id, body)).document
        : (await createDocument({ ...body, entityType, busId, driverId })).document;
      if (file) await uploadDocumentFile(saved.id, file);
      toast.success('Document saved.');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(apiError(err, 'Could not save the document.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={document ? 'Edit document' : 'Add a document'}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <ErrorMessage message={error} />
        <div>
          <p className="field-label">Type</p>
          <ButtonSelect ariaLabel="Document type" size="sm" value={form.kind}
            options={kinds.map((k) => ({ value: k, label: DOCUMENT_KINDS[k] }))}
            onChange={(kind) => setForm((f) => ({ ...f, kind }))} />
        </div>
        {form.kind === 'OTHER' && (
          <div>
            <label htmlFor="doc-title" className="field-label">Name</label>
            <input id="doc-title" className="input-field" value={form.title} onChange={set('title')} placeholder="e.g. Speed governor certificate" />
          </div>
        )}
        <div>
          <label htmlFor="doc-number" className="field-label">Number <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="doc-number" className="input-field" value={form.number} onChange={set('number')} placeholder="Policy or certificate number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="doc-issued" className="field-label">Issued</label>
            <input id="doc-issued" type="date" className="input-field" value={form.issuedAt} onChange={set('issuedAt')} />
          </div>
          <div>
            <label htmlFor="doc-expires" className="field-label">Expires</label>
            <input id="doc-expires" type="date" className="input-field" value={form.expiresAt} onChange={set('expiresAt')} />
          </div>
        </div>
        <div>
          <label htmlFor="doc-file" className="field-label">
            {document?.hasFile ? 'Replace file' : 'File'} <span className="font-normal text-muted-foreground">(PDF, JPG or PNG, up to 10 MB)</span>
          </label>
          <input id="doc-file" type="file" accept="application/pdf,image/png,image/jpeg" className="input-field py-2"
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <button type="submit" disabled={saving || !form.kind} className="btn-primary mt-1">{saving ? 'Saving...' : 'Save document'}</button>
      </form>
    </Modal>
  );
}

// Documents of one vehicle or driver. readOnly hides editing (drivers);
// driverView opens files through the driver endpoint.
export default function DocumentList({
  documents = [], entityType, busId, driverId, onChange, readOnly = false, driverView = false,
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(null); // document | 'new' | null

  const open = async (d) => {
    try {
      await openDocumentFile(d.id, { driver: driverView, fileName: d.fileName });
    } catch {
      toast.error('Could not open the file.');
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete this ${DOCUMENT_KINDS[d.kind].toLowerCase()} record?`)) return;
    try {
      await deleteDocument(d.id);
      onChange?.();
    } catch (err) {
      toast.error(apiError(err, 'Could not delete the document.'));
    }
  };

  return (
    <div>
      {documents.length === 0 ? (
        <p className="glass-card p-4 text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="glass-card divide-y divide-border">
          {documents.map((d) => (
            <li key={d.id} className="p-3 flex items-start gap-3 text-sm">
              <FileText size={20} className="text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{d.title || DOCUMENT_KINDS[d.kind]}</p>
                {d.number && <p className="text-xs text-muted-foreground">No. {d.number}</p>}
                <div className="mt-1"><ExpiryBadge status={d.expiry} date={d.expiresAt} /></div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {d.hasFile && (
                  <button type="button" className="icon-btn" onClick={() => open(d)} aria-label={`Open ${DOCUMENT_KINDS[d.kind]} file`} title="Open file">
                    <Paperclip size={18} aria-hidden="true" />
                  </button>
                )}
                {!readOnly && (
                  <>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(d)}>Edit<span className="sr-only"> {d.title || DOCUMENT_KINDS[d.kind]}</span></button>
                    <button type="button" className="icon-btn" onClick={() => remove(d)} aria-label={`Delete ${d.title || DOCUMENT_KINDS[d.kind]}`} title="Delete">
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <button type="button" className="btn-secondary mt-3" onClick={() => setEditing('new')}>
          <Plus size={18} aria-hidden="true" /> Add document
        </button>
      )}
      <DocumentForm
        open={!!editing}
        onClose={() => setEditing(null)}
        entityType={entityType}
        busId={busId}
        driverId={driverId}
        document={editing === 'new' ? null : editing}
        onSaved={onChange}
      />
    </div>
  );
}
