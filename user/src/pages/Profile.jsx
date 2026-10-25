import { useApi } from '@shared/api.js';
import { Alert, Card, ErrorNote, KV, Loading, PageHeader, StatusBadge } from '@shared/ui.jsx';
import { fmtDate } from '@shared/format.js';

export default function Profile() {
  const { data: c, error } = useApi('/customer/me');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!c) return <Loading />;
  return (
    <div className="soft-in">
      <PageHeader title={c.name} subtitle={`Customer since ${fmtDate(c.member_since)}`} />
      <div className="grid max-w-[900px] gap-6 md:grid-cols-2">
        <Card className="px-6 py-3"><h3 className="pb-1 pt-3 text-[18px]">Personal</h3><dl>
          <KV k="Date of birth" v={fmtDate(c.dob)} /><KV k="PAN" v={<span className="tnum">{c.pan_no ?? '—'}</span>} />
          <KV k="KYC" v={<StatusBadge status={c.kyc_status} />} /></dl></Card>
        <Card className="px-6 py-3"><h3 className="pb-1 pt-3 text-[18px]">Contact</h3><dl>
          {c.phones.map((p) => <KV key={p.ph_no} k={p.is_primary ? 'Mobile (OTP)' : 'Mobile'} v={<span className="tnum">{p.ph_no}</span>} />)}
          {c.emails.map((e) => <KV key={e.mail} k="Email" v={e.mail} />)}
          <KV k="Address" v={<span className="block max-w-[220px]">{c.address_line}, {c.city}, {c.state} {c.pincode}</span>} /></dl></Card>
      </div>
      <Alert tone="info" className="mt-6 max-w-[900px]">To change your address, phone number or email, please visit your branch. For your safety we verify these in person.</Alert>
    </div>
  );
}
