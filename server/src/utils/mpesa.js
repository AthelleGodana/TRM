import { env } from '../config/env.js';

// Fetches an OAuth access token from the Daraja API.
// Requires MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET to be set.
export async function getMpesaAccessToken() {
  const { consumerKey, consumerSecret } = env.mpesa;
  if (!consumerKey || !consumerSecret) return null;

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const res = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const data = await res.json();
  return data.access_token;
}

// Initiates an STK Push (Lipa na M-Pesa Online). Falls back to a simulated
// response when Daraja credentials are not configured, so the rest of the
// payment flow can be built and tested without live credentials.
export async function initiateStkPush({ phoneNumber, amount }) {
  const { shortcode, passkey, callbackUrl } = env.mpesa;
  const token = await getMpesaAccessToken();

  if (!token || !shortcode || !passkey) {
    return {
      MerchantRequestID: `SIMULATED-${Date.now()}`,
      CheckoutRequestID: `SIMULATED-${Date.now()}`,
      ResponseCode: '0',
      ResponseDescription: 'Simulated STK push (Daraja credentials not configured).',
    };
  }

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const res = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: shortcode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: 'TMS',
      TransactionDesc: 'School transport payment',
    }),
  });

  return res.json();
}
