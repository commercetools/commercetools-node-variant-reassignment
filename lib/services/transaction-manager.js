import Promise from 'bluebird'
import * as constants from '../constants'

export default class TransactionManager {
  constructor (logger, client) {
    this.client = client
    this.logger = logger.child({ service: 'transactionManager' })
  }

  _getTransactionKey (productId) {
    return `${productId}-${+new Date()}`
  }

  createTransaction (productId, transaction) {
    const customObject = {
      container: constants.TRANSACTION_CONTAINER,
      key: this._getTransactionKey(productId),
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
    const transaction = await this.getTransaction(key)

    if (transaction)
      return this.client.customObjects
        .byId(transaction.id)
        .delete(transaction.version)

    return Promise.resolve()
  }
}
