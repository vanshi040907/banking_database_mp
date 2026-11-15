import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
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
import Staff from './pages/Staff.jsx';
import AuditLog from './pages/AuditLog.jsx';

import Loans from './pages/Loans.jsx';
import Deposits from './pages/Deposits.jsx';
import FixedDeposits from './pages/FixedDeposits.jsx';
import { canOpenPage } from './access.js';

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
        <Route path="loans" element={allowed('loans', <Loans />)} />
        <Route path="deposits" element={allowed('deposits', <Deposits />)} />
        <Route path="fixed-deposits" element={allowed('fixedDeposits', <FixedDeposits />)} />
        <Route path="security" element={<Security />} />

        <Route path="cards" element={allowed('cards', <Cards />)} />
        <Route path="customers" element={allowed('customers', <Customers />)} />
        <Route path="accounts" element={allowed('accounts', <Accounts />)} />
        <Route path="cash" element={allowed('cash', <CashCounter />)} />
        <Route path="transactions" element={allowed('transactions', <Transactions />)} />
        <Route path="staff" element={allowed('staff', <Staff />)} />
        <Route path="audit" element={allowed('audit', <AuditLog />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}