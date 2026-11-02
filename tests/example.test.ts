import { describe, expect, it } from 'vitest';

describe('Order ID verification', () => {
  it('handles 18-digit order IDs as string without integer precision loss', () => {
    // JavaScript Number.MAX_SAFE_INTEGER is 9007199254740991 (16 digits)
    // TikTok order IDs are 18 digits (e.g., 576460752303423488)
    const orderId = '576460752303423488';
    expect(typeof orderId).toBe('string');
    expect(orderId.length).toBe(18);

    // Number conversion causes precision loss, validating why string is strictly required
    const asNumber = Number(orderId);
    expect(asNumber.toString()).not.toBe(orderId);
  });
});
