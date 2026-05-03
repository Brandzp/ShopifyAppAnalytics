import { getStoredShopifyCredentials } from '../lib/services/shopify-connection-service.ts';
import { createShopifyClient } from '../lib/shopify/client.ts';

const storeId = 'cmojkfeyn0020nb1wzpx623q9';
const query = '{ collections(first: 5) { nodes { id title } } segments(first: 5, query: "") { nodes { id name } } }';
const credentials = await getStoredShopifyCredentials(storeId);
const client = createShopifyClient({ ...credentials, apiVersion: '2026-01' });
const result = await client.request(query, {});
console.log(JSON.stringify(result, null, 2));
