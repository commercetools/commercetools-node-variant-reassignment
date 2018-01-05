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
})
