import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleAlert, CircleCheck, Download, FileSpreadsheet, Upload } from 'lucide-react';
import ErrorMessage from '../../components/common/ErrorMessage';
import { useAuth } from '../../context/AuthContext';
import { bulkInvite } from '../../services/org.service';
import { refreshOrgSummary } from '../../hooks/useOrgSummary';
import { downloadCsv, parseCsv } from '../../utils/csv';

const MAX_ROWS = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepted header spellings, normalised to lower case without spaces,
// dashes or underscores.
const COLUMNS = {
  email: ['email', 'emailaddress', 'googleemail'],
  role: ['role'],
  childFirstName: ['childfirstname', 'pupilfirstname', 'studentfirstname'],
  childLastName: ['childlastname', 'pupillastname', 'studentlastname'],
};
const normalise = (h) => h.toLowerCase().replace(/[\s_-]+/g, '');

function mapHeader(header) {
  const index = {};
  header.forEach((h, i) => {
    const key = Object.keys(COLUMNS).find((k) => COLUMNS[k].includes(normalise(h)));
    if (key && index[key] === undefined) index[key] = i;
  });
  return index;
}

// Bulk invitations from a CSV file. The file is read and checked in the
// browser; only the rows are sent. The server re-validates every row and
// reports anything it skipped.
export default function CsvImport() {
  const { session } = useAuth();
  const roles = session.organization.roles;
  const hasParents = roles.some((r) => r.role === 'PARENT');
  const fileId = useId();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const roleFor = (value) => {
    const v = String(value || '').trim().toLowerCase();
    return roles.find((r) => r.role.toLowerCase() === v || r.label.toLowerCase() === v)?.role || null;
  };

  const readFile = async (file) => {
    setError(''); setResult(null); setParsed(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > 1024 * 1024) { setError('That file is larger than 1 MB. Split it into smaller files.'); return; }
    const rows = parseCsv(await file.text());
    if (rows.length < 2) { setError('The file has no rows under the header.'); return; }
    const index = mapHeader(rows[0]);
    if (index.email === undefined || index.role === undefined) {
      setError('The first row must be a header with at least "email" and "role" columns. Download the template to see the format.');
      return;
    }
    const data = rows.slice(1);
    if (data.length > MAX_ROWS) { setError(`The file has ${data.length} rows. Import at most ${MAX_ROWS} at a time.`); return; }

    setParsed(data.map((cells, i) => {
      const get = (key) => (index[key] === undefined ? '' : String(cells[index[key]] || '').trim());
      const email = get('email').toLowerCase();
      const role = roleFor(get('role'));
      const childFirstName = get('childFirstName');
      const childLastName = get('childLastName');
      let problem = '';
      if (!EMAIL.test(email)) problem = 'Invalid email address';
      else if (!role) problem = `Unknown role "${get('role')}"`;
      else if ((childFirstName || childLastName) && role !== 'PARENT') problem = 'Only parents can have a child';
      else if ((childFirstName || childLastName) && !(childFirstName && childLastName)) problem = "Give the child's first and last name";
      return { line: i + 2, email, role, roleText: get('role'), childFirstName, childLastName, problem };
    }));
  };

  const valid = useMemo(() => (parsed || []).filter((r) => !r.problem), [parsed]);
  const invalid = (parsed?.length || 0) - valid.length;

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const rows = valid.map(({ email, role, childFirstName, childLastName }) => ({ email, role, childFirstName, childLastName }));
      const res = await bulkInvite(rows);
      // Map the server's row numbers (1-based within what we sent) back to file lines.
      setResult({
        created: res.created,
        skipped: res.skipped.map((s) => ({ ...s, line: valid[s.row - 1]?.line })),
        invalid: parsed.filter((r) => r.problem),
      });
      setParsed(null);
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
      refreshOrgSummary();
    } catch (err) {
      setError(err.response?.data?.error || 'The import failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const header = ['email', 'role', ...(hasParents ? ['child_first_name', 'child_last_name'] : [])];
    const example = (role, email, child = ['', '']) => [email, role, ...(hasParents ? child : [])];
    const sample = roles.filter((r) => r.role !== 'ORG_ADMIN').slice(0, 3).map((r, i) => (r.role === 'PARENT'
      ? example(r.role, `parent${i + 1}@gmail.com`, ['Baraka', 'Otieno'])
      : example(r.role, `${r.role.toLowerCase().replace('_', '.')}${i + 1}@gmail.com`)));
    downloadCsv('transtrack-people-template.csv', [header, ...sample]);
  };

  return (
    <div className="page">
      <Link to=".." relative="path" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft size={18} aria-hidden="true" /> People &amp; Access
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import people from CSV</h1>
          <p className="page-subtitle">Invite up to {MAX_ROWS} people at once. They sign in with the Google account you list.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={downloadTemplate}>
          <Download size={18} aria-hidden="true" /> Download template
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <section className="glass-card p-5 lg:col-span-1 h-fit" aria-labelledby="format-title">
          <h2 id="format-title" className="section-title mb-2">File format</h2>
          <p className="text-sm text-muted-foreground">A header row, then one person per row:</p>
          <dl className="mt-3 text-sm flex flex-col gap-2">
            <div><dt className="font-mono font-medium text-foreground">email</dt><dd className="text-muted-foreground">Their Google account email.</dd></div>
            <div>
              <dt className="font-mono font-medium text-foreground">role</dt>
              <dd className="text-muted-foreground">One of: {roles.map((r) => r.label).join(', ')}.</dd>
            </div>
            {hasParents && (
              <div>
                <dt className="font-mono font-medium text-foreground">child_first_name, child_last_name</dt>
                <dd className="text-muted-foreground">
                  Optional, parents only. The pupil is added and linked when the parent first signs in. Use one row per
                  child for parents with several children.
                </dd>
              </div>
            )}
          </dl>
        </section>

        <div className="lg:col-span-2 flex flex-col gap-4">
          <section className="glass-card p-5" aria-labelledby="upload-title">
            <h2 id="upload-title" className="section-title mb-3">Choose a file</h2>
            {/* The input comes first so its keyboard focus can style the drop zone (peer). */}
            <input
              ref={inputRef} id={fileId} type="file" accept=".csv,text/csv" className="sr-only peer"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            <label
              htmlFor={fileId}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input/60 px-4 py-8 text-center hover:border-primary-400 hover:bg-muted/50 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:border-primary-600"
            >
              <Upload size={24} className="text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">{fileName || 'Select a .csv file'}</span>
              <span className="text-xs text-muted-foreground">Save from Excel or Google Sheets as “CSV”</span>
            </label>
            <div className="mt-3"><ErrorMessage message={error} /></div>
          </section>

          {parsed && (
            <section className="glass-card overflow-hidden" aria-labelledby="preview-title">
              <div className="p-5 pb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="preview-title" className="section-title">Check the rows</h2>
                  <p className="text-sm text-muted-foreground" role="status">
                    {valid.length} ready to invite{invalid > 0 ? ` · ${invalid} with problems will be left out` : ''}
                  </p>
                </div>
                <button type="button" className="btn-primary" disabled={!valid.length || submitting} onClick={submit}>
                  <FileSpreadsheet size={18} aria-hidden="true" />
                  {submitting ? 'Inviting...' : `Invite ${valid.length} ${valid.length === 1 ? 'person' : 'people'}`}
                </button>
              </div>
              <div className="overflow-x-auto max-h-[28rem]">
                <table className="data-table">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th scope="col">Line</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      {hasParents && <th scope="col">Child</th>}
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr key={r.line} className={r.problem ? 'bg-red-50/60 dark:bg-red-500/5' : ''}>
                        <td className="tabular-nums text-muted-foreground">{r.line}</td>
                        <td className="break-all text-foreground">{r.email || <span className="text-muted-foreground">empty</span>}</td>
                        <td className="text-foreground whitespace-nowrap">{roles.find((x) => x.role === r.role)?.label || r.roleText}</td>
                        {hasParents && <td className="text-foreground">{[r.childFirstName, r.childLastName].filter(Boolean).join(' ')}</td>}
                        <td>
                          {r.problem
                            ? <span className="inline-flex items-center gap-1 text-danger text-xs font-medium"><CircleAlert size={14} aria-hidden="true" />{r.problem}</span>
                            : <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs font-medium"><CircleCheck size={14} aria-hidden="true" />Ready</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {result && (
            <section className="glass-card p-5" aria-labelledby="result-title" role="status">
              <h2 id="result-title" className="section-title flex items-center gap-2">
                <CircleCheck size={20} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                {result.created} {result.created === 1 ? 'invitation' : 'invitations'} created
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                People get access the first time they sign in with Google, before their invitation expires.
              </p>
              {(result.skipped.length > 0 || result.invalid.length > 0) && (
                <>
                  <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Not imported</h3>
                  <ul className="text-sm flex flex-col gap-1">
                    {result.invalid.map((r) => (
                      <li key={`i${r.line}`} className="text-muted-foreground">
                        Line {r.line}{r.email ? ` (${r.email})` : ''}: {r.problem}
                      </li>
                    ))}
                    {result.skipped.map((s) => (
                      <li key={`s${s.row}`} className="text-muted-foreground">
                        Line {s.line ?? '?'} ({s.email}): {s.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <Link to=".." relative="path" className="btn-secondary mt-4">Back to People &amp; Access</Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
