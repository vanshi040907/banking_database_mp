import { q, dt, d, bad } from './util.js';
import { branchWhere } from './auth.js';

// Rule-based "plain English" search. It never builds SQL from the user's text:
// it only picks from fixed, parameterised queries below.
function amount(t) {
  const m = /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|crore|cr)?/i.exec(t);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toLowerCase();
  if (u === 'k' || u === 'thousand') n *= 1e3;
  else if (['lakh', 'lakhs', 'lac'].includes(u)) n *= 1e5;
  else if (['crore', 'cr'].includes(u)) n *= 1e7;
  return n;
}

export async function naturalSearch(text, req) {
  const t = text.toLowerCase();
  if (!t.trim()) throw bad('Type a question first');
  const personal = req.perms.has('VIEW_PERSONAL_INFO');
  const over = /(over|above|more than|greater than|at least|>)/.test(t);
  const under = /(under|below|less than|fewer than|<)/.test(t);
  const amt = amount(t.replace(/last\s+\d+\s+days?/, ''));

  if (/(branch).*(deposit|total)|deposits? (by|per) branch/.test(t)) {
    const w = branchWhere(req, 'ifsc_code');
    const rows = await q(`SELECT branch_name, total_accounts, branch_deposits FROM v_branch_deposits WHERE ${w.sql}`, ...w.args);
    return { interpretation: 'Total deposits per branch', columns: ['branch_name', 'total_accounts', 'branch_deposits'], money: ['branch_deposits'], rows };
  }

  if (/(transaction|transfer|deposit|withdrawal|payment)/.test(t)) {
    const w = branchWhere(req, 'COALESCE(fa.branch_ifsc, ta.branch_ifsc)');
    const args = [...w.args]; let where = w.sql; const bits = [];
    if (/transfer/.test(t)) { where += " AND tr.trans_type = 'TRANSFER'"; bits.push('transfers'); }
    else if (/withdraw/.test(t)) { where += " AND tr.trans_type = 'WITHDRAWAL'"; bits.push('withdrawals'); }
    else if (/deposit/.test(t)) { where += " AND tr.trans_type = 'DEPOSIT'"; bits.push('deposits'); }
    else bits.push('transactions');
    if (amt !== null && (over || under)) { where += ` AND tr.amount ${under && !over ? '<' : '>='} ?`; args.push(amt); bits.push(`${under && !over ? 'under' : 'of at least'} ₹${amt.toLocaleString('en-IN')}`); }
    if (/today/.test(t)) { where += ' AND DATE(tr.trans_date) = CURRENT_DATE'; bits.push('today'); }
    else if (/this week|last week|7 days/.test(t)) { where += ' AND tr.trans_date > DATE_SUB(NOW(), INTERVAL 7 DAY)'; bits.push('in the last 7 days'); }
    else if (/this month|30 days/.test(t)) { where += ' AND tr.trans_date > DATE_SUB(NOW(), INTERVAL 30 DAY)'; bits.push('in the last 30 days'); }
    const rows = await q(
      `SELECT ${dt('tr.trans_date')} AS trans_date, tr.trans_type, tr.trans_mode, tr.amount, tr.from_acc_no, tr.to_acc_no
         FROM bank_transaction tr LEFT JOIN account fa ON fa.acc_no = tr.from_acc_no
         LEFT JOIN account ta ON ta.acc_no = tr.to_acc_no
        WHERE ${where} ORDER BY tr.trans_date DESC LIMIT 100`, ...args);
    return { interpretation: `Showing ${bits.join(' ')}`, columns: ['trans_date', 'trans_type', 'trans_mode', 'amount', 'from_acc_no', 'to_acc_no'], money: ['amount'], rows };
  }

  if (/(account|balance|savings|current|salary)/.test(t)) {
    const w = branchWhere(req, 'a.branch_ifsc');
    const args = [...w.args]; let where = w.sql; const bits = [];
    if (/frozen/.test(t)) { where += " AND a.status = 'FROZEN'"; bits.push('frozen'); }
    else if (/closed/.test(t)) { where += " AND a.status = 'CLOSED'"; bits.push('closed'); }
    else if (/active/.test(t)) { where += " AND a.status = 'ACTIVE'"; bits.push('active'); }
    if (/savings/.test(t)) { where += " AND ty.type_name = 'SAVINGS'"; bits.push('savings'); }
    else if (/current/.test(t)) { where += " AND ty.type_name = 'CURRENT'"; bits.push('current'); }
    else if (/salary/.test(t)) { where += " AND ty.type_name = 'SALARY'"; bits.push('salary'); }
    if (amt !== null && (over || under)) { where += ` AND a.balance ${under && !over ? '<' : '>='} ?`; args.push(amt); bits.push(`with balance ${under && !over ? 'under' : 'of at least'} ₹${amt.toLocaleString('en-IN')}`); }
    const top = /top\s+(\d+)/.exec(t);
    const rows = await q(
      `SELECT a.acc_no, ${personal ? 'c.name AS customer_name,' : ''} b.branch_name, ty.type_name, a.balance, a.status
         FROM account a JOIN branch b ON b.ifsc_code = a.branch_ifsc JOIN account_type ty ON ty.type_id = a.type_id
         ${personal ? 'JOIN customer c ON c.cust_id = a.cust_id' : ''}
        WHERE ${where} ORDER BY a.balance DESC LIMIT ${top ? Math.min(Number(top[1]), 100) : 100}`, ...args);
    return { interpretation: `Showing ${bits.join(' ') || 'all'} accounts${top ? `, top ${top[1]} by balance` : ''}`,
      columns: ['acc_no', ...(personal ? ['customer_name'] : []), 'branch_name', 'type_name', 'balance', 'status'], money: ['balance'], rows };
  }

  throw bad('I can answer questions about accounts, transactions and branch deposits. For example: “frozen accounts”, “transfers above 10k this week” or “top 3 accounts by balance”.');
}
