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
  let product1
  let productType2

  before(async () => {
    ctpClient = await utils.createClient()

    const results = await utils.createCtpProducts([['1']], ctpClient, (pD) => {
      pD.masterVariant.attributes = [{ name: 'brandId', value: '2' }]
    })
    product1 = results.find(product => product.masterVariant.sku === '1')
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('product type changes', async () => {
    productTypeDraft2.name = 'product-type-2'
    productType2 = await utils.ensureResource(ctpClient.productTypes,
      productTypeDraft2, 'name')

    const reassignment = new VariantReassignment(ctpClient, logger, {}, [])
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
    }], [product1])

    const { body: { results } } = await utils.getProductsBySkus(['1'], ctpClient)
    expect(results).to.have.lengthOf(1)
    const updatedProduct = results[0]
    expect(updatedProduct.productType.id).to.equal(productType2.id)
    expect(updatedProduct.slug).to.deep.equal(product1.slug)
    expect(updatedProduct.masterVariant).to.deep.equal(product1.masterVariant)
    expect(updatedProduct.name).to.deep.equal(product1.name)
    expect(new Date(updatedProduct.createdAt)).to.be.above(new Date(product1.createdAt))
  })
})
