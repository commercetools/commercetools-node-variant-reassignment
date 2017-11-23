import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 * +-------------------------+---------------------------------------------------------------+--------------------+---------------------------------------------------------------+
 * | New product draft       | CTP product                                                   | After reassignment | CTP product                                                   |
 * +-------------------------+---------------------------------------------------------------+                    +---------------------------------------------------------------+
 * | Product:                | Product:                                                      |                    | Product:                                                      |
 * | slug: { en: "product" } | id: "1"                                                       |                    | id: "1"                                                       |
 * | product-type: "pt1"     | slug: { en: "product_${timestamp1}", _ctsd: "${timestamp1}" } |                    | slug: { en: "product_${timestamp1}", _ctsd: "${timestamp1}" } |
 * | masterVariant: v1       | product-type: "pt1"                                           |                    | product-type: "pt1"                                           |
 * |                         | masterVariant: v1                                             |                    | masterVariant: v1                                             |
 * |                         | variant: v2                                                   |                    |                                                               |
 * +-------------------------+---------------------------------------------------------------+                    +---------------------------------------------------------------+
 * |                         |                                                               |                    | Product:                                                      |
 * |                         |                                                               |                    | id: "2"                                                       |
 * |                         |                                                               |                    | slug: { en: "product_${timestamp2}", _ctsd: "${timestamp2}" } |
 * |                         |                                                               |                    | product-type: "pt1"                                           |
 * |                         |                                                               |                    | masterVariant: v2                                             |
 * +-------------------------+---------------------------------------------------------------+--------------------+---------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('change backup variant to valid variant', async () => {
    const reassignment = new VariantReassignment([], logger, {})
    await reassignment.execute([{
      productType: {
        id: product1.productType.id
      },
      name: {
        en: 'Sample product1'
      },
      slug: {
        en: 'product',
        de: 'produkte'
      },
      masterVariant: {
        sku: '1'
      },
      variants: []
    }], [product1])

    const { body: { results } } = await utils.getProductsBySkus(['1', '2'], ctpClient)
    expect(results).to.have.lengthOf(2)
    const updatedProduct1 = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct1.variants).to.have.lengthOf(0)
    const updatedProduct2 = results.find(product => product.masterVariant.sku === '2')
    expect(updatedProduct2.variants).to.have.lengthOf(0)
  })
})
