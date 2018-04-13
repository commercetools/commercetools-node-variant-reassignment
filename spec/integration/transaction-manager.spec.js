import _ from 'lodash'
import { expect } from 'chai'

import * as utils from '../utils/helper'
import * as constants from '../../lib/constants'
import TransactionManager from '../../lib/services/transaction-manager'

describe('TransactionManager', () => {
  let ctpClient = null
  let transactionService = null

  before(async () => {
    ctpClient = await utils.createClient()
    transactionService = new TransactionManager(ctpClient)

    await utils.deleteResource(ctpClient.customObjects)
  })

  afterEach(() =>
    utils.deleteResource(ctpClient.customObjects)
  )

  it('should fetch no transactions', async () => {
    const transactions = await transactionService.getTransactions()
    expect(transactions).to.have.lengthOf(0)
  })

  it('should load all unfinished transactions from API', async () => {
    await ctpClient.customObjects.create({
      key: '1',
      container: constants.TRANSACTION_CONTAINER,
      value: 1
    })
    await ctpClient.customObjects.create({
      key: '2',
      container: constants.TRANSACTION_CONTAINER,
      value: 1
    })
    await ctpClient.customObjects.create({
      key: '3',
      container: constants.TRANSACTION_CONTAINER,
      value: 1
    })
    await ctpClient.customObjects.create({
      key: '4',
      container: constants.TRANSACTION_CONTAINER,
      value: 1
    })

    const transactions = await transactionService.getTransactions()

    expect(transactions).to.be.an('array')
    expect(transactions).to.have.lengthOf(4)
    const keys = _.map(transactions, 'key').sort()
    expect(keys).to.deep.equal(['1', '2', '3', '4'])
  })

  it('should create a transaction on API', async () => {
    const transaction = {
      info: 'transactionInfo',
      actions: []
    }

    const createdTransaction = await transactionService.createTransaction(transaction)

    expect(createdTransaction.container).to.equal(
      constants.TRANSACTION_CONTAINER
    )
    expect(createdTransaction.value).to.deep.equal(transaction)

    const { body: { results: transactions } } = await ctpClient
      .customObjects
      .fetch()

    expect(transactions).to.have.lengthOf(1)
    expect(transactions[0].key).to.equal(createdTransaction.key)
  })

  it('should delete a transaction on API', async () => {
    await transactionService.createTransaction({}, 'produtId1')

    const transaction = await transactionService.createTransaction({})

    const transactionsBefore = await transactionService.getTransactions()
    expect(transactionsBefore).to.have.lengthOf(2)

    await transactionService.deleteTransaction(transaction.key)
    const transactionsAfter = await transactionService.getTransactions()
    expect(transactionsAfter).to.have.lengthOf(1)
  })
})
