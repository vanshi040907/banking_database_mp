import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import ComingSoon from '@shared/ComingSoon.jsx';
import { Loading } from '@shared/ui.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AccountDetail from './pages/AccountDetail.jsx';
import Security from './pages/Security.jsx';
import Transfer from './pages/Transfer.jsx';
import { SOON } from './soon.js';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><Loading /></div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="accounts/:acc" element={<AccountDetail />} />
        <Route path="security" element={<Security />} />
        <Route path="transfer" element={<Transfer />} />
        {Object.values(SOON).map((s) => <Route key={s.path} path={s.path.slice(1)} element={<ComingSoon {...s} />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
