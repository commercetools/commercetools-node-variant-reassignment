import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

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
      const reassignment = new VariantReassignment(logger, {})
      const productDraft = {
        productType: {
          id: product1.productType.id
        },
        key: 'sample-product1',
        name: {
          en: 'Sample product1'
        },
        slug: {
          en: 'product-xxx'
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
      }
      await reassignment.execute([productDraft], [product1, product2])

      const { body: { results } } = await ctpClient.productProjections
        .staged(true)
        .where('masterVariant(sku in ("1", "2", "3", "4"))')
        .where('variants(sku in ("1", "2", "3", "4"))')
        .whereOperator('or')
        .fetch()
      expect(results.length).to.equal(3)
      const updatedProduct1 = results.find(product => product.masterVariant.sku === '2')
      const updatedProduct2 = results.find(product => product.masterVariant.sku === '4')
      const newProduct3 = results.find(product => product.masterVariant.sku === '1'
        || product.masterVariant.sku === '3')
      expect(updatedProduct1.variants.length).to.equal(0)
      expect(updatedProduct1.id).to.equal(product1.id)

      expect(updatedProduct2.variants.length).to.equal(0)
      expect(updatedProduct2.variants.length).to.equal(product2.id)

      expect(newProduct3.variants.length).to.equal(1)
      expect(newProduct3.slug.en).to.equal(productDraft.slug.en)
    })
})
