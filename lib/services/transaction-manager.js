import Promise from 'bluebird'
import * as constants from '../constants'

/**
 * This service provides methods for working with transactions.
 * Transaction is an object saved in CTP customObjects and contains information
 * about variant reassignment process. If the reassignment fails we use
 * transaction to recover modified product and its variants.
 */
export default class TransactionManager {
  constructor (logger, client) {
    this.client = client
    this.logger = logger.child({ service: 'transactionManager' })
  }

  createTransaction (transaction) {
    return this.upsertTransactionByKey(transaction, `${+new Date()}`)
  }

  upsertTransactionByKey (transaction, key) {
    const customObject = {
      container: constants.TRANSACTION_CONTAINER,
      key,
      value: transaction
    }

    return this.client.customObjects
      .create(customObject)
      .then(res => res.body)
  }

  getTransaction (key) {
    const predicate = `container = "${constants.TRANSACTION_CONTAINER}"`
      + ` AND key = "${key}"`

    return this.client.customObjects
      .where(predicate)
      .fetch()
      .then(res => res.body.results[0])
  }

  getTransactions () {
    const predicate = `container = "${constants.TRANSACTION_CONTAINER}"`

    return this.client.customObjects
      .where(predicate)
      .fetch()
      .then(res => res.body.results)
  }

  async deleteTransaction (key) {
    this.logger.debug('Removing transaction with key "%s"', key)
    const transaction = await this.getTransaction(key)

    if (transaction)
      return this.client.customObjects
        .byId(transaction.id)
        .delete(transaction.version)

    return Promise.resolve()
  }
}
