import { expect } from 'chai'
import _ from 'lodash'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

const productTypeDraft2 = _.cloneDeep(require('../../resources/productType.json'))

/* eslint-disable max-len */
/**
 * +---------------------------------------------+---------------------------+--------------------+---------------------------------------------------------------+
 * | New product draft                           | CTP product               | After reassignment | CTP product                                                   |
 * +---------------------------------------------+---------------------------+                    +---------------------------------------------------------------+
 * | Product:                                    | Product:                  |                    | Product:                                                      |
 * | slug: { en: "product-1", de: "produkte-1" } | id: "1"                   |                    | id: "1"                                                       |
 * | product-type: "pt2"                         | slug: { en: "product-1" } |                    | slug: { en: "product-1" }                                     |
 * | variants: v1, v3                            | product-type: "pt2"       |                    | product-type: "pt2"                                           |
 * |                                             | variants: v1, v2          |                    | variants: v1, v3                                              |
 * +---------------------------------------------+---------------------------+                    +---------------------------------------------------------------+
 * |                                             | Product:                  |                    | Product:                                                      |
 * |                                             | id: "2"                   |                    | id: "3"                                                       |
 * |                                             | slug: { en: "product-2" } |                    | slug: { en: "product-1_${timestamp}", _ctsd: "${timestamp}" } |
 * |                                             | product-type: "pt1"       |                    | product-type: "pt2"                                           |
 * |                                             | variants: v3              |                    | variants: v2                                                  |
 * +---------------------------------------------+---------------------------+--------------------+---------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2
  let productType2

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1', '2'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)

    productTypeDraft2.name = 'product-type-2'
    productType2 = await utils.ensureResource(ctpClient.productTypes,
      productTypeDraft2)
    const productDraft2 = utils.generateProduct(['3'], productType2.id)
    product2 = await utils.ensureResource(ctpClient.products, productDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('removing variant v2 + moving variant v3 from a different productType + deleting product p2',
    async () => {
      const reassignment = new VariantReassignment([], logger, {})
      await reassignment.execute([{
        productType: {
          id: productType2.id
        },
        key: 'sample-product1',
        name: {
          en: 'Sample product1'
        },
        slug: {
          en: 'sample-product1'
        },
        masterVariant: {
          sku: '1',
          prices: []
        },
        variants: [
          {
            sku: '3',
            prices: []
          }
        ]
      }], [product1, product2])
      const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3'], ctpClient)
      expect(results).to.have.lengthOf(2)
      const updatedProduct = results.find(product => product.masterVariant.sku === '1')
      expect(updatedProduct).to.be.an('object')
      expect(updatedProduct.variants).to.have.lengthOf(1)

      const newProduct = results.find(product => product.masterVariant.sku === '2')
      expect(newProduct.productType.id).to.equal(updatedProduct.productType.id)
      expect(newProduct.variants).to.have.lengthOf(0)
    })
})
