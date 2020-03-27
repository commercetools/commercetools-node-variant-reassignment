import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../../lib/constants'

/* eslint-disable max-len */
/**
 +-------------------------------------------------+---------------------------+--------------------+---------------------------------------------------------------+
 | New product draft                               | CTP product               | After reassignment | CTP product                                                   |
 +-------------------------------------------------+---------------------------+                    +---------------------------------------------------------------+
 | Product:                                        | Product:                  |                    | Product:                                                      |
 | slug: { en: "product-xxx", de: "produkte-xxx" } | id: "1"                   |                    | id: "1"                                                       |
 | product-type: "pt2"                             | slug: { en: "product-1" } |                    | slug: { en: "product-1" }                                     |
 | masterVariant: v1                               | product-type: "pt2"       |                    | product-type: "pt2"                                           |
 | variants: v3                                    | masterVariant: v1         |                    | masterVariant: v1                                             |
 |                                                 | variants: v2              |                    | variants: v3                                                  |
 +-------------------------------------------------+---------------------------+                    +---------------------------------------------------------------+
 |                                                 | Product:                  |                    | Product:                                                      |
 |                                                 | id: "2"                   |                    | id: "2"                                                       |
 |                                                 | slug: { en: "product-2" } |                    | slug: { en: "product-2" }                                     |
 |                                                 | product-type: "pt2"       |                    | product-type: "pt2"                                           |
 |                                                 | masterVariant: v3         |                    | variants: v4                                                  |
 |                                                 | variants: v4              |                    |                                                               |
 +-------------------------------------------------+---------------------------+                    +---------------------------------------------------------------+
 |                                                 |                           |                    | Product:                                                      |
 |                                                 |                           |                    | id: "3"                                                       |
 |                                                 |                           |                    | slug: { en: "product-1_${timestamp}", ctsd: "${timestamp}" }  |
 |                                                 |                           |                    | product-type: "pt2"                                           |
 |                                                 |                           |                    | masterVariant: v2                                             |
 +-------------------------------------------------+---------------------------+--------------------+---------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment - creating new product, promoting masterVariant', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2

  before(async () => {
    ctpClient = await utils.createClient()

    const results = await utils.createCtpProducts([['1', '2'], ['3', '4']], ctpClient)
    product1 = results.find(product => product.masterVariant.sku === '1')
    product2 = results.find(product => product.masterVariant.sku === '3')
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('create new product p3 + move variants v1 and v3 + promote variants as masterVariants',
    async () => {
      const reassignment = new VariantReassignment(ctpClient, logger)
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
      const { statistics } = await reassignment.execute([productDraft])

      utils.expectStatistics(statistics, 0, 0, 1, 1)
      const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
      expect(results).to.have.lengthOf(3)
      const updatedProduct1 = results.find(product => product.masterVariant.sku === '1')
      expect(updatedProduct1.variants).to.have.lengthOf(1)
      expect(updatedProduct1.variants[0].sku).to.equal('3')
      expect(updatedProduct1.id).to.equal(product1.id)
      expect(updatedProduct1.slug).to.deep.equal(productDraft.slug)

      const updatedProduct2 = results.find(product => product.masterVariant.sku === '4')
      expect(updatedProduct2.variants).to.have.lengthOf(0)
      expect(updatedProduct2.id).to.equal(product2.id)

      const newProduct3 = results.find(product => product.masterVariant.sku === '2')
      expect(newProduct3.variants).to.have.lengthOf(0)
      expect(newProduct3.slug).to.deep.equal(product1.slug)
    })
})
