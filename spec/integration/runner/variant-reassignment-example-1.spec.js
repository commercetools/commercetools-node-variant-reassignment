import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

describe('Variant reassignment', () => {
  let ctpClient
  let product1
  let product2
  const logger = utils.createLogger(__filename)

  before(async () => {
    ctpClient = await utils.createClient()
    const productType = await utils.ensureProductType(ctpClient)
    const productDraft1 = utils.generateProduct(['1'], productType.id)
    product1 = await utils.ensureResource(ctpClient.products, productDraft1)
    const productDraft2 = utils.generateProduct(['3', '4'], productType.id)
    product2 = await utils.ensureResource(ctpClient.products, productDraft2)
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('move variant v3 to another product', async () => {
    const reassignment = new VariantReassignment(logger, {})
    await reassignment.execute([{
      productType: {
        id: product1.productType.id
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
    const { body: { results } } = await ctpClient.productProjections
      .staged(true)
      .where('masterVariant(sku in ("1", "3", "4"))')
      .where('variants(sku in ("1", "3", "4"))')
      .whereOperator('or')
      .fetch()
    expect(results.length).to.equal(2)
    const backupProduct = results.find(product => product.masterVariant.sku === '4')
    expect(backupProduct).to.exist()
    expect(backupProduct.variants.length).to.equal(0)
  })
})
