import { expect } from 'chai'
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
 * |           | masterVariant: { sku: v1, attributes: [ { brandId: 1 } ] } | product-type: "pt1"                                                     |        |
 * |           | variants: { sku: v2, attributes: [ { brandId: 2 } ] }      | masterVariant: { sku: v1, attributes: [ { brandId (sameForAll): 2 } ] } |        |
 * +-----------+------------------------------------------------------------+-------------------------------------------------------------------------+        +
 * |           |                                                            | Product:                                                                |        |
 * |           |                                                            | id: 2                                                                   |        |
 * |           |                                                            | slug: { en: "product-2" }                                               |        |
 * |           |                                                            | product-type: "pt1"                                                     |        |
 * |           |                                                            | masterVariant: { sku: v2, attributes: [ { brandId (sameForAll): 2 } ] } |        |
 * +-----------+------------------------------------------------------------+-------------------------------------------------------------------------+--------+
 */
/* eslint-enable max-len */
// todo: https://github.com/commercetools/commercetools-node-variant-reassignment/issues/43
describe.skip('Variant reassignment - invalid sameForAll', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2

  before(async () => {
    ctpClient = await utils.createClient()
    const results = await utils.createCtpProducts([['1'], ['2']], ctpClient, (pD) => {
      pD.masterVariant.attributes = [{ name: 'brandId', value: '2' }]
    })
    product1 = results.find(product => product.masterVariant.sku === '1')
    product2 = results.find(product => product.masterVariant.sku === '2')
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('product draft does not contain correct sameForAll data', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger, ['brandId'])
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
              value: '2'
            }
          ]
        }
      ]
    }])

    const { body: { results } } = await utils.getProductsBySkus(['1', '2'], ctpClient)
    expect(results).to.have.lengthOf(2)
    const product1ToVerify = results.find(p => p.masterVariant.sku === '1')
    expect(product1ToVerify).to.deep.equal(product1)
    const product2ToVerify = results.find(p => p.masterVariant.sku === '2')
    expect(product2ToVerify).to.deep.equal(product2)
  })
})
