import { expect } from 'chai'
import _ from 'lodash'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

const productTypeDraft2 = _.cloneDeep(require('../../resources/productType.json'))

/* eslint-disable max-len */
/**
 * +---------------------------+----------------------------+--------------------+----------------------------+
 * | Product draft             | CTP product                | After reassignment | CTP product                |
 * +---------------------------+----------------------------+--------------------+----------------------------+
 * | Product:                  | Product:                   |                    | Product:                   |
 * | slug: { en: "product" }   | id: 1                      |                    | id: 2                      |
 * | product-type: "pt2"       | slug: { en: "product" }    |                    | slug: { en: "product" }    |
 * | masterVariant: { sku: v1} | product-type: "pt1"        |                    | product-type: "pt2"        |
 * |                           | masterVariant: { sku: v1 } |                    | masterVariant: { sku: v1 } |
 * +---------------------------+----------------------------+--------------------+----------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product
  let productType2

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1'], productType.id)
    productDraft1.masterVariant.attributes = [{ name: 'brandId', value: '2' }]
    product = await utils.ensureResource(ctpClient.products, productDraft1)

    productTypeDraft2.name = 'product-type-2'
    productType2 = await utils.ensureResource(ctpClient.productTypes,
      productTypeDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('product type changes', async () => {
    const reassignment = new VariantReassignment([], logger, {})
    await reassignment.execute([{
      productType: {
        id: productType2.id
      },
      name: {
        en: 'Sample product1'
      },
      slug: {
        en: 'product'
      },
      masterVariant: {
        sku: '1'
      },
      variants: []
    }], [product])
    const { body: { results } } = await utils.getProductsBySkus(['1'], ctpClient)
    expect(results).to.have.lengthOf(1)
    const updatedProduct = results[0]
    expect(updatedProduct.version).to.be.above(product.version)
    expect(updatedProduct.productType.id).to.equal(productType2.id)
  })
})
