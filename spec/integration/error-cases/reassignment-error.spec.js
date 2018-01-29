import { expect } from 'chai'
import _ from 'lodash'
import sinon from 'sinon'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import * as constants from '../../../lib/constants'

const productTypeDraft = _.cloneDeep(require('../../resources/productType.json'))

productTypeDraft.name += '-2'
productTypeDraft.description += '-2'

describe('Reassignment error', () => {
  let ctpClient
  let product1
  let product2
  let productDraft
  let reassignment
  let logger
  let spyError

  const checkResult = async (results = null) => {
    if (!results) {
      const res = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
      results = res.body.results
    }

    expect(results).to.have.lengthOf(3, 'There should be 3 products on API')

    const matchingProduct = results.find(product => product.masterVariant.sku === '4')
    expect(matchingProduct).to.be.an('object', 'Backup product should be an object')
    expect(matchingProduct.variants).to.have.lengthOf(0, 'Backup product should have 0 variants')

    const updatedProduct = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct.variants[0].sku).to.equal(
      productDraft.variants[0].sku,
      'Updated product should have variant from P2'
    )
    expect(updatedProduct.variants[1].sku).to.equal(
      productDraft.variants[1].sku,
      'Updated product should have a new variant from productDraft'
    )

    const anonymizedProduct = results.find(product => product.masterVariant.sku === '2')
    expect(anonymizedProduct).to.be.an('object', 'Anonymized product should be an object')
    expect(anonymizedProduct.slug).to.haveOwnProperty('ctsd')

    const { body: { results: transactions } } = await ctpClient.customObjects
      .where(`container = "${constants.TRANSACTION_CONTAINER}"`)
      .fetch()
    expect(transactions).to.have.lengthOf(0, 'There should be no unfinished transaction')
  }

  before(async () => {
    ctpClient = await utils.createClient()
  })

  beforeEach(async () => {
    logger = utils.createLogger(__filename)
    spyError = sinon.spy(logger, 'error')
    reassignment = new VariantReassignment(ctpClient, logger)

    await utils.deleteResourcesAll(ctpClient, logger)
    const products = await utils.createCtpProducts([['1', '2'], ['3', '4']], ctpClient)
    product1 = _.find(products, ['masterVariant.sku', '1'])
    product2 = _.find(products, ['masterVariant.sku', '3'])

    productDraft = {
      productType: {
        id: product1.productType.id
      },
      name: {
        en: 'Sample product1'
      },
      slug: {
        en: 'sample-product1'
      },
      masterVariant: {
        sku: '1'
      },
      variants: [
        {
          sku: '3'
        },
        {
          sku: '5'
        }
      ]
    }
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('fail when process unfinished transaction fails', async () => {
    sinon.stub(reassignment.transactionService, 'getTransactions')
      .rejects('test error')

    try {
      await reassignment.execute([productDraft], [product1, product2])
      return Promise.reject('Should throw an error')
    } catch (e) {
      expect(e.toString()).to.contain('Could not process unfinished transactions')
      expect(spyError.callCount).to.equal(1)
      expect(spyError.lastCall.args[1].toString()).to.contain('test error')

      return Promise.resolve()
    }
  })

  it('fail when process can\'t load existing products', async () => {
    sinon.stub(reassignment.productService, 'fetchProductsFromProductProjections')
      .rejects('test error')

    try {
      await reassignment.execute([productDraft], [product1, product2])
      return Promise.reject('Should throw an error')
    } catch (e) {
      expect(e.toString()).to.contain('Error while fetching products for reassignment')
      expect(spyError.callCount).to.equal(1)
      expect(spyError.lastCall.args[1].toString()).to.contain('test error')

      return Promise.resolve()
    }
  })

  it('retry when reassignment fails before creating transaction', async () => {
    const spyUnfinished = sinon.spy(reassignment, '_processUnfinishedTransactions')
    const spyProductDraft = sinon.spy(reassignment, '_processProductDraft')

    sinon.stub(reassignment, '_selectMatchingProducts')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([productDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    expect(spyUnfinished.callCount).to.equal(1)
    expect(spyProductDraft.callCount).to.equal(2)

    return checkResult()
  })

  it('retry only once when reassignment fails before creating transaction', async () => {
    sinon.stub(reassignment, '_selectMatchingProducts').rejects('test error')

    try {
      await reassignment.execute([productDraft], [product1, product2])
      return Promise.reject('Should throw an error')
    } catch (e) {
      expect(e.toString()).to.contain('test error')
      expect(spyError.callCount).to.equal(1)
      return Promise.resolve()
    }
  })

  it('retry when it fails after creating transaction', async () => {
    sinon.stub(reassignment, '_createAndExecuteActions')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([productDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    return checkResult()
  })

  it('retry after failed backup of ctpProductToUpdate when changing productType', async () => {
    const customProductDraft = _.cloneDeep(productDraft)
    const customProductType = await utils.ensureProductType(ctpClient, productTypeDraft)
    customProductDraft.productType.id = customProductType.id
    await reassignment.productService.publishProduct(product1)

    sinon.stub(reassignment.productService, 'changeProductType')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([customProductDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
    const updatedProduct = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct.productType.id).to.equal(customProductType.id)

    return checkResult(results)
  })

  it('retry when it fails after deleting product when changing productType', async () => {
    const customProductDraft = _.cloneDeep(productDraft)
    const customProductType = await utils.ensureProductType(ctpClient, productTypeDraft)
    customProductDraft.productType.id = customProductType.id

    sinon.stub(reassignment.productService, 'createProduct')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([customProductDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
    const updatedProduct = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct.productType.id).to.equal(customProductType.id)

    return checkResult(results)
  })

  it('retry when it fails after creating product when changing productType', async () => {
    const customProductDraft = _.cloneDeep(productDraft)
    const customProductType = await utils.ensureProductType(ctpClient, productTypeDraft)
    customProductDraft.productType.id = customProductType.id

    sinon.stub(reassignment, '_removeVariantsFromMatchingProducts')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([customProductDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
    const updatedProduct = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct.productType.id).to.equal(customProductType.id)

    return checkResult(results)
  })

  it('retry when it fails after removing variants from matching products', async () => {
    sinon.stub(reassignment, '_createVariantsInCtpProductToUpdate')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([productDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    return checkResult()
  })

  it('retry when it fails after moving variants into ctpProductToUpdate', async () => {
    sinon.stub(reassignment, '_removeVariantsFromCtpProductToUpdate')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([productDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    return checkResult()
  })

  it('retry when it fails after removing variants from ctpProductToUpdate', async () => {
    sinon.stub(reassignment.productService, 'createProduct')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([productDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    return checkResult()
  })

  it('retry when it fails after anonymizing old variants from ctpProductToUpdate', async () => {
    sinon.stub(reassignment, '_ensureSlugUniqueness')
      .onFirstCall().rejects('test error')
      .callThrough()

    await reassignment.execute([productDraft], [product1, product2])

    expect(spyError.callCount).to.equal(1)
    expect(spyError.firstCall.args[0])
      .to.contain('Error while processing productDraft')
    expect(spyError.firstCall.args[2])
      .to.contain('test error')

    return checkResult()
  })
})
