import _ from 'lodash'
import { expect } from 'chai'
import sinon from 'sinon'

import * as utils from '../utils/helper'
import ProductManager from '../../lib/services/product-manager'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../lib/constants'

let productService = null

function getMockProduct () {
  const productVariants = {
    masterVariant: {
      sku: '1'
    },
    variants: [{
      sku: '2'
    }, {
      sku: '3'
    }]
  }

  return {
    id: 'product-id',
    version: 1,
    masterData: {
      current: _.cloneDeep(productVariants),
      staged: _.cloneDeep(productVariants)
    }
  }
}

describe('ProductManager', () => {
  describe('removing variant', () => {
    beforeEach(() => {
      productService = new ProductManager(utils.logger, {})
      sinon.stub(productService, 'updateProduct')
        .callsFake((product, actions) => actions)

      sinon.stub(productService, 'deleteByProduct')
        .callsFake(product => product)
    })

    it('should remove variant v2', () => {
      const product = getMockProduct()
      const actions = productService.removeVariantsFromProduct(product, ['2'])
      expect(actions).to.deep.equal([
        { action: 'removeVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: false, sku: '2' }
      ])
    })

    it('should remove masterVariant', () => {
      const product = getMockProduct()
      const actions = productService.removeVariantsFromProduct(product, ['1'])
      expect(actions).to.deep.equal([
        { action: 'changeMasterVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: true, sku: '1' },
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'removeVariant', staged: false, sku: '1' }
      ])
    })

    it('should delete product when removing all variants', () => {
      const product = getMockProduct()
      productService.removeVariantsFromProduct(
        product, ['1', '2', '3']
      )

      expect(productService.deleteByProduct.called).to.equal(true)
    })

    it('should unpublish product when removing all current variants', () => {
      const product = getMockProduct()
      delete product.masterData.current.variants
      const actions = productService.removeVariantsFromProduct(product, ['1'])

      expect(actions).to.deep.equal([
        { action: 'publish' },
        { action: 'changeMasterVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: true, sku: '1' },
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'removeVariant', staged: false, sku: '1' },
        { action: 'unpublish' }
      ])
    })

    it('should copy current to staged when there are no variants', () => {
      const product = getMockProduct()
      // remove staged variant with sku 2
      product.masterData.staged.variants.shift()
      const actions = productService.removeVariantsFromProduct(
        product, ['1', '3']
      )

      expect(actions).to.deep.equal([
        { action: 'addVariant', staged: true, sku: '2' },
        { action: 'changeMasterVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: true, sku: '1' },
        { action: 'removeVariant', staged: true, sku: '3' },
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'removeVariant', staged: false, sku: '1' },
        { action: 'removeVariant', staged: false, sku: '3' }
      ])
    })

    it('should not remove anything when skus are not found', () => {
      const product = getMockProduct()
      productService.removeVariantsFromProduct(product, ['5'])
      expect(productService.updateProduct.called).to.equal(false)
    })

    it('should remove variants using variantId if exists', () => {
      const product = getMockProduct()
      product.masterData.current.variants[1].variantId = 3
      product.masterData.staged.variants[0].variantId = 2
      product.masterData.staged.masterVariant.variantId = 1

      const actions = productService.removeVariantsFromProduct(
        product, ['3', '1']
      )

      expect(actions).to.deep.equal([
        { action: 'changeMasterVariant', staged: true, variantId: 2 },
        { action: 'removeVariant', staged: true, sku: '3' },
        { action: 'removeVariant', staged: true, id: 1 },
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'removeVariant', staged: false, id: 3 },
        { action: 'removeVariant', staged: false, sku: '1' }
      ])
    })
  })

  describe('anonymizing product', () => {
    const productMock = {
      id: 'product-id',
      version: 100,
      productType: {
        typeId: 'product-type',
        id: 'product-type-id'
      },
      masterData: {
        current: {
          name: {
            en: 'Product Name'
          },
          description: {
            en: 'Product Description'
          },
          slug: {
            en: 'product-slug',
            de: 'product-slug-de'
          },
          masterVariant: {
            id: 1,
            sku: '2838301109'
          },
          variants: []
        },
        staged: {
          name: {
            en: 'Product Name'
          },
          description: {
            en: 'Product Description'
          },
          slug: {
            en: 'product-slug'
          },
          masterVariant: {
            id: 1,
            sku: '2838301109'
          }
        },
        published: false,
        hasStagedChanges: false
      }
    }

    beforeEach(() => {
      productService = new ProductManager(utils.logger, {})
    })

    it('should anonymize product', async () => {
      const productDraft = {
        slug: {
          en: 'slugEn',
          de: 'slugDe'
        },
        name: {
          en: 'nameEn',
          de: 'nameDe'
        },
        key: 'productKey',
        masterVariant: {},
        variants: []
      }

      const anonymized = await Promise.all([
        productService.getAnonymizedProductDraft(_.cloneDeep(productDraft)),
        productService.getAnonymizedProductDraft(_.cloneDeep(productDraft))
      ])

      const first = anonymized[0]
      expect(first.slug).to.have.property(PRODUCT_ANONYMIZE_SLUG_KEY)
      const ctsd = first.slug[PRODUCT_ANONYMIZE_SLUG_KEY]

      expect(first.slug.en).to.contain(ctsd)
      expect(first.slug.de).to.contain(ctsd)
      expect(first.key).to.equal(`productKey-${ctsd}`)

      const second = anonymized[1]
      expect(second.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.not.equal(ctsd)
    })

    it('should anonymize product with missing key', () => {
      const productDraft = {
        slug: {
          en: 'slugEn',
        },
        name: {
          en: 'nameEn',
        },
        masterVariant: {},
        variants: []
      }

      const anonymized = productService.getAnonymizedProductDraft(productDraft)

      expect(anonymized.slug).to.have.property(PRODUCT_ANONYMIZE_SLUG_KEY)
      const ctsdSalt = anonymized.slug[PRODUCT_ANONYMIZE_SLUG_KEY]

      expect(anonymized.slug.en).to.contain(ctsdSalt)
      expect(anonymized).to.not.have.property(`key`)
    })

    it('should anonymize CTP product', async () => {
      const product = _.cloneDeep(productMock)

      product.key = 'product-key'
      product.masterData.published = true

      const spySalt = sinon.spy(productService, '_getSalt')
      const stub = sinon.stub(productService, 'updateProduct')
        .callsFake(() => Promise.resolve())

      await productService.anonymizeCtpProduct(product)

      expect(stub.callCount).to.equal(1)
      const actions = stub.firstCall.args[1]
      const ctsdSalt = spySalt.returnValues[0]

      expect(actions).to.deep.equal([
        {
          action: 'unpublish'
        },
        {
          action: 'setKey',
          key: `product-key-${ctsdSalt}`
        },
        {
          action: 'changeSlug',
          slug: {
            en: `product-slug-${ctsdSalt}`,
            de: `product-slug-de-${ctsdSalt}`,
            ctsd: ctsdSalt
          },
          staged: false
        },
        {
          action: 'changeSlug',
          slug: {
            en: `product-slug-${ctsdSalt}`,
            ctsd: ctsdSalt
          },
          staged: true
        }
      ])
    })

    it('should anonymize unpublished CTP product without key', async () => {
      const spySalt = sinon.spy(productService, '_getSalt')
      const stub = sinon.stub(productService, 'updateProduct')
        .callsFake(() => Promise.resolve())

      await productService.anonymizeCtpProduct(productMock)

      expect(stub.callCount).to.equal(1)
      const actions = stub.firstCall.args[1]
      const ctsdSalt = spySalt.returnValues[0]

      expect(actions).to.deep.equal([
        {
          action: 'changeSlug',
          slug: {
            en: `product-slug-${ctsdSalt}`,
            de: `product-slug-de-${ctsdSalt}`,
            ctsd: ctsdSalt
          },
          staged: false
        },
        {
          action: 'changeSlug',
          slug: {
            en: `product-slug-${ctsdSalt}`,
            ctsd: ctsdSalt
          },
          staged: true
        }
      ])
    })
  })
})
