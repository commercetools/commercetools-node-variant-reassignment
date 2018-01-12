import _ from 'lodash'
import { expect } from 'chai'
import sinon from 'sinon'

import * as utils from '../utils/helper'
import ProductManager from '../../lib/services/product-manager'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../lib/constants'

const productType = _.cloneDeep(require('../resources/productType2.json'))

let pM = null

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
    productType: {
      typeId: 'product-type',
      id: 'product-type-id'
    },
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
      pM = new ProductManager(utils.logger, {})
      sinon.stub(pM, 'updateProduct')
        .callsFake((product, actions) => actions)

      sinon.stub(pM, 'deleteByProduct')
        .callsFake(product => product)
    })

    it('should remove variant v2', () => {
      const product = getMockProduct()
      const actions = pM.removeVariantsFromProduct(product, ['2'])
      expect(actions).to.deep.equal([
        { action: 'removeVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: false, sku: '2' }
      ])
    })

    it('should remove masterVariant', () => {
      const product = getMockProduct()
      const actions = pM.removeVariantsFromProduct(product, ['1'])
      expect(actions).to.deep.equal([
        { action: 'changeMasterVariant', staged: true, sku: '2' },
        { action: 'removeVariant', staged: true, sku: '1' },
        { action: 'changeMasterVariant', staged: false, sku: '2' },
        { action: 'removeVariant', staged: false, sku: '1' }
      ])
    })

    it('should delete product when removing all variants', () => {
      const product = getMockProduct()
      pM.removeVariantsFromProduct(
        product, ['1', '2', '3']
      )

      expect(pM.deleteByProduct.called).to.equal(true)
    })

    it('should unpublish product when removing all current variants', () => {
      const product = getMockProduct()
      delete product.masterData.current.variants
      const actions = pM.removeVariantsFromProduct(product, ['1'])

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
      const actions = pM.removeVariantsFromProduct(
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
      pM.removeVariantsFromProduct(product, ['5'])
      expect(pM.updateProduct.called).to.equal(false)
    })

    it('should remove variants using variantId if exists', () => {
      const product = getMockProduct()
      product.masterData.current.variants[1].variantId = 3
      product.masterData.staged.variants[0].variantId = 2
      product.masterData.staged.masterVariant.variantId = 1

      const actions = pM.removeVariantsFromProduct(
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

  describe('compare two products', () => {
    beforeEach(() => {
      pM = new ProductManager(utils.logger, {})
    })

    it('should equal when product ids are equal', () => {
      const productId = 'test-id'
      const mockProduct1 = getMockProduct()
      mockProduct1.id = productId
      const mockProduct2 = getMockProduct()
      mockProduct2.id = productId

      const result = pM.isProductsSame(mockProduct1, mockProduct2)
      expect(result).to.equal(true)
    })

    it('should equal when product type and slugs are equal', () => {
      const productTypeId = 'product-type-test-id'
      const productSlug = { en: 'test' }
      const mockProduct1 = getMockProduct()
      mockProduct1.productType.id = productTypeId
      mockProduct1.slug = productSlug
      const mockProduct2 = getMockProduct()
      mockProduct2.productType.id = productTypeId
      mockProduct2.slug = productSlug

      const result = pM.isProductsSame(mockProduct1, mockProduct2)
      expect(result).to.equal(true)
    })

    it('should not equal when product id and type are not equal', () => {
      const mockProduct1 = getMockProduct()
      mockProduct1.id = 'product-id-1'
      mockProduct1.productType.id = 'product-type-1'
      const mockProduct2 = getMockProduct()
      mockProduct2.id = 'product-id-2'
      mockProduct2.productType.id = 'product-type-2'

      const result = pM.isProductsSame(mockProduct1, mockProduct2)
      expect(result).to.equal(false)
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
      pM = new ProductManager(utils.logger, {})
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
        pM.getAnonymizedProductDraft(_.cloneDeep(productDraft)),
        pM.getAnonymizedProductDraft(_.cloneDeep(productDraft))
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

      const anonymized = pM.getAnonymizedProductDraft(productDraft)

      expect(anonymized.slug).to.have.property(PRODUCT_ANONYMIZE_SLUG_KEY)
      const ctsdSalt = anonymized.slug[PRODUCT_ANONYMIZE_SLUG_KEY]

      expect(anonymized.slug.en).to.contain(ctsdSalt)
      expect(anonymized).to.not.have.property(`key`)
    })

    it('should anonymize CTP product', async () => {
      const product = _.cloneDeep(productMock)

      product.key = 'product-key'
      product.masterData.published = true

      const spySalt = sinon.spy(pM, '_getSalt')
      const stub = sinon.stub(pM, 'updateProduct')
        .callsFake(() => Promise.resolve())

      await pM.anonymizeCtpProduct(product)

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
      const spySalt = sinon.spy(pM, '_getSalt')
      const stub = sinon.stub(pM, 'updateProduct')
        .callsFake(() => Promise.resolve())

      await pM.anonymizeCtpProduct(productMock)

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

  describe('ensure sameForAll constraint', () => {
    const variants = [
      {
        sku: '1',
        attributes: [
          {
            name: 'brandId',
            value: '123'
          },
          {
            name: 'isAvailable',
            value: false
          },
          {
            name: 'color',
            value: 'red'
          }
        ]
      },
      {
        sku: '2',
        attributes: [
          {
            name: 'brandId',
            value: '456'
          },
          {
            name: 'isAvailable',
            value: false
          },
          {
            name: 'color',
            value: 'green'
          }
        ]
      }
    ]

    beforeEach(() => {
      pM = new ProductManager(utils.logger, {})
      pM.productTypeCache.set(productType.id, productType)
    })

    it('should select all sameForAll attributes from product type', () => {
      const sameForAllAttrs = pM._selectSameForAllAttrs(productType)
      expect(sameForAllAttrs.length).to.equal(2)
      expect(sameForAllAttrs[0].attributeConstraint).to.equal('SameForAll')
      expect(sameForAllAttrs[1].attributeConstraint).to.equal('SameForAll')
    })

    it('should select attrs that violates sameForAll from variants', () => {
      const violatedAttrs = pM._selectViolatedAttrs(variants,
        [{ name: 'brandId' }, { name: 'isAvailable' }])
      expect(violatedAttrs.length).to.equal(1)
    })

    it('should remove violated attr from variant AND return update action', async () => {
      const variantsClone = _.cloneDeep(variants)
      const updateActions = await pM.ensureSameForAllAttributes(variantsClone, productType.id,
        {
          masterVariant: {
            attributes: [{
              name: 'isAvailable',
              value: true
            }]
          }
        })
      expect(updateActions.length).to.equal(1)
      const updateAction = updateActions[0]
      expect(updateAction.action).to.equal('setAttributeInAllVariants')
      expect(updateAction.name).to.equal('brandId')
      expect(updateAction.value).to.equal(null)
      expect(variantsClone.every(v => v.attributes.length === 2)).to.equal(true)
    })
  })

  describe('get product by skus or slugs', () => {
    let productsQuerySpy

    beforeEach(async () => {
      pM = new ProductManager(utils.logger, {})
      const client = await utils.createClient()
      productsQuerySpy = sinon.spy(client.products, 'where')
      sinon.stub(client.products, 'fetch').callsFake(() =>
        Promise.resolve({ body: { results: [getMockProduct()] } })
      )
      pM.loadBatchCount = 2
      pM.client = client
    })

    it('should fetch products with correct query', async () => {
      const testSku1 = '1'
      const testSku2 = '2'
      const testSku3 = '3'
      const testSlugValue1 = 'test_slug_1'
      const testSlugLang1 = 'de'
      const testSlugValue2 = 'test_slug_2'
      const testSlugLang2 = 'en'
      const result = await pM.getProductsBySkusOrSlugs([testSku1, testSku2, testSku3],
        [{ [testSlugLang1]: testSlugValue1, [testSlugLang2]: testSlugValue2 }])

      /* eslint-disable max-len */
      expect(productsQuerySpy.getCall(0).args[0])
        .is.equal(`masterData(current(masterVariant(sku IN("${testSku1}","${testSku2}")) or variants(sku IN("${testSku1}","${testSku2}"))) `
        + `or staged(masterVariant(sku IN("${testSku1}","${testSku2}")) or variants(sku IN("${testSku1}","${testSku2}")) `
        + `or slug(${testSlugLang1}="${testSlugValue1}" or ${testSlugLang2}="${testSlugValue2}")))`)
      expect(productsQuerySpy.getCall(1).args[0])
        .is.equal(`masterData(current(masterVariant(sku IN("${testSku3}")) or variants(sku IN("${testSku3}"))) `
        + `or staged(masterVariant(sku IN("${testSku3}")) or variants(sku IN("${testSku3}"))))`)
      /* eslint-enable max-len */
      expect(result.length).to.equal(1)
    })
  })
})
