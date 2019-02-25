import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 * +------------------------------------------------------------+-------------------------------------------------------------------------+--------------------+------------------------------------------------------------+
 * | Product draft                                              | CTP product                                                             | After reassignment | CTP product                                                |
 * +------------------------------------------------------------+-------------------------------------------------------------------------+                    +------------------------------------------------------------+
 * | Product:                                                   | Product:                                                                |                    | Product:                                                   |
 * | slug: { en: "product" }                                    | id: 1                                                                   |                    | id: "1"                                                    |
 * | product-type: "pt1"                                        | slug: { en: "product-1" }                                               |                    | slug: { en: "product" }                                    |
 * | masterVariant: { sku: v1, attributes: [ { brandId: 1 } ] } | product-type: "pt1"                                                     |                    | product-type: "pt1"                                        |
 * | variants: { sku: v2, attributes: [ { brandId: 1 } ] }      | masterVariant: { sku: v1, attributes: [ { brandId (sameForAll): 2 } ] } |                    | masterVariant: { sku: v1, attributes: [ { brandId: 1 } ] } |
 * |                                                            |                                                                         |                    | variants: { sku: v2, attributes: [ { brandId: 1 } ] }      |
 * +------------------------------------------------------------+-------------------------------------------------------------------------+                    +------------------------------------------------------------+
 * |                                                            | Product:                                                                |                    |                                                            |
 * |                                                            | id: 2                                                                   |                    |                                                            |
 * |                                                            | slug: { en: "product-2" }                                               |                    |                                                            |
 * |                                                            | product-type: "pt1"                                                     |                    |                                                            |
 * |                                                            | masterVariant: { sku: v2, attributes: [ { brandId (sameForAll): 3 } ] } |                    |                                                            |
 * +------------------------------------------------------------+-------------------------------------------------------------------------+--------------------+------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment - handling sameForAll attributes with blacklist', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1

  before(async () => {
    ctpClient = await utils.createClient()

    const results = await utils.createCtpProducts([['1'], ['2']], ctpClient, (pD) => {
      if (pD.masterVariant.sku === '1')
        pD.masterVariant.attributes = [{ name: 'brandId', value: '2' }]
      else if (pD.masterVariant.sku === '2')
        pD.masterVariant.attributes = [{ name: 'brandId', value: '3' }]
    })
    product1 = results.find(product => product.masterVariant.sku === '1')
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('merge variants with different sameForAll attributes with blacklist',
    async () => {
      const reassignment = new VariantReassignment(ctpClient, logger, ['brandId'])
      const { statistics } = await reassignment.execute([{
        productType: {
          id: product1.productType.id
        },
        name: {
          en: 'Sample product1'
        },
        slug: {
          en: 'product'
        },
        masterVariant: {
          sku: '1',
          attributes: [
            {
              name: 'brandId',
              value: '1'
            }
          ]
        },
        variants: [
          {
            sku: '2',
            attributes: [
              {
                name: 'brandId',
                value: '1'
              }
            ]
          }
        ]
      }])

      utils.expectStatistics(statistics, 0, 0, 1, 1)
      const { body: { results } } = await utils.getProductsBySkus(['1', '2'], ctpClient)
      expect(results).to.have.lengthOf(1)
      const product = results[0]
      expect(product.masterVariant.attributes).to.have.lengthOf(1)
      expect(product.variants).to.have.lengthOf(1)
      expect(product.variants[0].attributes).to.have.lengthOf(1)

      const brandIdAttr = product.masterVariant.attributes.find(a => a.name === 'brandId')
      expect(brandIdAttr.value).to.equal('1')
    })
})
