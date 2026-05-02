export const ORDERS_QUERY = /* GraphQL */ `
  query OrdersPage($cursor: String, $query: String) {
    orders(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: true, query: $query) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          updatedAt
          processedAt
          currencyCode
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          displayFinancialStatus
          displayFulfillmentStatus
          sourceName
          customer {
            id
          }
          discountApplications(first: 20) {
            edges {
              node {
                __typename
                ... on DiscountCodeApplication {
                  code
                }
                ... on ManualDiscountApplication {
                  title
                }
              }
            }
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                  }
                }
                product {
                  id
                }
                variant {
                  id
                }
              }
            }
          }
          refunds(first: 20) {
            id
            createdAt
            refundLineItems(first: 50) {
              edges {
                node {
                  quantity
                  subtotalSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
