import { getStoredShopifyCredentials } from '../lib/services/shopify-connection-service.ts';
import { createShopifyClient } from '../lib/shopify/client.ts';

const storeId = 'cmojkfeyn0020nb1wzpx623q9';
const query = '{ payload: __type(name:"DiscountCodeDeletePayload") { fields { name } } }';
const credentials = await getStoredShopifyCredentials(storeId);
const client = createShopifyClient({ ...credentials, apiVersion: '2026-01' });
const result = await client.request(query, {});
console.log(JSON.stringify(result, null, 2));
