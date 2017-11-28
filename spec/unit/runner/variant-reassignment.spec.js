import { expect } from 'chai'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import * as utils from '../../utils/helper'

describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  const ctpProduct1 = utils.generateProduct(['1'], 'productTypeId1')
  const ctpProduct2 = utils.generateProduct(['2', '3'], 'productTypeId2')
  const ctpProduct3 = utils.generateProduct(['4', '5'], 'productTypeId2')
  const ctpProduct4 = utils.generateProduct(['6'], 'productTypeId2')
  const ctpProducts = [
    ctpProduct1,
    ctpProduct2,
    ctpProduct3,
    ctpProduct4
  ]
  const productDraft1 = {
    key: 'different-product-type',
    productType: {
      typeId: 'product-type',
      id: 'productTypeId2'
    },
    name: {
      en: 'Sample product'
    },
    slug: {
      en: 'sample-product1'
    },
    masterVariant: {
      id: 1,
      sku: '1',
    },
    variants: []
  }
  const productDraft2 = {
    key: 'different-variants',
    productType: {
      typeId: 'product-type',
      id: 'productTypeId1'
    },
    name: {
      en: 'Sample product'
    },
    slug: {
      en: 'sample-product2'
    },
    masterVariant: {
      sku: '2',
    },
    variants: [{
      sku: '5'
    }]
  }
  const productDraft3 = {
    key: 'different-attributes',
    productType: {
      typeId: 'product-type',
      id: 'productTypeId2'
    },
    name: {
      en: 'New sample product'
    },
    slug: {
      en: 'new-sample-product4'
    },
    masterVariant: {
      id: 1,
      sku: '6',
      prices: []
    },
    variants: []
  }
  const productDraft4 = {
    key: 'different-attributes',
    productType: {
      typeId: 'product-type',
      id: 'productTypeId2'
    },
    name: {
      en: 'New sample product'
    },
    slug: {
      en: 'sample-product4',
      de: 'sample-product4'
    },
    masterVariant: {
      id: 1,
      sku: '7',
      prices: []
    },
    variants: [{
      id: 2,
      sku: '6',
      prices: []
    }]
  }
  const productDraft5 = {
    key: 'different-attributes',
    productType: {
      typeId: 'product-type',
      id: 'productTypeId2'
    },
    name: {
      en: 'New sample product'
    },
    slug: {
      en: 'sample-product4',
      de: 'sample-product4'
    },
    masterVariant: {
      id: 1,
      sku: '8',
      prices: []
    },
    variants: [
      {
        id: 2,
        sku: '6',
        prices: []
      },
      {
        id: 3,
        sku: '7',
        prices: []
      }
    ]
  }
  const productDrafts = [
    productDraft1,
    productDraft2,
    productDraft3
  ]

  it('should select only drafts that need reassignment', () => {
    const variantReassignments = new VariantReassignment(null, logger)
    const drafts
      = variantReassignments._selectProductDraftsForReassignment(productDrafts, ctpProducts)
    expect(drafts).to.have.lengthOf(2)
    expect(drafts.map(d => d.key)).to.include('different-variants')
    expect(drafts.map(d => d.key)).to.include('different-product-type')
  })

  it('should select matched product by variant SKUs', () => {
    const variantReassignments = new VariantReassignment(null, logger)
    const matchedProduct = variantReassignments
      ._selectCtpProductToUpdate(productDraft3, [ctpProduct4])
    expect(matchedProduct).to.deep.equal(ctpProduct4)
  })

  it('should select matched product by slug', () => {
    const variantReassignments = new VariantReassignment(null, logger)
    const matchedProduct = variantReassignments
      ._selectCtpProductToUpdate(productDraft2, [ctpProduct2, ctpProduct3])
    expect(matchedProduct).to.deep.equal(ctpProduct2)
  })

  it('should select matched product by master variant', () => {
    const productTypeId = productDraft4.productType.id
    const testCtpProduct1 = utils.generateProduct(productDraft4.variants[0].sku, productTypeId)
    testCtpProduct1.slug = {
      en: productDraft4.slug.de
    }
    const testCtpProduct2 = utils.generateProduct(productDraft4.masterVariant.sku, productTypeId)
    testCtpProduct2.slug = {
      de: productDraft4.slug.de
    }

    const variantReassignments = new VariantReassignment(null, logger)
    const matchedProduct = variantReassignments
      ._selectCtpProductToUpdate(productDraft4, [testCtpProduct1, testCtpProduct2])
    expect(matchedProduct).to.deep.equal(testCtpProduct2)
  })

  it('when slugs match two products and master variant not match, select first matched product',
    () => {
      const productTypeId = productDraft5.productType.id
      const testCtpProduct1 = utils.generateProduct(productDraft5.variants[0].sku, productTypeId)
      testCtpProduct1.slug = {
        en: productDraft5.slug.de
      }
      const testCtpProduct2 = utils.generateProduct(productDraft5.variants[1].sku, productTypeId)
      testCtpProduct2.slug = {
        de: productDraft5.slug.de
      }

      const variantReassignments = new VariantReassignment(null, logger)
      const matchedProduct = variantReassignments
        ._selectCtpProductToUpdate(productDraft5, [testCtpProduct1, testCtpProduct2])
      expect(matchedProduct).to.deep.equal(testCtpProduct1)
    })

  it('when slugs and master variant does not match any product, select first matched product',
    () => {
      const productTypeId = productDraft5.productType.id
      const testCtpProduct1 = utils.generateProduct(productDraft5.variants[0].sku, productTypeId)
      testCtpProduct1.slug = {
        en: `${productDraft5.slug.de}-no-slug-match`
      }
      const testCtpProduct2 = utils.generateProduct(productDraft5.variants[1].sku, productTypeId)
      testCtpProduct2.slug = {
        de: `${productDraft5.slug.de}-no-slug-match`
      }

      const variantReassignments = new VariantReassignment(null, logger)
      const matchedProduct = variantReassignments
        ._selectCtpProductToUpdate(productDraft5, [testCtpProduct1, testCtpProduct2])
      expect(matchedProduct).to.deep.equal(testCtpProduct1)
    })
})
