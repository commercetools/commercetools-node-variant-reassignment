import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 * +-------------------------------------------------+---------------------------+--------------------+-------------------------------------------------+
 * | New product draft                               | CTP product               | After reassignment | CTP product                                     |
 * +-------------------------------------------------+---------------------------+                    +-------------------------------------------------+
 * | Product:                                        | Product:                  |                    | Product:                                        |
 * | slug: { en: "product-xxx", de: "produkte-xxx" } | id: "1"                   |                    | id: "1"                                         |
 * | product-type: "pt2"                             | slug: { en: "product-1" } |                    | slug: { en: "product-1" }                       |
 * | variants: v1, v3                                | product-type: "pt2"       |                    | product-type: "pt2"                             |
 * |                                                 | variants: v1, v2          |                    | variants: v2                                    |
 * +-------------------------------------------------+---------------------------+                    +-------------------------------------------------+
 * |                                                 | Product:                  |                    | Product:                                        |
 * |                                                 | id: "2"                   |                    | id: "2"                                         |
 * |                                                 | slug: { en: "product-2" } |                    | slug: { en: "product-2" }                       |
 * |                                                 | product-type: "pt2"       |                    | product-type: "pt2"                             |
 * |                                                 | variants: v3, v4          |                    | variants: v4                                    |
 * +-------------------------------------------------+---------------------------+--------------------+-------------------------------------------------+
 * |                                                 |                           |                    | Product:                                        |
 * |                                                 |                           |                    | id: "3"                                         |
 * |                                                 |                           |                    | slug: { en: "product-xxx", de: "produkte-xxx" } |
 * |                                                 |                           |                    | product-type: "pt2"                             |
 * |                                                 |                           |                    | variants: v1, v3                                |
 * +-------------------------------------------------+---------------------------+--------------------+-------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)

    const productDraft2 = utils.generateProduct(['3', '4'], productType.id)
    product2 = await utils.ensureResource(ctpClient.products, productDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('create new product p3 + move variants v1 and v3 + promote variants as masterVariants',
    async () => {
      const reassignment = new VariantReassignment([], logger, {})
      const productDraft = {
        productType: {
          id: product1.productType.id
        },
        name: {
          en: 'Sample product1'
        },
        slug: {
          en: 'product-xxx'
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
      const updatedProduct1 = results.find(product => product.masterVariant.sku === '2')
      const updatedProduct2 = results.find(product => product.masterVariant.sku === '4')
      const newProduct3 = results.find(product => product.masterVariant.sku === '1'
        || product.masterVariant.sku === '3')
      expect(updatedProduct1.variants).to.have.lengthOf(0)
      expect(updatedProduct1.id).to.equal(product1.id)

      expect(updatedProduct2.variants).to.have.lengthOf(0)
      expect(updatedProduct2.id).to.equal(product2.id)

      expect(newProduct3.variants).to.have.lengthOf(1)
      expect(newProduct3.slug.en).to.equal(productDraft.slug.en)
    })
})
