import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCOP } from '../src/utils/currency.js'

test('formatea COP sin espacio entre el símbolo y la cifra', () => {
  assert.equal(formatCOP(40000), '$40.000')
  assert.equal(formatCOP(46500), '$46.500')
  assert.equal(formatCOP(136000), '$136.000')
})

test('no aplica decimales ni valores infinitos', () => {
  assert.equal(formatCOP(1200.4), '$1.200')
  assert.equal(formatCOP(undefined), '$0')
  assert.equal(formatCOP(Infinity), '$0')
})
