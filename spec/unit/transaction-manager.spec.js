import { expect } from 'chai'

import * as utils from '../utils/helper'
import TransactionManager from '../../lib/services/transaction-manager'

describe('TransactionManager', () => {
  let transactionService = null

  beforeEach(() => {
    transactionService = new TransactionManager(utils.logger, {})
  })

  it('should generate transaction key from productId', () => {
    const key = transactionService._getTransactionKey(123)
    const [productId, time] = key.split('-')

    expect(productId).to.equal('123')
    expect(Number(time)).to.be.most(+new Date())
  })
})
