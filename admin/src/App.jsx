import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import { Loading } from '@shared/ui.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Customers from './pages/Customers.jsx';
import Cash from './pages/Cash.jsx';
import Transactions from './pages/Transactions.jsx';
import Search from './pages/Search.jsx';
import Employees from './pages/Employees.jsx';
import Audit from './pages/Audit.jsx';

export default function App() {
  const { user, loading, can } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><Loading /></div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  const guard = (ok, el) => (ok ? el : <Navigate to="/" replace />);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={guard(can('VIEW_ACCOUNTS'), <Accounts />)} />
        <Route path="customers" element={guard(can('VIEW_PERSONAL_INFO'), <Customers />)} />
        <Route path="cash" element={guard(can('CASH_DEPOSIT') || can('CASH_WITHDRAW'), <Cash />)} />
        <Route path="transactions" element={guard(can('VIEW_ALL_TRANSACTIONS'), <Transactions />)} />
        <Route path="search" element={guard(can('USE_NL_SEARCH'), <Search />)} />
        <Route path="employees" element={guard(can('VIEW_EMPLOYEE_ROLES'), <Employees />)} />
        <Route path="audit" element={guard(can('VIEW_AUDIT_LOG'), <Audit />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
