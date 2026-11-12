import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import { Wordmark, cx } from '@shared/ui.jsx';
import { SOON } from './soon.js';

const Icon = ({ d }) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const CARD = 'M2.5 4.5h13a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5ZM2.5 8h13M5 11.5h3';
const HOME = 'M2.5 8 9 2.5 15.5 8v7a.5.5 0 0 1-.5.5h-3.5V11h-5v4.5H3a.5.5 0 0 1-.5-.5V8Z';

const link = ({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors',
  isActive ? 'bg-white text-ink-800 shadow-[0_1px_2px_rgba(20,27,74,0.08)] ring-1 ring-line' : 'text-ink-500 hover:bg-white/70 hover:text-ink-800');

export default function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="sticky top-0 flex h-screen w-[250px] shrink-0 flex-col border-r border-line bg-violet-50/60 px-4 py-6">
        <Wordmark sub="Staff" className="px-2" />
        <nav className="mt-9 flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main">
          <NavLink to="/" end className={link}><Icon d={HOME} />Overview</NavLink>
          <NavLink to="/cards" className={link}><Icon d={CARD} />Cards</NavLink>
          {Object.values(SOON).map((s) => (
            <NavLink key={s.path} to={s.path} className={link}>
              <Icon d={s.icon} />
              <span className="flex-1">{s.label}</span>
              <span className="rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-600">Soon</span>
            </NavLink>
          ))}
        </nav>
        <div className="rounded-xl border border-line bg-white p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-violet-200 bg-violet-100 text-[12px] font-semibold text-violet-700">E{user.id}</span>
            <div className="min-w-0"><div className="truncate text-[14px] font-medium text-ink-900">Employee {user.id}</div>
              <div className="truncate text-[12.5px] text-ink-400">Signed in</div></div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <NavLink to="/security" className="text-[13px] text-ink-500 underline-offset-4 hover:text-ink-800 hover:underline">Security</NavLink>
            <button onClick={signOut} className="text-[13px] text-ink-400 underline-offset-4 hover:text-ink-800 hover:underline">Sign out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-9"><div className="mx-auto max-w-[1100px]"><Outlet /></div></main>
    </div>
  );
}
