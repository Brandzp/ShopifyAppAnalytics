import { getStoredShopifyCredentials } from '../lib/services/shopify-connection-service.ts';
import { createShopifyClient } from '../lib/shopify/client.ts';
import { DISCOUNT_CODE_BASIC_CREATE_MUTATION } from '../lib/shopify/queries/discounts.ts';

const storeId = 'cmojkfeyn0020nb1wzpx623q9';
const credentials = await getStoredShopifyCredentials(storeId);
const client = createShopifyClient({ ...credentials, apiVersion: '2026-01' });
const code = `CODEX-VERIFY-${Date.now()}`;

const createResult = await client.request(DISCOUNT_CODE_BASIC_CREATE_MUTATION, {
  basicCodeDiscount: {
    title: code,
    code,
    startsAt: new Date().toISOString(),
    appliesOncePerCustomer: true,
    usageLimit: 1,
    combinesWith: {
      productDiscounts: false,
      orderDiscounts: false,
      shippingDiscounts: false
    },
    context: {
      all: 'ALL'
    },
    customerGets: {
      value: { percentage: 0.15 },
      items: { all: true },
      appliesOnOneTimePurchase: true,
      appliesOnSubscription: false
    }
  }
});

const discountId = createResult.discountCodeBasicCreate.codeDiscountNode?.id;
let deleteResult = null;
if (discountId) {
  deleteResult = await client.request(`mutation DeleteDiscountCode($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { message } } }`, { id: discountId });
}

console.log(JSON.stringify({ code, discountId, deleteResult }, null, 2));
