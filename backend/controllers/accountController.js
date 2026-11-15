import { prisma } from '../db.js';
import { openCustomerAccount } from '../services/accountService.js';

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

const endpoint = handler => async (req, res, next) => {
  res.set('Cache-Control', 'no-store');

  try {
    await handler(req, res);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message
      });
    }

    if (error.sqlState === '45000') {
      const message = error.sqlMessage;

      const status =
        message === 'Customer not found in your scope'
          ? 404
          : [
              'Account opening permission denied',
              'Cannot open accounts in another branch',
              'Employee is not active'
            ].includes(message)
            ? 403
            : message === 'Request key reused with different account details'
              ? 409
              : 400;

      return res.status(status).json({ error: message });
    }

    if (
      ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']
        .includes(error.code)
    ) {
      return res.status(409).json({
        error: 'Account opening was interrupted. Retry the same submission.'
      });
    }

    next(error);
  }
};

function positiveId(value, label) {
  if (
    !/^[1-9]\d{0,9}$/.test(String(value)) ||
    Number(value) > 2147483647
  ) {
    fail(400, `Invalid ${label}`);
  }

  return Number(value);
}

export const getAccountOpeningOptions = endpoint(
  async (req, res) => {
    const [branches, types] = await Promise.all([
      prisma.branch.findMany({
        where: {
          status: 'ACTIVE',
          ...(
            req.employeeScope.allBranches
              ? {}
              : {
                  ifsc_code:
                    req.employeeScope.branchIfsc
                }
          )
        },

        select: {
          ifsc_code: true,
          branch_name: true
        },

        orderBy: { branch_name: 'asc' }
      }),

      prisma.account_type.findMany({
        orderBy: { type_id: 'asc' }
      })
    ]);

    res.json({
      branches: branches.map(branch => ({
        ifscCode: branch.ifsc_code,
        name: branch.branch_name
      })),

      types: types.map(type => ({
        typeId: type.type_id,
        name: type.type_name,
        minBalance: type.min_balance.toString(),
        interestRate: type.interest_rate.toString()
      }))
    });
  }
);

export const getCustomerAccounts = endpoint(
  async (req, res) => {
    const customerId = positiveId(
      req.params.customerId, 'customer ID'
    );

    const scope = req.employeeScope;

    const customer = await prisma.customer.findFirst({
      where: {
        cust_id: customerId,

        ...(
          scope.allBranches
            ? {}
            : {
                OR: [
                  {
                    registered_branch_ifsc:
                      scope.branchIfsc
                  },
                  {
                    account: {
                      some: {
                        branch_ifsc: scope.branchIfsc
                      }
                    }
                  }
                ]
              }
        )
      },

      select: { cust_id: true }
    });

    if (!customer) {
      fail(404, 'Customer not found in your scope');
    }

    const accounts = await prisma.account.findMany({
      where: {
        cust_id: customerId,

        ...(
          scope.allBranches
            ? {}
            : { branch_ifsc: scope.branchIfsc }
        )
      },

      select: {
        acc_no: true,
        balance: true,
        status: true,
        is_primary: true,
        creation_date: true,

        account_type: {
          select: { type_name: true }
        },

        branch: {
          select: {
            branch_name: true,
            ifsc_code: true
          }
        }
      },

      orderBy: { acc_no: 'asc' }
    });

    res.json({
      accounts: accounts.map(account => ({
        accountNumber: String(account.acc_no),
        balance: account.balance.toString(),
        status: account.status,
        isPrimary: account.is_primary,
        openingDate: account.creation_date,
        accountType: account.account_type.type_name,
        branchName: account.branch.branch_name,
        branchIfsc: account.branch.ifsc_code
      }))
    });
  }
);

export const createEmployeeAccount = endpoint(
  async (req, res) => {
    const body = req.body ?? {};

    const customerId = positiveId(
      body.customerId, 'customer ID'
    );

    const typeId = positiveId(
      body.typeId, 'account type'
    );

    if (
      typeof body.openingAmount !== 'string' ||
      !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/
        .test(body.openingAmount)
    ) {
      fail(
        400,
        'Opening amount must be a non-negative decimal string with at most two decimal places'
      );
    }

    if (
      typeof body.idempotencyKey !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(body.idempotencyKey)
    ) {
      fail(400, 'A valid request key is required');
    }

    const scope = req.employeeScope;

    if (
      !scope.allBranches &&
      body.branchIfsc &&
      body.branchIfsc !== scope.branchIfsc
    ) {
      fail(403, 'Cannot open accounts in another branch');
    }

    const branchIfsc = scope.allBranches
      ? body.branchIfsc
      : scope.branchIfsc;

    if (
      typeof branchIfsc !== 'string' ||
      !/^[A-Z0-9]{11}$/.test(branchIfsc)
    ) {
      fail(400, 'Select a valid branch');
    }

    const accountNumber = await openCustomerAccount({
      customerId,
      typeId,
      branchIfsc,
      openingAmount: body.openingAmount,
      employeeId: req.user.id,
      idempotencyKey: body.idempotencyKey
    });

    res.status(201).json({
      accountNumber,
      message: `Account ${accountNumber} opened successfully`
    });
  }
);