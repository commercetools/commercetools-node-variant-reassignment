import { expect } from 'chai'

import * as utils from '../../utils/helper'
import Transaction from '../../../lib/services/transaction'

let sphereClient = null

describe('Transaction', () => {
  let transactionService = null

  before(() =>
    utils.createClient()
      .then((client) => {
        sphereClient = client
        transactionService = new Transaction(client, utils.logger)
      })
  )

  beforeEach(() => {
    utils.deleteResource(sphereClient.customObjects)
  })

  after(() =>
    utils.deleteResource(sphereClient.customObjects)
  )

  it('should fetch no customObjects', () => {
    transactionService.getObjects()
      .then((customObjects) => {
        expect(customObjects).to.have.lengthOf(0)
      })
  })
})
