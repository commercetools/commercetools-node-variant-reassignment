import Promise from 'bluebird'
import * as constants from '../constants'

import log from '../services/logger'

/**
 * This service provides methods for working with transactions.
 * Transaction is an object saved in CTP customObjects and contains information
 * about variant reassignment process. If the reassignment fails we use
 * transaction to recover modified product and its variants.
 */
export default class TransactionManager {
  constructor (client) {
    this.client = client
  }

  createTransaction (transaction) {
    return this.upsertTransactionByKey(transaction, `${+new Date()}`)
  }

  upsertTransactionByKey (value, key) {
    const customObject = {
      container: constants.TRANSACTION_CONTAINER,
      key,
      value
    }

    return this.client.customObjects
      .create(customObject)
      .then(res => res.body)
  }

  async getTransaction (key) {
    const transactionObject = await this.getTransactionObject(key)
    return transactionObject && transactionObject.value
  }

  getTransactionObject (key) {
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
    log(`Removing transaction with key "${key}"`)
    const transaction = await this.getTransactionObject(key)

    if (transaction)
      return this.client.customObjects
        .byId(transaction.id)
        .delete(transaction.version)

    return Promise.resolve()
  }
}
