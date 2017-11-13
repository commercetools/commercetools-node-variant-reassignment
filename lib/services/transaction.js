import Promise from 'bluebird'
import * as constants from '../constants'

export default class Transaction {
  constructor (client) {
    this.client = client
  }

  getObjects (condition) {
    return this.client.customObjects
      .where(condition || '')
      .fetch()
      .then(res => res.body.results)
  }

  getObject (condition) {
    return this.getObjects(condition)
      .then(res => res.body.results[0])
  }

  setObject (object) {
    return this.client.customObjects
      .create(object)
      .then(res => res.body)
  }

  deleteObjectByKey (key) {
    return this.getObject(`key='${key}'`)
      .then(item => (
        item
          ? this.client.customObjects
            .byId(item.id)
            .delete(item.version)
          : Promise.resolve()
      ))
  }

  getObjectsByKey (key) {
    return this.getObjects(`key='${key}'`)
  }

  getObjectsByContainer (container) {
    return this.getObjects(`container='${container}'`)
  }

  setObjectByKey (value, key) {
    return this.setObject({
      key,
      value,
      container: constants.TRANSACTION_CONTAINER,
    })
      .then(res => res.value)
  }
}
