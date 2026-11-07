const baseCard = () => ({
  type: 'CARD',
  parameters: {
    allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
    allowedCardNetworks: ['AMEX', 'DISCOVER', 'MASTERCARD', 'VISA']
  }
});
export function createReadinessRequest() {
  return { apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods: [baseCard()] };
}
export function createPaymentRequest() {
  return {
    apiVersion: 2, apiVersionMinor: 0,
    allowedPaymentMethods: [{ ...baseCard(), tokenizationSpecification: { type: 'PAYMENT_GATEWAY', parameters: { gateway: 'example', gatewayMerchantId: 'exampleGatewayMerchantId' } } }],
    transactionInfo: { totalPriceStatus: 'FINAL', totalPrice: '19.99', currencyCode: 'USD', countryCode: 'US' },
    merchantInfo: { merchantName: 'Banking project demo' }
  };
}
export async function runTestCheckout(client) {
  await client.loadPaymentData(createPaymentRequest());
  return { completed: true };
}
let loadPromise;
export function loadGooglePay() {
  if (window.google?.payments?.api?.PaymentsClient) return Promise.resolve(window.google.payments.api);
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://pay.google.com/gp/p/js/pay.js';
      script.async = true;
      script.onload = () => window.google?.payments?.api?.PaymentsClient ? resolve(window.google.payments.api) : reject(new Error('Google Pay did not load.'));
      script.onerror = () => { script.remove(); reject(new Error('Could not load Google Pay. Check your connection or browser settings.')); };
      document.head.appendChild(script);
    }).catch(error => { loadPromise = undefined; throw error; });
  }
  return loadPromise;
}
