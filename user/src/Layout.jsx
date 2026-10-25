import { NavLink, Outlet } from 'react-router-dom';
import { Art } from '@shared/Art.jsx';
import { useAuth } from '@shared/auth.jsx';
import { Wordmark, cx } from '@shared/ui.jsx';
import { initials } from '@shared/format.js';

const NAV = [['/', 'Overview'], ['/transfer', 'Send money'], ['/cards', 'Cards'], ['/deposits', 'Deposits'], ['/loans', 'Loans']];

export default function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-8">
          <Wordmark />
          <nav className="flex items-center gap-1" aria-label="Main">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) => cx('rounded-lg px-3.5 py-2 text-[14.5px] font-medium transition-colors',
                  isActive ? 'bg-violet-100 text-ink-800' : 'text-ink-400 hover:text-ink-800')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <NavLink to="/profile" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-violet-50">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-violet-200 bg-violet-100 text-[12px] font-semibold text-violet-700">{initials(user.name)}</span>
              <span className="text-[14px] font-medium text-ink-700">{user.name.split(' ')[0]}</span>
            </NavLink>
            <button onClick={signOut} className="text-[14px] text-ink-400 underline-offset-4 hover:text-ink-800 hover:underline">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-8 py-10">
        <Outlet />
      </main>

      {/* scenery lives below the content, in its own space */}
      <footer className="relative mt-6 h-[340px] overflow-hidden" aria-hidden="true">
        <Art name="hillside" fade="l t" fadeSize={22} className="absolute bottom-0 right-0 h-[460px] w-[460px] translate-y-[70px]" />
      </footer>
    </div>
  );
}
