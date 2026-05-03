import { getStoredShopifyCredentials } from '../lib/services/shopify-connection-service.ts';
import { createShopifyClient } from '../lib/shopify/client.ts';

const storeId = 'cmojkfeyn0020nb1wzpx623q9';
const query = '{ mutationRoot: __type(name:"Mutation") { fields(includeDeprecated: true) { name args { name type { kind name ofType { kind name ofType { kind name } } } } } } }';
const credentials = await getStoredShopifyCredentials(storeId);
const client = createShopifyClient({ ...credentials, apiVersion: '2026-01' });
const result = await client.request(query, {});
const wanted = result.mutationRoot.fields.filter((field) => field.name === 'discountCodeDelete' || field.name === 'discountCodeBasicCreate');
console.log(JSON.stringify(wanted, null, 2));
