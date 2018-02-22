import _asyncToGenerator from 'babel-runtime/helpers/asyncToGenerator';
import Promise from 'bluebird';
import * as constants from '../constants';

/**
 * This service provides methods for working with transactions.
 * Transaction is an object saved in CTP customObjects and contains information
 * about variant reassignment process. If the reassignment fails we use
 * transaction to recover modified product and its variants.
 */
export default class TransactionManager {
  constructor(logger, client) {
    this.client = client;
    if (logger.child) this.logger = logger.child({ service: 'transactionManager' });else this.logger = logger;
  }

  createTransaction(transaction) {
    return this.upsertTransactionByKey(transaction, `${+new Date()}`);
  }

  upsertTransactionByKey(value, key) {
    const customObject = {
      container: constants.TRANSACTION_CONTAINER,
      key,
      value
    };

    return this.client.customObjects.create(customObject).then(res => res.body);
  }

  getTransaction(key) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const transactionObject = yield _this.getTransactionObject(key);
      return transactionObject && transactionObject.value;
    })();
  }

  getTransactionObject(key) {
    const predicate = `container = "${constants.TRANSACTION_CONTAINER}"` + ` AND key = "${key}"`;

    return this.client.customObjects.where(predicate).fetch().then(res => res.body.results[0]);
  }

  getTransactions() {
    const predicate = `container = "${constants.TRANSACTION_CONTAINER}"`;

    return this.client.customObjects.where(predicate).fetch().then(res => res.body.results);
  }

  deleteTransaction(key) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      _this2.logger.debug('Removing transaction with key "%s"', key);
      const transaction = yield _this2.getTransactionObject(key);

      if (transaction) return _this2.client.customObjects.byId(transaction.id).delete(transaction.version);

      return Promise.resolve();
    })();
  }
}