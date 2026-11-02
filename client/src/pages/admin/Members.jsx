import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { FileSpreadsheet, User, UserPlus } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import { useAuth } from '../../context/AuthContext';
import { refreshOrgSummary } from '../../hooks/useOrgSummary';
import CsvImport from './CsvImport';
import {
  listMembers, updateMemberRole, removeMember, setMemberEmail,
  listInvitations, createInvitation, revokeInvitation,
  listAccessRequests, approveAccessRequest, rejectAccessRequest,
} from '../../services/org.service';

export default function Members() {
  return (
    <Routes>
      <Route index element={<People />} />
      <Route path="import" element={<CsvImport />} />
    </Routes>
  );
}

// People & Access (ORG_ADMIN): invite people by email with a role, review
// access requests, change roles and remove members. Role options come from
// the session, i.e. only the roles this organisation's profile allows.
function People() {
  const { session } = useAuth();
  const roles = session.organization.roles;
  const roleOptions = roles.map((r) => ({ value: r.role, label: r.label }));
  const labelFor = (role) => roles.find((r) => r.role === role)?.label || role;

  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invite, setInvite] = useState({ email: '', role: '' });
  const [inviteError, setInviteError] = useState('');
  const [approveRole, setApproveRole] = useState({});
  const [claimEmail, setClaimEmail] = useState({});
  const [confirmRemove, setConfirmRemove] = useState(null);

  const load = () => Promise.all([listMembers(), listInvitations(), listAccessRequests()])
    .then(([m, i, r]) => { setMembers(m.members); setInvitations(i.invitations); setRequests(r.requests); })
    .catch(() => setError('Could not load people.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const run = async (fn, success) => {
    setError(''); setNotice('');
    try {
      await fn();
      if (success) setNotice(success);
      await load();
      refreshOrgSummary();
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'That did not work. Please try again.');
      return false;
    }
  };

  const sendInvite = (e) => {
    e.preventDefault();
    if (!invite.role) { setInviteError('Choose a role.'); return; }
    setInviteError('');
    run(() => createInvitation(invite), `Invitation sent to ${invite.email}. They can sign in with that Google account.`)
      .then((ok) => ok && setInvite({ email: '', role: '' }));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">People &amp; Access</h1>
          <p className="page-subtitle">
            Organisation code for access requests: <span className="font-mono font-medium text-foreground">{session.organization.slug}</span>
          </p>
        </div>
        <Link to="import" className="btn-secondary">
          <FileSpreadsheet size={18} aria-hidden="true" /> Import CSV
        </Link>
      </div>

      <ErrorMessage message={error} />
      <SuccessMessage message={notice} />

      {loading ? <LoadingSpinner label="Loading people..." /> : (
        <div className="grid lg:grid-cols-5 gap-5 items-start">
          <div className="lg:col-span-2 flex flex-col gap-5">
            {requests.length > 0 && (
              <section className="glass-card p-5 border-amber-300 dark:border-amber-500/40" aria-labelledby="requests-title">
                <h2 id="requests-title" className="section-title mb-1">Waiting for access ({requests.length})</h2>
                <p className="text-sm text-muted-foreground mb-4">Choose a role to approve, or reject the request.</p>
                <ul className="flex flex-col divide-y divide-border">
                  {requests.map((r) => (
                    <li key={r.id} className="py-4 first:pt-0 last:pb-0 text-sm">
                      <p className="font-medium text-foreground">{r.user.name}</p>
                      <p className="text-muted-foreground break-all">{r.user.email}</p>
                      {r.message && <p className="mt-1 text-muted-foreground italic">“{r.message}”</p>}
                      <div className="mt-3 flex flex-col gap-2">
                        <ButtonSelect ariaLabel={`Role to grant ${r.user.name}`} options={roleOptions} size="sm"
                          value={approveRole[r.id] || ''} onChange={(role) => setApproveRole({ ...approveRole, [r.id]: role })} />
                        <div className="flex gap-2">
                          <button type="button" disabled={!approveRole[r.id]} className="btn-primary flex-1"
                            onClick={() => run(() => approveAccessRequest(r.id, approveRole[r.id]), `${r.user.name} can now sign in.`)}>
                            Approve
                          </button>
                          <button type="button" className="btn-secondary flex-1"
                            onClick={() => run(() => rejectAccessRequest(r.id), 'Request rejected.')}>Reject</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="glass-card p-5" aria-labelledby="invite-title">
              <h2 id="invite-title" className="section-title flex items-center gap-2 mb-4">
                <UserPlus size={18} aria-hidden="true" /> Invite someone
              </h2>
              <form onSubmit={sendInvite} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="invite-email" className="field-label">Google email</label>
                  <input id="invite-email" type="email" required autoComplete="off" placeholder="name@gmail.com" className="input-field"
                    value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                </div>
                <fieldset>
                  <legend className="field-label">Role</legend>
                  <ButtonSelect ariaLabel="Role" options={roleOptions} value={invite.role}
                    onChange={(role) => { setInvite({ ...invite, role }); setInviteError(''); }} size="sm" />
                  {inviteError && <p role="alert" className="field-error">{inviteError}</p>}
                </fieldset>
                <button type="submit" className="btn-primary">Send invitation</button>
              </form>
              {invitations.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-foreground mt-6 mb-1">Pending invitations ({invitations.length})</h3>
                  <ul className="divide-y divide-border">
                    {invitations.map((i) => (
                      <li key={i.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{i.email}</span>
                          <span className="flex gap-1 mt-0.5">
                            <span className="badge-neutral">{labelFor(i.role)}</span>
                            {i.metadata?.children?.length > 0 && (
                              <span className="badge-info">{i.metadata.children.length} {i.metadata.children.length === 1 ? 'child' : 'children'}</span>
                            )}
                            {i.expired && <span className="badge-warning">Expired</span>}
                          </span>
                        </span>
                        <button type="button" className="btn-ghost btn-sm text-danger shrink-0"
                          aria-label={`Revoke invitation for ${i.email}`}
                          onClick={() => run(() => revokeInvitation(i.id), 'Invitation revoked.')}>Revoke</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>

          <section className="glass-card p-5 lg:col-span-3" aria-labelledby="members-title">
            <h2 id="members-title" className="section-title mb-2">Members ({members.length})</h2>
            <ul className="flex flex-col divide-y divide-border">
              {members.map((m) => {
                const name = m.user.name || `${m.user.firstName} ${m.user.lastName}`;
                const isMe = m.user.id === session.user.id;
                return (
                  <li key={m.id} className="py-3 text-sm">
                    <div className="flex items-center gap-3">
                      {m.user.picture
                        ? <img src={m.user.picture} alt="" width={36} height={36} className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
                        : (
                          <span className="w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center" aria-hidden="true">
                            <User size={18} />
                          </span>
                        )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{name}{isMe && ' (you)'}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.user.email || 'No email yet'}</p>
                      </div>
                      <span className="badge-neutral">{labelFor(m.role)}</span>
                    </div>
                    {!isMe && (
                      <div className="mt-2 flex flex-col gap-2 pl-12">
                        <ButtonSelect ariaLabel={`Role for ${name}`} options={roleOptions} size="sm" value={m.role}
                          onChange={(role) => role !== m.role && run(() => updateMemberRole(m.id, role), `${name} is now ${labelFor(role)}.`)} />
                        {!m.user.googleLinked && (
                          <div className="flex gap-2">
                            <label htmlFor={`claim-${m.id}`} className="sr-only">Google email for {name}</label>
                            <input id={`claim-${m.id}`} type="email" placeholder="Their Google email" className="input-field flex-1"
                              value={claimEmail[m.id] ?? m.user.email ?? ''}
                              onChange={(e) => setClaimEmail({ ...claimEmail, [m.id]: e.target.value })} />
                            <button type="button" className="btn-secondary"
                              onClick={() => run(() => setMemberEmail(m.id, claimEmail[m.id]), 'Email saved.')}>Save</button>
                          </div>
                        )}
                        {confirmRemove === m.id ? (
                          <div className="flex gap-2">
                            <button type="button" className="btn-danger flex-1"
                              onClick={() => run(() => removeMember(m.id), `${name} was removed.`)}>Confirm removal</button>
                            <button type="button" className="btn-secondary flex-1" onClick={() => setConfirmRemove(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button type="button" className="btn-ghost btn-sm self-start -ml-3 text-danger" onClick={() => setConfirmRemove(m.id)}>
                            Remove from organisation
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
