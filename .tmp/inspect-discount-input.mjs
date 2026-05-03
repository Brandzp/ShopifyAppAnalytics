import { getStoredShopifyCredentials } from '../lib/services/shopify-connection-service.ts';
import { createShopifyClient } from '../lib/shopify/client.ts';

const storeId = 'cmojkfeyn0020nb1wzpx623q9';
const query = '{ discountCodeBasicInput: __type(name:"DiscountCodeBasicInput") { inputFields { name } } discountItemsInput: __type(name:"DiscountItemsInput") { inputFields { name } } discountMinimumRequirementInput: __type(name:"DiscountMinimumRequirementInput") { inputFields { name } } discountCombinesWithInput: __type(name:"DiscountCombinesWithInput") { inputFields { name } } discountCustomerSelectionInput: __type(name:"DiscountCustomerSelectionInput") { inputFields { name } } discountCustomerGetsInput: __type(name:"DiscountCustomerGetsInput") { inputFields { name } } }';

const credentials = await getStoredShopifyCredentials(storeId);
const client = createShopifyClient(credentials);
const result = await client.request(query, {});
console.log(JSON.stringify(result, null, 2));
