import _ from 'lodash'
import { expect } from 'chai'
import sinon from 'sinon'

import * as utils from '../utils/helper'
import ProductManager from '../../lib/services/product-manager'

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
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'changeMasterVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: true, sku: '1' },
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
        { action: 'unpublish' },
        { action: 'addVariant', staged: false, sku: '2' },
        { action: 'addVariant', staged: false, sku: '3' },
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'changeMasterVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: true, sku: '1' },
        { action: 'removeVariant', staged: false, sku: '1' }
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
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'changeMasterVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: true, sku: '1' },
        { action: 'removeVariant', staged: true, sku: '3' },
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
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'changeMasterVariant', staged: true, variantId: 2 },
        { action: 'removeVariant', staged: true, sku: '3' },
        { action: 'removeVariant', staged: true, id: 1 },
        { action: 'removeVariant', staged: false, id: 3 },
        { action: 'removeVariant', staged: false, sku: '1' }
      ])
    })
  })

  describe('anonymizing product', () => {
    beforeEach(() => {
      productService = new ProductManager(utils.logger, {})
    })

    it('should anonymize product', () => {
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

      const anonymized = productService.getAnonymizedProduct(productDraft)

      expect(anonymized.slug).to.have.property('_ctsd')
      expect(parseInt(anonymized.slug._ctsd, 10)).to.be.above(0)
      const timeout = anonymized.slug._ctsd

      expect(anonymized.slug.en).to.contain(timeout)
      expect(anonymized.slug.de).to.contain(timeout)
      expect(anonymized.key).to.equal(`productKey-${timeout}`)
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

      const anonymized = productService.getAnonymizedProduct(productDraft)

      expect(anonymized.slug).to.have.property('_ctsd')
      expect(parseInt(anonymized.slug._ctsd, 10)).to.be.above(0)
      const timeout = anonymized.slug._ctsd

      expect(anonymized.slug.en).to.contain(timeout)
      expect(anonymized).to.not.have.property(`key`)
    })
  })
})
