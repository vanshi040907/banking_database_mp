import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';

export const getMyAccounts = wrap(async (req, res) => {
  const custId = req.user.id;

  const accounts = await prisma.account.findMany({
    where: {
      cust_id: custId
    },
    select: {
      acc_no: true,
      balance: true,
      status: true,
      is_primary: true,
      creation_date: true,
      account_type: {
        select: {
          type_name: true
        }
      },
      branch: {
        select: {
          branch_name: true,
          ifsc_code: true
        }
      }
    },
    orderBy: {
      acc_no: 'asc'
    }
  });

  res.json({
    totalAccounts: accounts.length,
    accounts: accounts.map(account => ({
      accountNumber: account.acc_no.toString(),
      balance: account.balance.toString(),
      status: account.status,
      isPrimary: account.is_primary,
      openingDate: account.creation_date,
      accountType: account.account_type.type_name,
      branchName: account.branch.branch_name,
      ifscCode: account.branch.ifsc_code
    }))
  });
});