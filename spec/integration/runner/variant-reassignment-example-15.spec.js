import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../../lib/constants'

/* eslint-disable max-len */
/**
 +---------+----------------------------+----------------------------+--------------------+----------------------------+------------------------------------------------------------+
 |         |        Product draft       |         CTP product        | After reassignment |         CTP product        |                         CTP product                        |
 +---------+----------------------------+----------------------------+                    +----------------------------+------------------------------------------------------------+
 | Staged  | Product:                   | Product:                   |                    | Product:                   | Product:id: 2                                              |
 |         | slug: { en: "product" }    | id: 1                      |                    | id: 1                      | slug: { en: "product-${timestamp}", ctsd: "${timestamp} }  |
 |         | product-type: "pt2"        | slug: { en: "product" }    |                    | slug: { en: "product" }    | product-type: "pt2"                                        |
 |         | masterVariant: { sku: v1 } | product-type: "pt2"        |                    | product-type: "pt2"        | masterVariant: { sku: v5 }                                 |
 |         |                            | masterVariant: { sku: v1 } |                    | masterVariant: { sku: v1 } |                                                            |
 +---------+----------------------------+----------------------------+                    +----------------------------+------------------------------------------------------------+
 | Current |                            | Product:                   |                    | Product:                   |                                                            |
 |         |                            | id: 1                      |                    | id: 1                      |                                                            |
 |         |                            | slug: { en: "product" }    |                    | slug: { en: "product" }    |                                                            |
 |         |                            | product-type: "pt2"        |                    | product-type: "pt2"        |                                                            |
 |         |                            | masterVariant: { sku: v5 } |                    | masterVariant: { sku: v1 } |                                                            |
 +---------+----------------------------+----------------------------+--------------------+----------------------------+------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment - different variant info on staged and current', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1

  before(async () => {
    ctpClient = await utils.createClient()

    let product1Response = await utils.createCtpProducts([['5']], ctpClient)
    product1 = product1Response[0]
    product1Response = await ctpClient.products
      .byId(product1.id)
      .update({
        version: product1.version,
        actions: [{ action: 'publish' }]
      })

    await ctpClient.products
      .byId(product1.id)
      .update({
        version: product1Response.body.version,
        actions: [
          {
            action: 'addVariant',
            sku: '1'
          },
          {
            action: 'changeMasterVariant',
            sku: '1'
          },
          {
            action: 'removeVariant',
            sku: '5'
          }
        ]
      })
  })

  after(async () => {
    await utils.unpublishAllProducts(ctpClient, logger)
    await utils.deleteResourcesAll(ctpClient, logger)
  })

  it('different variants in staged and current for one product', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger)
    const { statistics } = await reassignment.execute([{
      productType: product1.productType,
      name: product1.name,
      slug: product1.slug,
      masterVariant: {
        sku: '1'
      },
      variants: []
    }])

    utils.expectStatistics(statistics, 1, 0, 1, 1)
    const { body: product1After } = await ctpClient.products.byId(product1.id).fetch()
    expect(product1After.masterData.staged.masterVariant.sku).to.equal('1')
    expect(product1After.masterData.staged.variants.length).to.equal(0)
    expect(product1After.masterData.current.masterVariant.sku).to.equal('1')
    expect(product1After.masterData.current.variants.length).to.equal(0)
    expect(product1After.masterData.published).to.equal(false)

    const { body: { results: [backupProduct] } } = await utils.getProductsBySkus(['5'], ctpClient)
    expect(backupProduct.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.a('string')
    expect(backupProduct.variants.length).to.equal(0)
    expect(backupProduct.published).to.equal(false)
  })
})
