import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import ComingSoon from '@shared/ComingSoon.jsx';
import { Loading } from '@shared/ui.jsx';

import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Security from './pages/Security.jsx';
import Cards from './pages/Cards.jsx';
import Customers from './pages/Customer.jsx';
import Accounts from './pages/Accounts.jsx';
import CashCounter from './pages/CashCounter.jsx';
import Transactions from './pages/Transactions.jsx';

import { SOON } from './soon.js';
import { canOpenPage, pageFeatures } from './access.js';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loading />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const allowed = (page, element) =>
    canOpenPage(user, page)
      ? element
      : <Navigate to="/" replace />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />

        <Route
          path="cards"
          element={allowed('cards', <Cards />)}
        />

        <Route
          path="customers"
          element={allowed('customers', <Customers />)}
/>

<Route
  path="accounts"
  element={allowed('accounts', <Accounts />)}
/>

<Route
  path="cash"
  element={allowed('cash', <CashCounter />)}
/>

<Route
  path="transactions"
  element={allowed('transactions', <Transactions />)}
/>

        <Route path="security" element={<Security />} />

        {Object.entries(SOON).filter(([key]) =>
  !['customers', 'accounts', 'cash', 'transactions'].includes(key)
).map(([key, page]) => (
          <Route
            key={page.path}
            path={page.path.slice(1)}
            element={allowed(
              key,
              <ComingSoon
                {...page}
                subtitle={
                  user.scope === 'ALL_BRANCHES'
                    ? 'Your permitted work across all branches.'
                    : `Your permitted work at ${user.branch.name}.`
                }
                features={pageFeatures(user, key)}
              />
            )}
          />
        ))}

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Route>
    </Routes>
  );
}