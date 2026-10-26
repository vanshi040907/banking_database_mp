// Staff screens whose backend routes are not written yet. The backend does not tell the portal
// which role the employee has, so every entry is listed for everyone for now.
export const SOON = {
  accounts: {
    path: '/accounts', label: 'Accounts', title: 'Accounts', art: 'horizon', icon: 'M2.5 5.5h13v9h-13zM2.5 8.5h13',
    subtitle: 'Find any account in your branch, then freeze, unfreeze or close it.',
    features: ['Search by account number or holder', 'Balances and status at a glance', 'Freeze and unfreeze with a recorded reason', 'Close an account once its balance is zero'],
  },
  customers: {
    path: '/customers', label: 'Customers', title: 'Customers', art: 'horizon', icon: 'M9 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 15.5c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5',
    subtitle: 'Register customers, keep their details current and open their accounts.',
    features: ['Register a customer after checking documents', 'Edit address, phone and email', 'Open a new account', 'KYC status for every customer'],
  },
  cash: {
    path: '/cash', label: 'Cash counter', title: 'Cash counter', art: 'sailboat', icon: 'M3 6h12v7H3zM9 7.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z',
    subtitle: 'Record cash deposits and withdrawals handed over the counter.',
    features: ['Deposit and withdraw cash', 'Balance checks before every withdrawal', 'Each entry tied to your employee ID'],
  },
  transactions: {
    path: '/transactions', label: 'Transactions', title: 'Transactions', art: 'horizon', icon: 'M3 6h11m0 0-3-3m3 3-3 3M15 12H4m0 0 3-3m-3 3 3 3',
    subtitle: 'Every movement of money in your scope, newest first.',
    features: ['Filter by type, amount and date', 'Search by account or reference', 'Branch-scoped, or all branches for analysts'],
  },
  search: {
    path: '/search', label: 'Ask in plain English', title: 'Ask in plain English', art: 'horizon', icon: 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM12 12l3.5 3.5',
    subtitle: 'Type a question about accounts or transactions and get a table back.',
    features: ['“Frozen accounts”', '“Transfers above 10k this week”', '“Top 3 accounts by balance”', 'No personal details for roles that should not see them'],
  },
  staff: {
    path: '/staff', label: 'Staff', title: 'Staff', art: 'horizon', icon: 'M6.5 8a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6ZM2 14c0-2.3 2-3.5 4.5-3.5S11 11.7 11 14M12 4.5a2 2 0 0 1 0 3.8M13.5 10.7c1.3.4 2.2 1.4 2.2 3.3',
    subtitle: 'People, roles and access across the bank.',
    features: ['See who works where, and in which role', 'Add staff and issue temporary passwords', 'Change roles, suspend or deactivate'],
  },
  audit: {
    path: '/audit', label: 'Audit log', title: 'Audit log', art: 'horizon', icon: 'M4 2.5h7.5L14.5 5.5v10h-10.5zM6.5 8.5h5M6.5 11.5h5',
    subtitle: 'Sensitive actions, who did them and why. The log can only be added to.',
    features: ['Account openings, closures and freezes', 'The reason recorded with each action', 'Who did it and when'],
  },
};
