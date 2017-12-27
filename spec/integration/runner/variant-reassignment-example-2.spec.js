import { expect } from 'chai'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import * as utils from '../../utils/helper'

const productDraftProductType = require('../../resources/productType.json')

/* eslint-disable max-len */
/**
 * +---------------------------+---------------------------------------------+--------------------+---------------------------------------------------------------+
 * | New product draft         | CTP product                                 | After reassignment | CTP product                                                   |
 * +---------------------------+---------------------------------------------+                    +---------------------------------------------------------------+
 * | Product:                  | Product:                                    |                    | Product:                                                      |
 * | slug: { en: "product-1" } | id: "1"                                     |                    | id: "1"                                                       |
 * | product-type: "pt2"       | slug: { en: "product-1", de: "produkte-1" } |                    | slug: { en: "product-1_${timestamp}", _ctsd: "${timestamp}" } |
 * | variants: v1, v3          | product-type: "pt1"                         |                    | product-type: "pt1"                                           |
 * |                           | variants: v1, v2                            |                    | variants: v2                                                  |
 * +---------------------------+---------------------------------------------+                    +---------------------------------------------------------------+
 * |                           | Product:                                    |                    | Product:                                                      |
 * |                           | id: "2"                                     |                    | id: "2"                                                       |
 * |                           | slug: { en: "product-2" }                   |                    | slug: { en: "product-2" }                                     |
 * |                           | product-type: "pt1"                         |                    | product-type: "pt1"                                           |
 * |                           | variants: v3, v4                            |                    | variants: v4                                                  |
 * +---------------------------+---------------------------------------------+                    +---------------------------------------------------------------+
 * |                           |                                             |                    | Product:                                                      |
 * |                           |                                             |                    | id: "3"                                                       |
 * |                           |                                             |                    | slug: { en: "product-1", de: "produkte-1" }                   |
 * |                           |                                             |                    | product-type: "pt2"                                           |
 * |                           |                                             |                    | variants: v1, v3                                              |
 * +---------------------------+---------------------------------------------+--------------------+---------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe.skip('Variant reassignment', () => {
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

  it('moving variant v3 + removing variant v2 + changing productType', async () => {
    productDraftProductType.name = 'product-draft-product-type'
    const productType = await utils.ensureResource(ctpClient.productTypes,
      productDraftProductType, 'name')

    const reassignment = new VariantReassignment(ctpClient, logger)
    await reassignment.execute([{
      productType: {
        id: productType.id
      },
      name: {
        en: 'Sample product1'
      },
      slug: {
        en: 'sample-product1'
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
    expect(results).to.have.lengthOf(2)
    const backupProduct = results.find(product => product.masterVariant.sku === '2')
    expect(backupProduct).to.be.an('object')
    expect(backupProduct.variants).to.have.lengthOf(2)
    expect(backupProduct.slug._ctsd).to.be.a('string')

    const newProduct = results.find(product => product.masterVariant.sku === '1')
    expect(newProduct.productType.id).to.not.equal(product1.productType.id)

    const updatedProduct = results.find(product => product.masterVariant.sku === '4')
    expect(updatedProduct).to.be.an('object')
  })
})
