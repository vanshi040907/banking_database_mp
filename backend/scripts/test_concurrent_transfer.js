
const url = 'http://localhost:5001/api/customer/transfers';

const token = process.env.TEST_CUSTOMER_JWT;

if (!token) {
  throw new Error('Set TEST_CUSTOMER_JWT first');
}

const body = {
  fromAccNo: '1000000001',
  toAccNo: '1000000002',
  amount: '10.00',
  remarks: 'Test 8 - simultaneous requests',
  transactionPin: process.env.TEST_TRANSACTION_PIN,
  idempotencyKey: crypto.randomUUID()
};

async function sendTransfer() {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    data: await response.json()
  };
}

const results = await Promise.all([
  sendTransfer(),
  sendTransfer()
]);

console.log(JSON.stringify(results, null, 2));
