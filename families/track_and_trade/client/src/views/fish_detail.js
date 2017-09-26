/**
 * Copyright 2017 Intel Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */
'use strict'

const m = require('mithril')
const moment = require('moment')
const truncate = require('lodash/truncate')

const payloads = require('../services/payloads')
const transactions = require('../services/transactions')
const api = require('../services/api')
const {
  getPropertyValue,
  getLatestPropertyUpdateTime,
  getOldestPropertyUpdateTime,
  isReporter
} = require('../utils/records')

const _labelProperty = (label, value) => [
  m('dl',
    m('dt', label),
    m('dd', value))
]

const TransferDropdown = {
  oninit (vnode) {
    let publicKey = api.getPublicKey()
    vnode.state.agents = []
    api.get('agents').then(agents => {
      vnode.state.agents = agents.filter((agent) => agent.key !== publicKey)
    })
  },

  view (vnode) {
    // Default to no-op
    let handleSelected = vnode.attrs.handleSelected || (() => null)
    return [
      m('.dropdown',
        m('button.btn.btn-primary.btn-block.dropdown-toggle.text-left',
          { 'data-toggle': 'dropdown' },
          vnode.children),
        m('.dropdown-menu',
          vnode.state.agents.map(agent =>
            m("a.dropdown-item[href='#']", {
              onclick: (e) => {
                e.preventDefault()
                handleSelected(agent.key)
              }
            }, m('span.text-truncate',
                 truncate(agent.name, { length: 32 }))))))
    ]
  }
}

const _agentLink = (agent) =>
  m(`a[href=/agents/${agent.publicKey}]`,
    { oncreate: m.route.link },
    agent.name)

const ReportLocation = {
  view: (vnode) =>
    m('form', {
      onsubmit: (e) => {
        e.preventDefault()
        _updateProperty(vnode.attrs.record, {
          name: 'location',
          locationValue: {
            latitude: parseFloat(vnode.state.latitude),
            longitude: parseFloat(vnode.state.longitude)
          },
          dataType: payloads.updateProperties.enum.LOCATION
        })
      }
    },
    m('.form-row',
      m('.form-group.col-5',
        m('label.sr-only', { 'for': 'latitude' }, 'Latitude'),
        m("input.form-control[type='text']", {
          name: 'latitude',
          onchange: m.withAttr('value', (value) => {
            vnode.state.latitude = value
          }),
          value: vnode.state.latitude,
          placeholder: 'Latitude'
        })),

      m('.form-group.col-5',
        m('label.sr-only', { 'for': 'longitude' }, 'Longitude'),
        m("input.form-control[type='text']", {
          name: 'longitude',
          onchange: m.withAttr('value', (value) => {
            vnode.state.longitude = value
          }),
          value: vnode.state.longitude,
          placeholder: 'Longitude'
        })),

      m('.col-2',
        m('button.btn.btn-primary', 'Update'))))
}

const ReportValue = {
  view: (vnode) => {
    let xform = vnode.attrs.xform || ((x) => x)
    return [
      m('form', {
        onsubmit: (e) => {
          e.preventDefault()
          _updateProperty(vnode.attrs.record, {
            name: vnode.attrs.name,
            [vnode.attrs.typeField]: xform(vnode.state.value),
            dataType: vnode.attrs.type
          })
        }
      },
        m('.form-row',
          m('.form-group.col-10',
            m('label.sr-only', { 'for': vnode.attrs.name }, vnode.attrs.label),
            m("input.form-control[type='text']", {
              name: vnode.attrs.name,
              onchange: m.withAttr('value', (value) => {
                vnode.state.value = value
              }),
              value: vnode.state.value,
              placeholder: vnode.attrs.label
            })),
         m('.col-2',
           m('button.btn.btn-primary', 'Update'))))
    ]
  }
}

