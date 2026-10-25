import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import { Badge, Wordmark, cx } from '@shared/ui.jsx';
import { initials, titleCase } from '@shared/format.js';

const I = (d) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const NAV = [
  ['/', 'Overview', null, 'M2.5 8 9 2.5 15.5 8v7a.5.5 0 0 1-.5.5h-3.5V11h-5v4.5H3a.5.5 0 0 1-.5-.5V8Z'],
  ['/accounts', 'Accounts', ['VIEW_ACCOUNTS'], 'M2.5 5.5h13v9h-13zM2.5 8.5h13'],
  ['/customers', 'Customers', ['VIEW_PERSONAL_INFO'], 'M9 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 15.5c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5'],
  ['/cash', 'Cash counter', ['CASH_DEPOSIT', 'CASH_WITHDRAW'], 'M3 6h12v7H3zM9 7.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z'],
  ['/transactions', 'Transactions', ['VIEW_ALL_TRANSACTIONS'], 'M3 6h11m0 0-3-3m3 3-3 3M15 12H4m0 0 3-3m-3 3 3 3'],
  ['/search', 'Ask in plain English', ['USE_NL_SEARCH'], 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM12 12l3.5 3.5'],
  ['/employees', 'Staff', ['VIEW_EMPLOYEE_ROLES', 'MANAGE_EMPLOYEES'], 'M6.5 8a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6ZM2 14c0-2.3 2-3.5 4.5-3.5S11 11.7 11 14M12 4.5a2 2 0 0 1 0 3.8M13.5 10.7c1.3.4 2.2 1.4 2.2 3.3'],
  ['/audit', 'Audit log', ['VIEW_AUDIT_LOG'], 'M4 2.5h7.5L14.5 5.5v10h-10.5zM6.5 8.5h5M6.5 11.5h5'],
];

export default function Layout() {
  const { user, can, signOut } = useAuth();
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="sticky top-0 flex h-screen w-[250px] shrink-0 flex-col border-r border-line bg-violet-50/60 px-4 py-6">
        <Wordmark sub="Staff" className="px-2" />
        <nav className="mt-9 flex flex-1 flex-col gap-0.5" aria-label="Main">
          {NAV.filter(([, , perms]) => !perms || perms.some(can)).map(([to, label, , icon]) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors',
                isActive ? 'bg-white text-ink-800 shadow-[0_1px_2px_rgba(20,27,74,0.08)] ring-1 ring-line' : 'text-ink-500 hover:bg-white/70 hover:text-ink-800')}>
              {I(icon)}{label}
            </NavLink>
          ))}
        </nav>
        <div className="rounded-xl border border-line bg-white p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-violet-100 text-[12px] font-semibold text-violet-700">{initials(user.emp_name)}</span>
            <div className="min-w-0"><div className="truncate text-[14px] font-medium text-ink-900">{user.emp_name}</div>
              <div className="truncate text-[12.5px] text-ink-400">{user.branch_name}</div></div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Badge tone="violet">{titleCase(user.role_name)}</Badge>
            <button onClick={signOut} className="text-[13px] text-ink-400 underline-offset-4 hover:text-ink-800 hover:underline">Sign out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-9"><div className="mx-auto max-w-[1100px]"><Outlet /></div></main>
    </div>
  );
}
