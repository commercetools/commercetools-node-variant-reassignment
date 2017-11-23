import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 * +-----------------------------------------+--------------------------+--------------------+--------------------------------------------------------------+
 * | New product draft                       | CTP product              | After reassignment | CTP product                                                  |
 * +-----------------------------------------+--------------------------+                    +--------------------------------------------------------------+
 * | Product:                                | Product:                 |                    | Product:                                                     |
 * | slug: { en: "product", de: "produkte" } | id: "1"                  |                    | id: "1"                                                      |
 * | product-type: "pt1"                     | slug: { en: "product" }  |                    | slug: { en: "product" }                                      |
 * | masterVariant: v1                       | product-type: "pt1"      |                    | product-type: "pt1"                                          |
 * | variants: v3                            | masterVariant: v1        |                    | masterVariant: v1                                            |
 * |                                         | variants: v2             |                    | variants: v3                                                 |
 * +-----------------------------------------+--------------------------+                    +--------------------------------------------------------------+
 * |                                         | Product:                 |                    | Product:                                                     |
 * |                                         | id: "2"                  |                    | id: "2"                                                      |
 * |                                         | slug: { de: "produkte" } |                    | slug: { de: "produkte_${timestamp}", _ctsd: "${timestamp}" } |
 * |                                         | product-type: "pt1"      |                    | product-type: "pt1"                                          |
 * |                                         | masterVariant: v3        |                    | masterVariant: v4                                            |
 * |                                         | variants: v4             |                    |                                                              |
 * +-----------------------------------------+--------------------------+--------------------+--------------------------------------------------------------+
 * |                                         |                          |                    | Product:                                                     |
 * |                                         |                          |                    | id: "3"                                                      |
 * |                                         |                          |                    | slug: { en: "produkte_${timestamp}", _ctsd: "${timestamp}" } |
 * |                                         |                          |                    | product-type: "pt1"                                          |
 * |                                         |                          |                    | variants: v2                                                 |
 * +-----------------------------------------+--------------------------+--------------------+--------------------------------------------------------------+
 */
/* eslint-enable max-len */
// TODO: this test is similar to Example 6, check if we can remove this class
describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2'], productType.id)
    productDraft1.slug.en = 'product'
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)

    const productDraft2 = utils.generateProduct(['3', '4'], productType.id)
    productDraft2.slug.de = 'produkte'
    product2 = await utils.ensureResource(ctpClient.products, productDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('merge variants v1 and v3 + remove variants v2 and v4', async () => {
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
      variants: [
        {
          sku: '3'
        }
      ]
    }], [product1, product2])

    const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
    expect(results).to.have.lengthOf(3)
    const updatedProduct1 = results.find(product => product.masterVariant.sku === '1'
      || product.masterVariant.sku === '3')
    expect(updatedProduct1.variants).to.have.lengthOf(1)
    expect(updatedProduct1.id).to.equal(product1.id)
    expect(updatedProduct1.slug.de).to.be.an('object')

    const updatedProduct2 = results.find(product => product.masterVariant.sku === '4')
    expect(updatedProduct2.variants).to.have.lengthOf(0)
    expect(updatedProduct2.slug._ctsd).to.be.a('string')
    expect(updatedProduct2.id).to.equal(product2.id)

    const newProduct = results.find(product => product.masterVariant.sku === '2')
    expect(newProduct.variants).to.have.lengthOf(0)
    expect(newProduct.slug._ctsd).to.be.a('string')
  })
})
