import { expect } from 'chai'

import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../../lib/constants'

/* eslint-disable max-len */
/**
 +---------+----------------------------+---------------------------------------+--------------------+----------------------------+-------------------------------------------------------------+
 |         | Product draft              | CTP product                           | After reassignment | CTP product                | CTP product                                                 |
 +---------+----------------------------+---------------------------------------+                    +----------------------------+-------------------------------------------------------------+
 | Staged  | Product:                   | Product:                              |                    | Product:                   | Product:                                                    |
 |         | slug: { en: "product" }    | id: 1                                 |                    | id: 1                      | id: 2                                                       |
 |         | product-type: "pt2"        | slug: { en: "product" }               |                    | slug: { en: "product" }    | slug: { en: "product-${timestamp}", ctsd: "${timestamp}" }  |
 |         | masterVariant: { sku: v1 } | product-type: "pt2"                   |                    | product-type: "pt2"        | product-type: "pt2"                                         |
 |         |                            | masterVariant: { id: 1, sku: v1 }     |                    | masterVariant: { sku: v1 } | masterVariant: { sku: v2 }                                  |
 |         |                            | variants: [                           |                    |                            | variants: [                                                 |
 |         |                            | { id: 4, sku: v2 },{ id: 5, sku: v4 } |                    |                            | { sku: v3 }, { sku: v4 }                                    |
 |         |                            | ]                                     |                    |                            | ]                                                           |
 +---------+----------------------------+---------------------------------------+                    +----------------------------+-------------------------------------------------------------+
 | Current |                            | Product:                              |                    | Product:                   |                                                             |
 |         |                            | id: 1                                 |                    | id: 1                      |                                                             |
 |         |                            | slug: { en: "product" }               |                    | slug: { en: "product" }    |                                                             |
 |         |                            | product-type: "pt2"                   |                    | product-type: "pt2"        |                                                             |
 |         |                            | masterVariant: { id: 1, sku: v1}      |                    | masterVariant: { sku: v1 } |                                                             |
 |         |                            | variants: [                           |                    |                            |                                                             |
 |         |                            | { id: 2, sku: v2 },{ id: 3, sku: v3 } |                    |                            |                                                             |
 |         |                            | ]                                     |                    |                            |                                                             |
 +---------+----------------------------+---------------------------------------+--------------------+----------------------------+-------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1

  before(async () => {
    ctpClient = await utils.createClient()

    const results = await utils.createCtpProducts([['1', '2', '3']], ctpClient)
    product1 = results[0]
    let response = await ctpClient.products
      .byId(product1.id)
      .update({
        version: product1.version,
        actions: [{ action: 'publish' }]
      })
    response = await ctpClient.products
      .byId(product1.id)
      .update({
        version: response.body.version,
        actions: [
          { action: 'removeVariant', id: product1.variants[0].id },
          { action: 'removeVariant', id: product1.variants[1].id }
        ]
      })
    await ctpClient.products.byId(product1.id).update({
      version: response.body.version,
      actions: [
        { action: 'addVariant', sku: product1.variants[0].sku },
        { action: 'addVariant', sku: '4' }
      ]
    })
  })

  after(async () => {
    await utils.unpublishAllProducts(ctpClient, logger)
    await utils.deleteResourcesAll(ctpClient, logger)
  })

  it('different product versions on staged and current', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger)
    await reassignment.execute([{
      productType: product1.productType,
      name: product1.name,
      slug: product1.slug,
      masterVariant: product1.masterVariant
    }], [product1])
    const { body: product } = await ctpClient.products.byId(product1.id).fetch()
    expect(product.masterData.current.masterVariant.sku).to.equal('1')
    expect(product.masterData.current.variants.length).to.equal(0)
    expect(product.masterData.staged.masterVariant.sku).to.equal('1')
    expect(product.masterData.staged.variants.length).to.equal(0)
    const { body: { results } } = await utils.getProductsBySkus(['2', '3', '4'], ctpClient)
    expect(results).to.have.lengthOf(1)
    const updatedProductProjection = results[0]
    expect(updatedProductProjection.masterVariant.sku).to.equal('2')
    expect(updatedProductProjection.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.a('string')
  })
})
