import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth.jsx';
import { Badge, Card, SectionTitle } from '@shared/ui.jsx';
import { greeting, titleCase } from '@shared/format.js';

import { SOON } from '../soon.js';
import { can, canOpenPage } from '../access.js';

export default function Overview() {
  const { user } = useAuth();

  const upcoming = Object.entries(SOON)
  .filter(([key]) =>
  !['customers', 'accounts', 'cash', 'transactions', 'staff'].includes(key) &&
  canOpenPage(user, key)
)
  .map(([, page]) => page);

  const ready = [
    ['Secure sign-in', 'Employee ID, password and a one-time code'],
    ['Password change', 'Manage your password from Security']
  ];

  if (can(user, 'ISSUE_CARD')) {
    ready.push(['Issue cards', 'Create demo debit and credit cards']);
  }

  if (can(user, 'UPDATE_CARD_LIMIT')) {
    ready.push(['Card limits', 'Update daily spending limits']);
  }

  if (canOpenPage(user, 'customers')) {
  ready.push([
    'Customers',
    'Search profiles and perform your permitted customer actions'
  ]);
}

if (can(user, 'VIEW_ACCOUNTS')) {
  ready.push([
    'Accounts',
    'View account details and perform your permitted account actions'
  ]);
}

if (
  can(user, 'CASH_DEPOSIT') ||
  can(user, 'CASH_WITHDRAW')
) {
  ready.push([
    'Cash counter',
    'Record permitted cash operations and view receipts'
  ]);
}

if (can(user, 'VIEW_ALL_TRANSACTIONS')) {
  ready.push([
    'Transactions',
    'Browse and filter ledger transactions within your branch scope'
  ]);
}

if (
  can(user, 'VIEW_EMPLOYEE_ROLES') ||
  can(user, 'MANAGE_EMPLOYEES')
) {
  ready.push([
    'Staff',
    'View employees and perform permitted staff-management actions'
  ]);
}

  return (
    <div className="soft-in">
      <p className="mb-2 text-[13px] font-medium uppercase tracking-[0.12em] text-violet-600">
        {titleCase(user.role)} · Employee {user.id}
      </p>

      <h1 className="mb-2 text-[38px] leading-tight">
        {greeting()}, {user.name}.
      </h1>

      <p className="mb-9 max-w-[560px] text-ink-400">
        {user.scope === 'ALL_BRANCHES'
          ? 'You can work across all branches.'
          : `Your workspace covers ${user.branch.name}.`}
        {' '}The options below match your permissions.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle>Ready now</SectionTitle>

          <ul className="space-y-3.5 text-[15px]">
            {ready.map(([title, description]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ok-50 text-[13px] text-ok-600">
                  ✓
                </span>

                <div>
                  <div className="font-medium text-ink-900">
                    {title}
                  </div>

                  <div className="text-[13.5px] text-ink-400">
                    {description}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <SectionTitle>Coming next</SectionTitle>

          {upcoming.length === 0 && (
            <p className="text-sm text-ink-400">
              No additional modules are assigned to your role.
            </p>
          )}

          <ul className="space-y-1">
            {upcoming.map(page => (
              <li key={page.path}>
                <Link
                  to={page.path}
                  className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-violet-50"
                >
                  <span className="text-[15px] text-ink-800">
                    {page.label}
                  </span>

                  <Badge tone="violet">Soon</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}