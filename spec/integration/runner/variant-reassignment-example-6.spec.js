import { expect } from 'chai'
import _ from 'lodash'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

const productTypeDraft2 = _.cloneDeep(require('../../resources/productType.json'))

/* eslint-disable max-len */
/**
 * +-----------------------------------------+--------------------------+--------------------+----------------------------------------------------------------+
 * | New product draft                       | CTP product              | After reassignment | CTP product                                                    |
 * +-----------------------------------------+--------------------------+                    +----------------------------------------------------------------+
 * | Product:                                | Product:                 |                    | Product:                                                       |
 * | slug: { en: "product", de: "produkte" } | id: "1"                  |                    | id: "1"                                                        |
 * | product-type: "pt1"                     | slug: { en: "product" }  |                    | slug: { en: "product" }                                        |
 * | variants: v1, v3                        | product-type: "pt1"      |                    | product-type: "pt1"                                            |
 * |                                         | variants: v1, v2         |                    | variants: v1, v3                                               |
 * +-----------------------------------------+--------------------------+                    +----------------------------------------------------------------+
 * |                                         | Product:                 |                    | Product:                                                       |
 * |                                         | id: "2"                  |                    | id: "2"                                                        |
 * |                                         | slug: { de: "produkte" } |                    | slug: { de: "produkte_${timestamp1}", _ctsd: "${timestamp1}" } |
 * |                                         | product-type: "pt2"      |                    | product-type: "pt2"                                            |
 * |                                         | variants: v3, v4         |                    | variants: v4                                                   |
 * +-----------------------------------------+--------------------------+--------------------+----------------------------------------------------------------+
 * |                                         |                          |                    | Product:                                                       |
 * |                                         |                          |                    | id: "3"                                                        |
 * |                                         |                          |                    | slug: { en: "product_${timestamp2}", _ctsd: "${timestamp2}" }  |
 * |                                         |                          |                    | product-type: "pt1"                                            |
 * |                                         |                          |                    | variants: v2                                                   |
 * +-----------------------------------------+--------------------------+--------------------+----------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe.skip('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2

  before(async () => {
    ctpClient = await utils.createClient()
    productTypeDraft2.name = 'product-type-2'
    const productType2 = await utils.ensureResource(ctpClient.productTypes,
      productTypeDraft2, 'name')

    const results = await utils.createCtpProducts([['1', '2'], ['3', '4']], ctpClient, (pD) => {
      if (pD.masterVariant.sku === '1')
        pD.slug.en = 'product'
      else if (pD.masterVariant.sku === '3') {
        pD.slug.de = 'produkte'
        pD.productType.id = productType2.id
      }
    })
    product1 = results.find(product => product.masterVariant.sku === '1')
    product2 = results.find(product => product.masterVariant.sku === '3')
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('merge products with duplicate slugs + remove variants v2 and v4', async () => {
    const reassignment = new VariantReassignment([], logger, {})
    const productDraft = {
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
    }
    await reassignment.execute([productDraft], [product1, product2])

    const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
    expect(results).to.have.lengthOf(3)
    const updatedProduct1 = results.find(product => product.masterVariant.sku === '1'
      || product.masterVariant.sku === '3')
    expect(updatedProduct1.variants).to.have.lengthOf(1)
    expect(updatedProduct1.id).to.equal(product1.id)
    expect(updatedProduct1.productType.id).to.equal(product1.productType.id)

    const updatedProduct2 = results.find(product => product.masterVariant.sku === '4')
    expect(updatedProduct2.variants).to.have.lengthOf(0)
    expect(updatedProduct2.slug._ctsd).to.be.a('string')
    expect(updatedProduct2.id).to.equal(product2.id)
    expect(updatedProduct2.productType.id).to.equal(product2.productType.id)

    const newProduct = results.find(product => product.masterVariant.sku === '2')
    expect(newProduct.variants).to.have.lengthOf(0)
    expect(newProduct.slug._ctsd).to.be.a('string')
    expect(newProduct.productType.id).to.be.a(product1.productType.id)
  })
})
