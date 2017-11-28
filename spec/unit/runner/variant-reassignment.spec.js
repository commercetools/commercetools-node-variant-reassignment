import { expect } from 'chai'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import * as utils from '../../utils/helper'

describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  const existingProducts = [
    {
      id: 'productId1',
      key: 'sample-product-1',
      productType: {
        typeId: 'product-type',
        id: 'productTypeId1'
      },
      name: {
        en: 'Sample product'
      },
      slug: {
        en: 'sample-product-1'
      },
      masterVariant: {
        id: 1,
        sku: '1',
      },
      variants: []
    },
    {
      id: 'productId2',
      key: 'sample-product-2',
      productType: {
        typeId: 'product-type',
        id: 'productTypeId2'
      },
      name: {
        en: 'Sample product'
      },
      slug: {
        en: 'sample-product-2'
      },
      masterVariant: {
        id: 1,
        sku: '2',
        prices: []
      },
      variants: [{
        id: 2,
        sku: '3'
      }]
    },
    {
      id: 'productId3',
      key: 'sample-product-3',
      productType: {
        typeId: 'product-type',
        id: 'productTypeId2'
      },
      name: {
        en: 'Sample product'
      },
      slug: {
        en: 'sample-product-3'
      },
      masterVariant: {
        id: 1,
        sku: '4',
        prices: []
      },
      variants: [{
        id: 2,
        sku: '5'
      }]
    },
    {
      id: 'productId4',
      key: 'sample-product-4',
      productType: {
        typeId: 'product-type',
        id: 'productTypeId2'
      },
      name: {
        en: 'Sample product'
      },
      slug: {
        en: 'sample-product-4'
      },
      masterVariant: {
        id: 1,
        sku: '6',
        prices: []
      },
      variants: []
    }
  ]
  const productDrafts = [
    {
      key: 'different-product-type',
      productType: {
        typeId: 'product-type',
        id: 'productTypeId2'
      },
      name: {
        en: 'Sample product'
      },
      slug: {
        en: 'sample-product-1'
      },
      masterVariant: {
        id: 1,
        sku: '1',
      },
      variants: []
    },
    {
      key: 'different-variants',
      productType: {
        typeId: 'product-type',
        id: 'productTypeId1'
      },
      name: {
        en: 'Sample product'
      },
      slug: {
        en: 'sample-product-2'
      },
      masterVariant: {
        sku: '1',
      },
      variants: [{
        sku: '5'
      }]
    },
    {
      key: 'different-attributes',
      productType: {
        typeId: 'product-type',
        id: 'productTypeId2'
      },
      name: {
        en: 'New sample product'
      },
      slug: {
        en: 'new-sample-product-4'
      },
      masterVariant: {
        id: 1,
        sku: '6',
        prices: []
      },
      variants: []
    }
  ]

  it('should select only drafts that need reassignment', () => {
    const variantReassignments = new VariantReassignment(null, logger)
    const drafts
      = variantReassignments._selectProductDraftsForReassignment(productDrafts, existingProducts)
    expect(drafts).to.have.lengthOf(2)
    expect(drafts.map(d => d.key)).to.include('different-variants')
    expect(drafts.map(d => d.key)).to.include('different-product-type')
  })
})
