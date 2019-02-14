import { expect } from 'chai'
import _ from 'lodash'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

/* eslint-disable max-len */
/**
 * +-----------+------------------------------------------------------------+-------------------------------------------------------------------------+--------+
 * | Blacklist | Product draft                                              | CTP product                                                             | Error! |
 * +-----------+------------------------------------------------------------+-------------------------------------------------------------------------+        +
 * | [ ]       | Product:                                                   | Product:                                                                |        |
 * |           | slug: { en: "product" }                                    | id: 1                                                                   |        |
 * |           | product-type: "pt1"                                        | slug: { en: "product-1" }                                               |        |
 * |           | masterVariant: { sku: v1, attributes: [ { brandId: 2 } ] } | product-type: "pt1"                                                     |        |
 * |           | variants: { sku: v2, attributes: [ { brandId: 2 } ] }      | masterVariant: { sku: v1, attributes: [] }                              |        |
 * +-----------+------------------------------------------------------------+-------------------------------------------------------------------------+        +
 * |           |                                                            | Product:                                                                |        |
 * |           |                                                            | id: 2                                                                   |        |
 * |           |                                                            | slug: { en: "product-2" }                                               |        |
 * |           |                                                            | product-type: "pt1"                                                     |        |
 * |           |                                                            | masterVariant: { sku: v2, attributes: [ { brandId (sameForAll): 1 } ] } |        |
 * +-----------+------------------------------------------------------------+-------------------------------------------------------------------------+--------+
 */
/* eslint-enable max-len */
// todo: https://github.com/commercetools/commercetools-node-variant-reassignment/issues/43
describe('Variant reassignment - sameForAll and missing attribute', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1

  before(async () => {
    ctpClient = await utils.createClient()
    const results = await utils.createCtpProducts([['1'], ['2']], ctpClient, (pD, ind) => {
      // create brandId attribute only on second product (index = 1)
      if (ind)
        pD.masterVariant.attributes = [{ name: 'brandId', value: '1' }]
    })
    product1 = results.find(product => product.masterVariant.sku === '1')
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('product draft contains correct sameForAll and one variant is missing attribute', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger, {}, ['brandId'])
    await reassignment.execute([{
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
            value: '2'
          }
        ]
      },
      variants: [
        {
          sku: '2',
          attributes: [
            {
              name: 'brandId',
              value: '2'
            }
          ]
        }
      ]
    }])

    const { body: { results } } = await utils.getProductsBySkus(['1', '2'], ctpClient)
    expect(results).to.have.lengthOf(1)
    const product = results[0]
    product.variants.concat(product.masterVariant).forEach((variant) => {
      const attr = _.find(variant.attributes, ['name', 'brandId'])
      expect(attr).to.be.an('object')
      expect(attr.value).to.be.equal('2')
    })
  })
})
