import { expect } from 'chai'

import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../../lib/constants'

/* eslint-disable max-len */
/**
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 * | Product draft                      | CTP product                          | After reassignment | CTP product                                                |
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 * | Product:                           | Product:                             |                    | Product:                                                   |
 * | slug: { en: "bike" }               | id: 1                                |                    | id: 2                                                      |
 * | masterVariant: { sku: "red-bike" } | slug: { en: "bike" }                 |                    | slug: { en: "tshirt" }                                     |
 * |                                    | masterVariant: { sku: "red-tshirt" } |                    | masterVariant: { sku: "red-bike" }                         |
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 * |                                    | Product:                             |                    | Product:                                                   |
 * |                                    | id: 2                                |                    | id: 1                                                      |
 * |                                    | slug: { en: "tshirt" }               |                    | slug: { en: "bike-${timestamp}", ctsd: "${timestamp}" }    |
 * |                                    | masterVariant: { sku: "red-bike" }   |                    | masterVariant: { sku: "red-tshirt" }                       |
 * +------------------------------------+--------------------------------------+--------------------+------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  let ctpClient
  let product1
  let product2
  const logger = utils.createLogger(__filename)
  const product1Sku = 'red-tshirt'
  const product2Sku = 'red-bike'

  before(async () => {
    ctpClient = await utils.createClient()
    const products = await utils.createCtpProducts([[product1Sku], [product2Sku]], ctpClient,
      (pD) => {
        if (pD.masterVariant.sku === product1Sku)
          pD.slug = { en: 'bike' }
        else
          pD.slug = { en: 'tshirt' }
      })
    product1 = products.find(product => product.masterVariant.sku === product1Sku)
    product2 = products.find(product => product.masterVariant.sku === product2Sku)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('only anonymize product', async () => {
    const testStartTstp = new Date()
    const reassignment = new VariantReassignment(ctpClient, logger, {}, ['brandId'])
    await reassignment.execute([{
      productType: {
        id: product1.productType.id
      },
      name: product1.name,
      slug: product1.slug,
      masterVariant: product2.masterVariant
    }], [product2])
    const { body: { results } } = await utils.getProductsBySkus([product1Sku, product2Sku],
      ctpClient)
    expect(results).to.have.lengthOf(2)
    const notUpdatedProduct = results.find(product => product.masterVariant.sku === product2Sku)
    expect(new Date(notUpdatedProduct.lastModifiedAt)).to.be.below(testStartTstp)
    const anonymizedProduct = results.find(product => product.masterVariant.sku === product1Sku)
    expect(anonymizedProduct.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.a('string')
    expect(anonymizedProduct.masterVariant.sku).to.equal(product1Sku)
  })
})
