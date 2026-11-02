import { useEffect, useState } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import SuccessMessage from '../../components/common/SuccessMessage';
import ButtonSelect from '../../components/common/ButtonSelect';
import { useAuth } from '../../context/AuthContext';
import {
  listMembers, updateMemberRole, removeMember, setMemberEmail,
  listInvitations, createInvitation, revokeInvitation,
  listAccessRequests, approveAccessRequest, rejectAccessRequest,
} from '../../services/org.service';

// People & Access (ORG_ADMIN): invite people by email with a role, review
// access requests, change roles and remove members. Role options come from
// the session, i.e. only the roles this organisation's profile allows.
export default function Members() {
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
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'That did not work. Please try again.');
      return false;
    }
  };

  const sendInvite = (e) => {
    e.preventDefault();
    run(() => createInvitation(invite), `Invitation sent to ${invite.email}. They can sign in with that Google account.`)
      .then((ok) => ok && setInvite({ email: '', role: '' }));
  };

  if (loading) return <LoadingSpinner label="Loading people..." />;

  return (
    <div className="p-4 pb-10 max-w-2xl mx-auto flex flex-col gap-6">
      <ErrorMessage message={error} />
      <SuccessMessage message={notice} />

      <section className="glass-card p-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Invite someone</h2>
        <p className="text-xs text-gray-400 mb-3">
          Organisation code for access requests: <span className="font-mono text-gray-600 dark:text-gray-300">{session.organization.slug}</span>
        </p>
        <form onSubmit={sendInvite} className="flex flex-col gap-3">
          <input type="email" required placeholder="name@gmail.com" className="input-field"
            value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <ButtonSelect ariaLabel="Role" options={roleOptions} value={invite.role}
            onChange={(role) => setInvite({ ...invite, role })} size="sm" />
          <button type="submit" disabled={!invite.role} className="btn-primary">Send invitation</button>
        </form>
        {invitations.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 dark:divide-white/5">
            {invitations.map((i) => (
              <li key={i.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-gray-700 dark:text-gray-200">
                  {i.email} <span className="badge-neutral ml-1">{labelFor(i.role)}</span>
                  {i.expired && <span className="badge-warning ml-1">Expired</span>}
                </span>
                <button onClick={() => run(() => revokeInvitation(i.id), 'Invitation revoked.')} className="text-xs text-rose-500">Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {requests.length > 0 && (
        <section className="glass-card p-5">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Access requests</h2>
          <ul className="flex flex-col gap-4">
            {requests.map((r) => (
              <li key={r.id} className="text-sm">
                <p className="font-medium text-gray-800 dark:text-gray-100">{r.user.name} <span className="text-gray-400 font-normal">{r.user.email}</span></p>
                {r.message && <p className="text-gray-500 dark:text-gray-400 italic mt-0.5">“{r.message}”</p>}
                <div className="mt-2 flex flex-col gap-2">
                  <ButtonSelect ariaLabel="Role to grant" options={roleOptions} size="sm"
                    value={approveRole[r.id] || ''} onChange={(role) => setApproveRole({ ...approveRole, [r.id]: role })} />
                  <div className="flex gap-2">
                    <button disabled={!approveRole[r.id]} className="btn-primary flex-1"
                      onClick={() => run(() => approveAccessRequest(r.id, approveRole[r.id]), `${r.user.name} can now sign in.`)}>Approve</button>
                    <button className="btn-secondary flex-1" onClick={() => run(() => rejectAccessRequest(r.id), 'Request rejected.')}>Reject</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass-card p-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Members ({members.length})</h2>
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-white/5">
          {members.map((m) => {
            const name = m.user.name || `${m.user.firstName} ${m.user.lastName}`;
            const isMe = m.user.id === session.user.id;
            return (
              <li key={m.id} className="py-3 text-sm">
                <div className="flex items-center gap-3">
                  {m.user.picture
                    ? <img src={m.user.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    : <span className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center">👤</span>}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{name}{isMe && ' (you)'}</p>
                    <p className="text-xs text-gray-400 truncate">{m.user.email || 'No email yet'}</p>
                  </div>
                  <span className="badge-neutral">{labelFor(m.role)}</span>
                </div>
                {!isMe && (
                  <div className="mt-2 flex flex-col gap-2 pl-11">
                    <ButtonSelect ariaLabel={`Role for ${name}`} options={roleOptions} size="sm" value={m.role}
                      onChange={(role) => role !== m.role && run(() => updateMemberRole(m.id, role), `${name} is now ${labelFor(role)}.`)} />
                    {!m.user.googleLinked && (
                      <div className="flex gap-2">
                        <input type="email" placeholder="Their Google email" className="input-field flex-1"
                          value={claimEmail[m.id] ?? m.user.email ?? ''} onChange={(e) => setClaimEmail({ ...claimEmail, [m.id]: e.target.value })} />
                        <button className="btn-secondary" onClick={() => run(() => setMemberEmail(m.id, claimEmail[m.id]), 'Email saved.')}>Save</button>
                      </div>
                    )}
                    {confirmRemove === m.id ? (
                      <div className="flex gap-2">
                        <button className="btn-danger flex-1" onClick={() => run(() => removeMember(m.id), `${name} was removed.`)}>Confirm removal</button>
                        <button className="btn-secondary flex-1" onClick={() => setConfirmRemove(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="text-xs text-rose-500 self-start" onClick={() => setConfirmRemove(m.id)}>Remove from organisation</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
