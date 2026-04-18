import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../lib/utils';

export default function AdminAuditLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [expanded, setExpanded] = useState(null);

  const LIMIT = 50;

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: LIMIT, page });
    if (filterGroup) params.set('groupId', filterGroup);
    if (filterActor) params.set('actor', filterActor);
    axios.get(`${API_BASE_URL}/admin/audit-log?${params}`)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); })
      .catch(() => toast.error('Failed to load audit log'))
      .finally(() => setLoading(false));
  }, [page, filterGroup, filterActor]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/admin/groups`).then(r => setGroups(r.data)).catch(() => {});
    axios.get(`${API_BASE_URL}/admin/super-admins`).then(r => setAdmins(r.data.admins || [])).catch(() => {});
  }, []);

  const clearFilters = () => { setFilterGroup(''); setFilterActor(''); setPage(1); };
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
        <p className="text-sm text-text-secondary">{total} entries</p>
      </div>

      {/* Filters */}
      <div className="bg-surface-card rounded-lg p-4 mb-4 flex flex-col md:flex-row gap-3">
        <select
          value={filterGroup}
          onChange={e => { setFilterGroup(e.target.value); setPage(1); }}
          className="flex-1 border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary"
        >
          <option value="">All Groups</option>
          {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
        </select>
        <select
          value={filterActor}
          onChange={e => { setFilterActor(e.target.value); setPage(1); }}
          className="flex-1 border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary"
        >
          <option value="">All Actors</option>
          {admins.map(a => <option key={a._id} value={a.clerkUserId}>{a.email}</option>)}
        </select>
        {(filterGroup || filterActor) && (
          <button onClick={clearFilters} className="border border-border-default rounded-full px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-page">
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-text-secondary">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="bg-surface-card rounded-lg p-8 text-center text-sm text-text-secondary">No log entries found.</div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-surface-card rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  {['Time', 'Actor', 'Action', 'Target', 'Details'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log._id} className="border-b border-border-default last:border-0">
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-text-primary">{log.actorEmail}</td>
                    <td className="px-4 py-3 text-xs font-medium text-text-primary">{log.action}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{log.targetType}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                        className="text-xs text-brand-primary hover:underline"
                      >
                        {expanded === log._id ? 'Hide' : 'Show'}
                      </button>
                      {expanded === log._id && (
                        <pre className="mt-2 text-xs text-text-secondary bg-surface-page rounded p-2 overflow-x-auto max-w-xs">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3 mb-4">
            {logs.map(log => (
              <div key={log._id} className="bg-surface-card rounded-md p-4">
                <div className="flex justify-between mb-1">
                  <p className="text-sm font-medium text-text-primary">{log.action}</p>
                  <p className="text-xs text-text-secondary">{new Date(log.createdAt).toLocaleDateString()}</p>
                </div>
                <p className="text-xs text-text-secondary mb-2">{log.actorEmail} · {log.targetType}</p>
                <button
                  onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                  className="text-xs text-brand-primary hover:underline"
                >
                  {expanded === log._id ? 'Hide details' : 'Show details'}
                </button>
                {expanded === log._id && (
                  <pre className="mt-2 text-xs text-text-secondary bg-surface-page rounded p-2 overflow-x-auto">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex gap-2 justify-center">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border border-border-default rounded-full px-4 py-2 text-sm disabled:opacity-40">Prev</button>
              <span className="text-sm text-text-secondary py-2">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="border border-border-default rounded-full px-4 py-2 text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
