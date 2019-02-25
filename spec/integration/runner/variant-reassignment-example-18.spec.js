import { expect } from 'chai'
import sinon from 'sinon'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 * +------------------------------------+--------------------------------------------------+--------------------+--------------------------------------------------------------+
 * | Product draft                      | CTP product                                      | After reassignment | CTP product                                                  |
 * +------------------------------------+--------------------------------------------------+                    +--------------------------------------------------------------+
 * | Product:                           | Product:                                         | product SLUG was   | Product:                                                     |
 * | slug: { en: "bike" }               | id: 1                                            | changed during     | id: 1                                                        |
 * | masterVariant: { sku: "red-bike" } | slug: { en: "bike" }                             | reassignment       | slug: { en: "ball" }                                         |
 * | variants: []                       | masterVariant: { sku: "red-tshirt" }             |                    | masterVariant: { sku: "blue-tshirt" }                        |
 * |                                    | variants: []                                     |                    | variants: []                                                 |
 * +------------------------------------+--------------------------------------------------+--------------------+--------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment - concurrent modification on ctpProductToUpdate', () => {
  let ctpClient
  let product
  const logger = utils.createLogger(__filename)
  const productSku = 'red-tshirt'
  const productSlug = { en: 'bike' }
  const productSlug2 = { en: 'tshirt' }

  before(async () => {
    ctpClient = await utils.createClient()
    const products = await utils.createCtpProducts([[productSku]],
      ctpClient,
      (pD) => {
        pD.slug = productSlug
      })
    product = products[0]
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('handle no matching products', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger)
    const productDraftSku = 'red-bike'

    // before executing actions update CTP product
    const executeActionsStub = sinon.stub(reassignment, '_createAndExecuteActions')
      .callsFake(async (...args) => {
        await ctpClient.products
          .byId(product.id)
          .update({
            version: product.version,
            actions: [{
              action: 'changeSlug',
              slug: productSlug2
            }]
          })

        return executeActionsStub.wrappedMethod.call(reassignment, ...args)
      })

    const { statistics } = await reassignment.execute([{
      productType: {
        id: product.productType.id
      },
      name: product.name,
      slug: product.slug,
      masterVariant: { sku: productDraftSku }
    }])

    utils.expectStatistics(statistics, 0, 0, 1, 1, 1, 0) // 1 processed, 1 success, 1 retries

    const { body: { results } } = await utils.getProductsBySkus([productSku, productDraftSku],
      ctpClient)

    expect(results).to.have.lengthOf(1)
    expect(results[0].masterVariant.sku).to.equal(productSku) // red-tshirt
    expect(results[0].slug).to.deep.equal(productSlug2)       // tshirt
  })
})
