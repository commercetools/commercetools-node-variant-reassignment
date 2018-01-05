import { expect } from 'chai'
import _ from 'lodash'
import sinon from 'sinon'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'

describe('Reassignment error', () => {
  let ctpClient
  let product1
  let product2
  let productDraft
  let reassignment
  let logger
  let spyError

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
        }
      ]
    }
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('should fail when process unfinished transaction fails', async () => {
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

  it('should fail when process can\'t load existing products', async () => {
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

  it('should retry when reassignment fails before creating transaction', async () => {
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

    const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
    expect(results).to.have.lengthOf(3)
    const backupProduct = results.find(product => product.masterVariant.sku === '4')
    expect(backupProduct).to.be.an('object')
    expect(backupProduct.variants).to.have.lengthOf(0)
    const updatedProduct = results.find(product => product.masterVariant.sku === '1')
    expect(updatedProduct.variants[0].sku).to.equal(productDraft.variants[0].sku)

    const anonymizedProduct = results.find(product => product.masterVariant.sku === '2')
    expect(anonymizedProduct).to.be.an('object')
    expect(anonymizedProduct.slug).to.haveOwnProperty('ctsd')
  })

  it('should retry only once when reassignment fails before creating transaction', async () => {
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
})
