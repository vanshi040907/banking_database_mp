export function can(user, permission) {
  return user?.permissions?.includes(permission) ?? false;
}

export const PAGE_ACCESS = {
  cards: ['ISSUE_CARD', 'UPDATE_CARD_LIMIT', 'UNBLOCK_CARD'],

  accounts: [
    'VIEW_ACCOUNTS',
    'OPEN_ACCOUNT',
    'CLOSE_ACCOUNT',
    'FREEZE_ACCOUNT'
  ],

  customers: [
    'REGISTER_CUSTOMER',
    'VIEW_PERSONAL_INFO',
    'EDIT_CUSTOMER_DETAILS'
  ],

  cash: ['CASH_DEPOSIT', 'CASH_WITHDRAW'],

  transactions: ['VIEW_ALL_TRANSACTIONS'],

  staff: ['VIEW_EMPLOYEE_ROLES', 'MANAGE_EMPLOYEES'],

  audit: ['VIEW_AUDIT_LOG'],

  loans: ['APPROVE_LOAN'],

  deposits: ['CASH_DEPOSIT'],

  fixedDeposits: ['MANAGE_FD']
};

export function canOpenPage(user, page) {
  return (PAGE_ACCESS[page] ?? []).some(
    permission => can(user, permission)
  );
}

const FEATURES = {
  accounts: [
    ['VIEW_ACCOUNTS', 'View accounts and balances'],
    ['OPEN_ACCOUNT', 'Open an account for an existing customer'],
    ['CLOSE_ACCOUNT', 'Close an account with zero balance'],
    ['FREEZE_ACCOUNT', 'Freeze or unfreeze with a recorded reason']
  ],

  customers: [
    ['REGISTER_CUSTOMER', 'Register a customer and verify KYC'],
    ['VIEW_PERSONAL_INFO', 'View customer details'],
    ['EDIT_CUSTOMER_DETAILS', 'Update address, phone and email']
  ],

  cash: [
    ['CASH_DEPOSIT', 'Record cash deposits'],
    ['CASH_WITHDRAW', 'Record cash withdrawals']
  ],

  transactions: [
    ['VIEW_ALL_TRANSACTIONS', 'Browse and filter transactions']
  ],

  staff: [
    ['VIEW_EMPLOYEE_ROLES', 'View employees and their roles'],
    ['MANAGE_EMPLOYEES', 'Create employees and manage roles or status']
  ],

  audit: [
    ['VIEW_AUDIT_LOG', 'Inspect recorded actions within your scope']
  ]
};

export function pageFeatures(user, page) {
  return (FEATURES[page] ?? [])
    .filter(([permission]) => can(user, permission))
    .map(([, description]) => description);
}