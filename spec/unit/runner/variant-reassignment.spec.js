import { expect } from 'chai'
import sinon from 'sinon'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import ProductManager from '../../../lib/services/product-manager'
import * as utils from '../../utils/helper'

describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  const ctpProduct1 = utils.generateProduct(['1'], 'productTypeId1')
  const ctpProduct2 = utils.generateProduct(['2', '3'], 'productTypeId2')
  const ctpProduct3 = utils.generateProduct(['4', '5'], 'productTypeId2')
  const ctpProduct4 = utils.generateProduct(['6'], 'productTypeId2')

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
    key: 'different-slug-and-attributes',
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
  const noMatchProduct = {
    key: 'no-match-products',
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
      sku: '7',
      prices: []
    },
    variants: []
  }
  const productDrafts = [
    productDraft1,
    productDraft2,
    productDraft3,
    noMatchProduct
  ]

  it('should select only drafts that need reassignment', () => {
    const variantReassignments = new VariantReassignment(null, logger)
    const drafts = variantReassignments._selectProductDraftsForReassignment(productDrafts,
      [
        ctpProduct1,
        ctpProduct2,
        ctpProduct3,
        ctpProduct4
      ]
    )

    expect(drafts).to.have.lengthOf(3)
    const draftKeys = drafts.map(d => d.key)
    expect(draftKeys).to.include.members(['different-variants', 'different-slug-and-attributes',
      'different-product-type'])
  })

  describe('select product to update', () => {
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
      testCtpProduct1.masterData.staged.slug = {
        en: productDraft4.slug.de
      }
      const testCtpProduct2 = utils.generateProduct(productDraft4.masterVariant.sku, productTypeId)
      testCtpProduct2.masterData.staged.slug = {
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

  describe('get removed variants', () => {
    /**
     * Example 14
     */
    it('variants are the same for current and staged', () => {
      const ctpProductToUpdate = {
        masterData: {
          current: {
            masterVariant: { sku: 'v1' },
            variants: []
          },
          staged: {
            masterVariant: { sku: 'v1' },
            variants: [{ sku: 'v3' }]
          }
        }
      }
      const matchingProducts = [
        {
          masterData: {
            current: {
              masterVariant: { sku: 'v2' },
              variants: []
            },
            staged: {
              masterVariant: { sku: 'v2' },
              variants: []
            }
          }
        },
        ctpProductToUpdate
      ]
      const productDraft = {
        masterVariant: { sku: 'v1' },
        variants: [{ sku: 'v2' }]
      }

      const variantReassignments = new VariantReassignment(null, logger)
      const { ctpProductToUpdateVars, matchingProductsVars } = variantReassignments
        ._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate)

      expect(ctpProductToUpdateVars.length).to.equal(1)
      expect(ctpProductToUpdateVars[0].sku).to.equal('v3')
      expect(matchingProductsVars.length).to.equal(1)
      expect(matchingProductsVars[0].sku).to.equal('v2')
    })

    /**
     *  Example 15
     */
    it('current has a variant to be removed', () => {
      const ctpProductToUpdate = {
        masterData: {
          current: {
            masterVariant: { sku: 'v1' },
            variants: []
          },
          staged: {
            masterVariant: { sku: 'v5' },
            variants: []
          }
        }
      }
      const matchingProducts = [ctpProductToUpdate]
      const productDraft = {
        masterVariant: { sku: 'v1' }
      }

      const variantReassignments = new VariantReassignment(null, logger)
      const { ctpProductToUpdateVars, matchingProductsVars } = variantReassignments
        ._getRemovedVariants(productDraft, matchingProducts, ctpProductToUpdate)

      expect(ctpProductToUpdateVars.length).to.equal(1)
      expect(ctpProductToUpdateVars[0].sku).to.deep.equal('v5')
      expect(matchingProductsVars.length).to.equal(0)
    })
  })

  describe('ensure slug uniqueness', () => {
    const testProductId = 'test-product-id'
    let productServiceMock
    let testFunction
    let variantReassignments
    beforeEach(() => {
      productServiceMock = new ProductManager(utils.logger, {})
      testFunction = sinon.stub(productServiceMock, 'anonymizeCtpProduct')
        .resolves(null)

      variantReassignments = new VariantReassignment(null, logger)
      variantReassignments.productService = productServiceMock
    })

    it('product has same slug in current', async () => {
      await variantReassignments._ensureSlugUniqueness({ slug: { de: 'test-slug-de' } },
        [{
          id: testProductId,
          masterData: {
            current: {
              slug: {
                de: 'test-slug-de'
              }
            },
            staged: {
              slug: {
                en: 'test-slug-en'
              }
            }
          }
        }])
      expect(testFunction.callCount).to.equal(1)
      expect(testFunction.getCall(0).args[0].id).to.equal(testProductId)
    })

    it('product has different slug, should not anonymize', async () => {
      await variantReassignments._ensureSlugUniqueness({ slug: { de: 'test-slug' } },
        [{
          id: testProductId,
          masterData: {
            current: {
              slug: {
                en: 'test-slug'
              }
            },
            staged: {
              slug: {
                en: 'test-slug'
              }
            }
          }
        }])
      expect(testFunction.callCount).to.equal(0)
    })

    it('product has different slug with same lang, should not anonymize', async () => {
      await variantReassignments._ensureSlugUniqueness({ slug: { en: 'test-slug-1' } },
        [{
          id: testProductId,
          masterData: {
            current: {
              slug: {
                en: 'test-slug-2'
              }
            },
            staged: {
              slug: {
                en: 'test-slug-2'
              }
            }
          }
        }])
      expect(testFunction.callCount).to.equal(0)
    })
  })

  describe('resolve product type references', () => {
    it('should resolve product type references', async () => {
      const productTypeKey = 'productTypeKey'
      const productDraftArray = [{ id: 'product-id', productType: { id: productTypeKey } }]

      const productServiceMock = new ProductManager(utils.logger, {})
      sinon.stub(productServiceMock, 'fetchProductsFromProductDrafts')
        .resolves(null)
      const variantReassignments = new VariantReassignment(null, logger)
      sinon.stub(variantReassignments, '_processUnfinishedTransactions')
        .resolves(null)
      sinon.stub(variantReassignments, '_selectProductDraftsForReassignment')
        .returns(productDraftArray)
      const testFunction = sinon.stub(variantReassignments, '_processProductDraft').resolves(null)
      variantReassignments.productService = productServiceMock

      const productTypeId = 'productTypeId'
      await variantReassignments.execute(
        productDraftArray,
        {
          [productTypeKey]: {
            id: productTypeId
          }
        })

      const productDraftToVerify = testFunction.firstCall.args[0]
      expect(productDraftToVerify.productType.id).to.equal(productTypeId)
    })
  })

  describe('resolve product type references', () => {
    it('should resolve product type references', async () => {
      const productServiceMock = new ProductManager(utils.logger, {})
      sinon.stub(productServiceMock, 'fetchProductsFromProductDrafts')
        .resolves(null)
      const variantReassignments = new VariantReassignment(null, logger)
      sinon.stub(variantReassignments, '_processUnfinishedTransactions')
        .resolves(null)
      const testFunction = sinon.stub(variantReassignments, '_selectProductDraftsForReassignment')
        .returns([])
      variantReassignments.productService = productServiceMock

      const productTypeName = 'productTypeName'
      const productTypeId = 'productTypeId'
      await variantReassignments.execute(
        [{ id: 'product-id', productType: { id: productTypeName } }],
        {
          [productTypeName]: {
            id: productTypeId
          }
        })

      expect(testFunction.callCount).to.equal(1)
      const productDraftsToVerify = testFunction.firstCall.args[0]
      expect(productDraftsToVerify[0].productType.id).to.equal(productTypeId)
    })
  })
})
