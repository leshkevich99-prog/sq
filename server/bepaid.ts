import crypto from 'node:crypto';

/**
 * Helper to interact with bePaid REST API (Checkouts & Transactions)
 */
export class BePaidAPI {
  private static SHOP_ID = process.env.BEPAID_SHOP_ID;
  private static SECRET_KEY = process.env.BEPAID_SECRET_KEY;

  private static getAuthHeader() {
    if (!this.SHOP_ID || !this.SECRET_KEY) {
      throw new Error('BEPAID_SHOP_ID or BEPAID_SECRET_KEY not set');
    }
    return 'Basic ' + Buffer.from(`${this.SHOP_ID}:${this.SECRET_KEY}`).toString('base64');
  }

  /**
   * Creates a checkout session specifically for ERIP
   */
  static async createEripCheckout(amount: number, userId: string, description: string = 'Пополнение счета Squadra') {
    const url = 'https://checkout.bepaid.by/checkouts';
    
    // bePaid expects amount in smallest units (kopeks)
    const amountInKopeks = Math.round(amount * 100);

    const payload = {
      checkout: {
        transaction_type: 'payment',
        order: {
          amount: amountInKopeks,
          currency: 'BYN',
          description: description,
          tracking_id: `erip_${userId}_${Date.now()}`
        },
        settings: {
          success_url: `${process.env.SQUADRA_URL}/finances?status=success`,
          decline_url: `${process.env.SQUADRA_URL}/finances?status=fail`,
          fail_url: `${process.env.SQUADRA_URL}/finances?status=error`,
          notification_url: `${process.env.SQUADRA_URL}/api/payments/bepaid/webhook`,
          language: 'ru'
        },
        payment_method: {
          types: ['erip'],
          erip: {
            account_number: userId.substring(0, 8).toUpperCase(), // Customer account in ERIP
            service_no: '999', // Placeholder service number (will be replaced by actual one in Live)
            service_info: ['Оплата услуг Squadra Client', `ID: ${userId}`]
          }
        },
        customer: {
            user_id: userId
        }
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[BePaidAPI] Checkout error:', errorData);
        throw new Error(errorData.message || 'Failed to create bePaid checkout');
      }

      const data: any = await response.json();
      return data.checkout;
    } catch (error: any) {
      console.error('[BePaidAPI] Network error:', error.message);
      throw error;
    }
  }

  /**
   * Creates a checkout session for Credit Card
   */
  static async createCardCheckout(amount: number, userId: string, description: string = 'Пополнение счета Squadra') {
    const url = 'https://checkout.bepaid.by/checkouts';
    const amountInKopeks = Math.round(amount * 100);

    const payload = {
      checkout: {
        transaction_type: 'payment',
        order: {
          amount: amountInKopeks,
          currency: 'BYN',
          description: description,
          tracking_id: `cc_${userId}_${Date.now()}`
        },
        settings: {
          success_url: `${process.env.SQUADRA_URL}/finances?status=success`,
          decline_url: `${process.env.SQUADRA_URL}/finances?status=fail`,
          fail_url: `${process.env.SQUADRA_URL}/finances?status=error`,
          notification_url: `${process.env.SQUADRA_URL}/api/payments/bepaid/webhook`,
          language: 'ru'
        },
        payment_method: {
          types: ['card']
        },
        customer: {
          user_id: userId
        }
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[BePaidAPI] Card Checkout error:', errorData);
        throw new Error(errorData.message || 'Failed to create bePaid card checkout');
      }

      const data: any = await response.json();
      return data.checkout;
    } catch (error: any) {
      console.error('[BePaidAPI] Card Network error:', error.message);
      throw error;
    }
  }

  /**
   * Verifies the authenticity of a bePaid webhook
   */
  static verifyWebhook(headers: any, bodyPath: string) {
    // bePaid usually sends Basic Auth header in callbacks
    // or you can verify the signature if using a specific key.
    // Basic Auth verification:
    const auth = headers.authorization;
    if (!auth) return false;

    const expectedAuth = this.getAuthHeader();
    return auth === expectedAuth;
  }
}
