// Screens whose backend routes are not written yet. Each renders the shared "Coming soon" page.
export const SOON = {
  transfer: {
    path: '/transfer', label: 'Send money', title: 'Send money', art: 'sailboat',
    subtitle: 'Move money between accounts by account number or mobile number.',
    features: ['Pay anyone by account or mobile number', 'Recent and frequent payees', 'Confirm each payment with a one-time code', 'A receipt for every transfer'],
  },
  deposits: {
    path: '/deposits', label: 'Deposits', title: 'Fixed deposits', art: 'horizon',
    subtitle: 'Money set aside to grow, with the date it matures.',
    features: ['Your deposits and their interest rates', 'Progress to maturity', 'Payouts received so far'],
  },
  loans: {
    path: '/loans', label: 'Loans', title: 'Loans', art: 'horizon',
    subtitle: 'What you owe, what is next, and how far along you are.',
    features: ['Outstanding amount and next EMI', 'Full repayment schedule', 'Installments paid so far'],
  },
};