const FishDetail = {
  oninit (vnode) {
    api.get(`records/${vnode.attrs.recordId}`)
    .then(record =>
      Promise.all([
        record,
        api.get(`agents/${record.owner}`),
        api.get(`agents/${record.custodian}`)]))
    .then(([record, owner, custodian]) => {
      vnode.state.record = record
      vnode.state.owner = owner
      vnode.state.custodian = custodian
    })
  },

  view (vnode) {
    if (!vnode.state.record) {
      return m('.alert-warning', `Loading ${vnode.attrs.recordId}`)
    }

    let publicKey = api.getPublicKey()
    let owner = vnode.state.owner
    let custodian = vnode.state.custodian
    let record = vnode.state.record
    return [
      m('.fish-detail',
        m('h1.text-center', record.recordId),
        m('.row',
          m('.col',
            _labelProperty('Created',
                           _formatTimestamp(getOldestPropertyUpdateTime(record)))),
          m('.col',
            _labelProperty('Updated',
                           _formatTimestamp(getLatestPropertyUpdateTime(record))))),

        m('.row',
          m('.col',
            _labelProperty(
              'Owner', _agentLink(owner))),
          (owner.publicKey === publicKey
           ? m('.col',
               m(TransferDropdown, {
                 handleSelected: _doTransfer(record, payloads.createProposal.enum.OWNER)
               }, 'Transfer Ownership'))
           : '')),
        m('.row',
          m('.col',
            _labelProperty('Custodian', _agentLink(custodian))),
          (custodian.publicKey === publicKey
           ? m('.col',
               m(TransferDropdown, {
                 handleSelected: _doTransfer(record, payloads.createProposal.enum.CUSTODIAN)
               }, 'Transfer Custodianship'))
           : '')),
        m('.row',
          m('.col',
            _labelProperty('Species', getPropertyValue(record, 'species')))),

        m('.row',
          m('.col',
            _labelProperty('Length (cm)', getPropertyValue(record, 'length'))),
          m('.col',
            _labelProperty('Weight (kg)', getPropertyValue(record, 'weight')))),

        m('.row',
          m('.col',
            _labelProperty('Location', _formatLocation(getPropertyValue(record, 'location')))),
          (isReporter(record, 'location', publicKey)
           ? m('.col', m(ReportLocation, { record }))
          : '')),

        m('.row',
          m('.col',
            _labelProperty('Temperature (C°)', getPropertyValue(record, 'temperature', 'Unknown'))),
          (isReporter(record, 'temperature', publicKey)
           ? m('.col', m(ReportValue,
             {
               name: 'temperature',
               label: 'Temperature (C°)',
               record,
               typeField: 'intValue',
               type: payloads.updateProperties.enum.INT,
               xform: (x) => parseInt(x)
             }))
          : '')),

        m('.row',
          m('.col',
            _labelProperty('Tilt', getPropertyValue(record, 'tilt', 'Unknown'))),
          (isReporter(record, 'tilt', publicKey)
           ? m('.col', m(ReportValue, {
             name: 'tilt',
             label: 'Tilt',
             record,
             typeField: 'stringValue',
             type: payloads.updateProperties.enum.STRING
           }))
           : '')),

        m('.row',
          m('.col',
            _labelProperty('Shock', getPropertyValue(record, 'shock', 'Unknown'))),
          (isReporter(record, 'shock', publicKey)
           ? m('.col', m(ReportValue, {
             name: 'shock',
             label: 'Shock',
             record,
             typeField: 'stringValue',
             type: payloads.updateProperties.enum.STRING
           }))
           : '')),

        ((record.owner === publicKey && !record.final)
         ? m('.row.mb-3',
             m('.col.text-center',
               m('button.btn.btn-danger', {
                 onclick: (e) => {
                   e.preventDefault()
                   _finalizeRecord(record)
                 }
               },
               'Finalize')))
         : '')
       )
    ]
  }
}

const _formatLocation = (location) => {
  if (location && location.latitude && location.longitude) {
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
  } else {
    return 'Unknown'
  }
}

const _formatTimestamp = (sec) => {
  if (!sec) {
    sec = Date.now() / 1000
  }
  return moment.unix(sec).format('YYYY-MM-DD')
}

const _doTransfer = (record, role) => (publicKey) => {
  let transferPayload = payloads.createProposal({
    recordId: record.recordId,
    receivingAgent: publicKey,
    role: role
  })

  transactions.submit([transferPayload]).then(() => {
    console.log('Successfully submitted proposal')
  })
}

const _updateProperty = (record, value) => {
  let updatePayload = payloads.updateProperties({
    recordId: record.recordId,
    properties: [value]
  })

  transactions.submit([updatePayload]).then(() => {
    console.log('Successfully submitted property update')
  })
}

const _finalizeRecord = (record) => {
  let finalizePayload = payloads.finalizeRecord({
    recordId: record.recordId
  })

  transactions.submit([finalizePayload]).then(() => {
    console.log('finalized')
  })
}

module.exports = FishDetail