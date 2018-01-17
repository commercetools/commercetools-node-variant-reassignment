import { expect } from 'chai'

import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../../lib/constants'

/* eslint-disable max-len */
/**
 * +------------------------------------+--------------------------------------------------+--------------------+--------------------------------------------------------------+
 * | Product draft                      | CTP product                                      | After reassignment | CTP product                                                  |
 * +------------------------------------+--------------------------------------------------+                    +--------------------------------------------------------------+
 * | Product:                           | Product:                                         |                    | Product:                                                     |
 * | slug: { en: "bike" }               | id: 1                                            |                    | id: 1                                                        |
 * | masterVariant: { sku: "red-bike" } | slug: { en: "bike" }                             |                    | slug: { en: "bike" }                                         |
 * | variants: []                       | masterVariant: { sku: "red-tshirt" }             |                    | masterVariant: { sku: "red-bike" }                           |
 * |                                    | variants: [                                      |                    | variants: []                                                 |
 * |                                    | { sku: "green-tshirt" },{ sku: "yellow-tshirt" } |                    |                                                              |
 * |                                    | ]                                                |                    |                                                              |
 * +------------------------------------+--------------------------------------------------+                    +--------------------------------------------------------------+
 * |                                    |                                                  |                    | Product:                                                     |
 * |                                    |                                                  |                    | id: 2                                                        |
 * |                                    |                                                  |                    | slug: { en: "bike-${timestamp}", ctsd: "${timestamp}" }      |
 * |                                    |                                                  |                    | masterVariant: { sku: "red-tshirt" }                         |
 * |                                    |                                                  |                    | variants: [{ sku: "green-tshirt" },{ sku: "yellow-tshirt" }] |
 * +------------------------------------+--------------------------------------------------+--------------------+--------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  let ctpClient
  let product1
  const logger = utils.createLogger(__filename)
  const product1Sku1 = 'red-tshirt'
  const product1Sku2 = 'green-tshirt'
  const product1Sku3 = 'blue-tshirt'
  const product1Slug = { en: 'bike' }

  before(async () => {
    ctpClient = await utils.createClient()
    const products = await utils.createCtpProducts([[product1Sku1, product1Sku2, product1Sku3]],
      ctpClient,
      (pD) => {
        pD.slug = product1Slug
      })
    product1 = products[0]
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('change SKU only', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger, {}, ['brandId'])
    const productDraftSku = 'red-bike'
    await reassignment.execute([{
      productType: {
        id: product1.productType.id
      },
      name: product1.name,
      slug: product1.slug,
      masterVariant: { sku: productDraftSku }
    }])

    const { body: { results } } = await utils.getProductsBySkus([product1Sku1, productDraftSku],
      ctpClient)
    expect(results).to.have.lengthOf(2)

    const anonymizedProduct = results.find(product =>
      [product.masterVariant.sku].concat(product.variants.map(v => v.sku)).includes(product1Sku1)
    )
    expect(anonymizedProduct.slug.en).to.be.a('string')
    expect(anonymizedProduct.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.a('string')
    expect(anonymizedProduct.variants.length).to.equal(2)
    const anonymizedProductVariants = [anonymizedProduct.masterVariant.sku]
      .concat(anonymizedProduct.variants.map(v => v.sku))
    expect(anonymizedProductVariants).to.include(product1Sku2)
    expect(anonymizedProductVariants).to.include(product1Sku3)

    const updatedProduct = results.find(product => product.masterVariant.sku === productDraftSku)
    expect(updatedProduct.variants).to.have.lengthOf(0)
  })
})
