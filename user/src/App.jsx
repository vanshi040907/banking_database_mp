import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import { Loading } from '@shared/ui.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AccountDetail from './pages/AccountDetail.jsx';
import Transfer from './pages/Transfer.jsx';
import Cards from './pages/Cards.jsx';
import Deposits from './pages/Deposits.jsx';
import Loans from './pages/Loans.jsx';
import Profile from './pages/Profile.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><Loading /></div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="accounts/:acc" element={<AccountDetail />} />
        <Route path="transfer" element={<Transfer />} />
        <Route path="cards" element={<Cards />} />
        <Route path="deposits" element={<Deposits />} />
        <Route path="loans" element={<Loans />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
